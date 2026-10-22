# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
# NOTE: keep exactly two header lines above (version, then Depends) with nothing between
# them and the imports; Studio (GenVM v0.2.16) rejects the file otherwise (invalid_contract).
import hashlib
import json
from datetime import datetime, timezone

MAX_REQS = 8
MAX_ID = 64
MAX_SOURCE = 1500


def source_hash(text: str) -> str:
    """Same hash the oracle uses: a ruling binds this policy only if it was made against exactly this committed text."""
    return hashlib.sha256(text.strip().encode("utf-8")).hexdigest()


def release_from_signals(signals: list, wants: list, min_clarity: int) -> int:
    """Share (0-100) of a policy that the Concordance signals justify releasing: each required proposition pays its
    clarity (weighted) iff validators ratified a lean the wanted way that clears min_clarity. A proposition ruled on the
    exact text the policy committed to has clarity 100. Anything unratified pays nothing."""
    total = sum(s["weight"] for s in signals) or 1
    got = 0
    for s, want in zip(signals, wants):
        if s.get("status") not in ("RATIFIED", "RULED"):
            continue  # defence in depth: only a ratified outcome or a ruling on the committed text can ever pay
        if s["lean"] == want and s["clarity"] >= min_clarity:
            got += s["weight"] * s["clarity"]
    return (got + total // 2) // total


@gl.evm.contract_interface
class _Recipient:
    class View:
        pass

    class Write:
        pass


@gl.contract_interface
class _Concordance:
    """The only things this contract needs from Concordance: two cheap views."""

    class View:
        def get_signal(self, inquiry_id: str, prop_index: int, source_hash: str): ...
        def get_status(self, inquiry_id: str): ...

    class Write:
        pass


class ConcordanceGate(gl.Contract):
    """A consumer of the Concordance oracle: a conditional payout policy whose trigger is not a yes/no answer but the
    graded, possibly contested world model another contract maintains. Nothing here is specific to one inquiry."""

    concordance: str  # address of the Concordance contract this gate trusts
    policies: TreeMap[str, str]
    policy_ids: DynArray[str]

    def __init__(self, concordance: str) -> None:
        if not (concordance.startswith("0x") and len(concordance) == 42):
            raise gl.vm.UserError("concordance must be a 0x address")
        self.concordance = concordance

    def _oracle(self):
        return _Concordance(Address(self.concordance))

    def _now(self) -> int:
        return int(datetime.now(timezone.utc).timestamp())

    def _policy(self, policy_id: str) -> dict:
        return json.loads(self.policies[policy_id]) if policy_id in self.policies else {}

    @gl.public.write.payable
    def open_policy(self, policy_id: str, inquiry_id: str, beneficiary: str,
                    req_props: list[int], req_wants: list[str], min_clarity: int, req_sources: list[str]) -> None:
        """`req_sources`: per required proposition, the exact governing text a ruling may use ("" = rulings never count).
        It is hashed and fixed at funding; a ruling on any other text cannot release this policy's money."""
        policy_id = policy_id.strip()
        if not policy_id or len(policy_id) > MAX_ID or policy_id in self.policies:
            raise gl.vm.UserError("policy_id missing or duplicate")
        if not 1 <= len(req_props) <= MAX_REQS or len(req_props) != len(req_wants) or len(set(req_props)) != len(req_props):
            raise gl.vm.UserError("one distinct proposition per want, 1-%d of them" % MAX_REQS)
        wants = [w.strip().upper() for w in req_wants]
        if any(w not in ("TRUE", "FALSE") for w in wants) or any(i < 0 for i in req_props):
            raise gl.vm.UserError("bad requirement")
        sources = [t.strip() for t in req_sources]
        if len(sources) != len(req_props) or any(len(t) > MAX_SOURCE for t in sources):
            raise gl.vm.UserError("one committed source (or \"\") per required proposition, <= %d chars" % MAX_SOURCE)
        if min_clarity < 0 or min_clarity > 100:
            raise gl.vm.UserError("min_clarity must be 0-100")
        if not (beneficiary.startswith("0x") and len(beneficiary) == 42):
            raise gl.vm.UserError("beneficiary must be a 0x address")
        value = int(gl.message.value)
        if value <= 0:
            raise gl.vm.UserError("send a non-zero value")
        status_raw = self._oracle().view().get_status(inquiry_id)  # cross-contract read
        if not status_raw:
            raise gl.vm.UserError("unknown inquiry on the Concordance contract")
        if json.loads(status_raw)["status"] == "CLOSED":
            raise gl.vm.UserError("inquiry is closed")
        self.policies[policy_id] = json.dumps({
            "inquiry_id": inquiry_id, "funder": str(gl.message.sender_address), "beneficiary": beneficiary,
            "req_props": req_props, "req_wants": wants, "min_clarity": min_clarity,
            "req_sources": sources, "req_hashes": [source_hash(t) if t else "" for t in sources],
            "escrow": value, "paid": 0, "status": "OPEN", "history": [],
        })
        self.policy_ids.append(policy_id)

    @gl.public.write
    def claim(self, policy_id: str) -> str:
        """Anyone may trigger it. Reads the live Concordance signals and pays only the increment they justify."""
        pol = self._policy(policy_id)
        if not pol or pol["status"] != "OPEN":
            raise gl.vm.UserError("policy unknown or not open")
        oracle = self._oracle().view()
        signals = []
        for i, h in zip(pol["req_props"], pol["req_hashes"]):
            raw = oracle.get_signal(pol["inquiry_id"], i, h)  # cross-contract read: deterministic, no consensus needed
            if not raw:
                raise gl.vm.UserError("no signal yet: the inquiry has not been convened")
            signals.append(json.loads(raw))
        pct = release_from_signals(signals, pol["req_wants"], pol["min_clarity"])
        target = pol["escrow"] * pct // 100
        delta = max(0, target - pol["paid"])
        if delta <= 0:
            raise gl.vm.UserError("nothing further to release: no ratified outcome justifies it")
        pol["paid"] += delta  # effects before interactions
        pol["history"].append({"release_pct": pct, "paid_now": delta, "ruled": [i for i, s in zip(pol["req_props"], signals) if s.get("ruled")],
                               "basis": [s.get("status") for s in signals], "at": self._now()})
        self.policies[policy_id] = json.dumps(pol)
        _Recipient(Address(pol["beneficiary"])).emit_transfer(value=u256(delta))
        return json.dumps({"release_pct": pct, "paid_now": delta, "paid_total": pol["paid"], "reserved": pol["escrow"] - pol["paid"]})

    @gl.public.write
    def refund(self, policy_id: str) -> str:
        """The funder reclaims what is still reserved once the inquiry can no longer gather evidence."""
        pol = self._policy(policy_id)
        if not pol or pol["status"] != "OPEN":
            raise gl.vm.UserError("policy unknown or not open")
        if str(gl.message.sender_address) != pol["funder"]:
            raise gl.vm.UserError("only the funder can refund")
        st = json.loads(self._oracle().view().get_status(pol["inquiry_id"]))
        if st["status"] != "CLOSED" and st["round"] < st["max_rounds"]:
            raise gl.vm.UserError("inquiry still open to new evidence")
        remainder = pol["escrow"] - pol["paid"]
        pol["status"] = "CLOSED"
        self.policies[policy_id] = json.dumps(pol)
        if remainder > 0:
            _Recipient(Address(pol["funder"])).emit_transfer(value=u256(remainder))
        return json.dumps({"refunded": remainder})

    @gl.public.view
    def get_policy(self, policy_id: str) -> str:
        return self.policies[policy_id] if policy_id in self.policies else ""

    @gl.public.view
    def get_concordance(self) -> str:
        return self.concordance

    @gl.public.view
    def list_policies(self, offset: int, limit: int) -> str:
        out = []
        i = len(self.policy_ids) - 1 - max(0, offset)
        while i >= 0 and len(out) < max(0, min(limit, 50)):
            pid = self.policy_ids[i]
            p = self._policy(pid)
            out.append({"policy_id": pid, "inquiry_id": p["inquiry_id"], "status": p["status"], "escrow": p["escrow"], "paid": p["paid"]})
            i -= 1
        return json.dumps(out)
