"""Local tests for the consumer contract with a stubbed SDK. The cross-contract call is wired straight to a
Concordance instance, so these exercise the real signal -> release logic end to end, but NOT GenVM's cross-contract
machinery (verified separately on Studio; see docs/GATE.md)."""
import importlib.util
import json
import sys
import types
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import test_concordance as tc  # noqa: E402

ROOT = Path(__file__).parent.parent
SENT = []


def load_gate(remote):
    gl = types.SimpleNamespace()
    gl.Contract = type("Contract", (), {})

    def _write(f):
        return f

    _write.payable = lambda f: f
    gl.public = types.SimpleNamespace(view=lambda f: f, write=_write)
    gl.message = types.SimpleNamespace(sender_address="0xF", value=0)
    SENT.clear()

    class _Rec:
        def __init__(self, addr):
            self.addr = addr

        def emit_transfer(self, value):
            SENT.append((self.addr, value))

    class _Remote:
        def __init__(self, addr):
            self.addr = addr

        def view(self):
            return remote

    gl.evm = types.SimpleNamespace(contract_interface=lambda cls: _Rec)
    gl.contract_interface = lambda cls: _Remote
    gl.vm = types.SimpleNamespace(UserError=type("UserError", (Exception,), {}))
    mod = types.ModuleType("genlayer")
    mod.gl, mod.u256, mod.Address = gl, int, str
    mod.TreeMap = type("TreeMap", (dict,), {"__class_getitem__": classmethod(lambda c, k: c)})
    mod.DynArray = type("DynArray", (list,), {"__class_getitem__": classmethod(lambda c, k: c)})
    sys.modules["genlayer"] = mod
    spec = importlib.util.spec_from_file_location("concordance_gate", ROOT / "contracts" / "concordance_gate.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)

    class _DT:
        def timestamp(self):
            return 1000

    m.datetime = types.SimpleNamespace(now=lambda tz=None: _DT())
    return m, gl


class GateTests(unittest.TestCase):
    def setUp(self):
        # a real Concordance, convened so props: 0 agreed TRUE, 1 contested (leans TRUE, clarity 43), 2 deadlocked
        self.cm, self.cgl = tc._load()
        self.oracle = self.cm.Concordance()
        self.oracle.inquiries, self.oracle.inquiry_ids = self.cm.TreeMap(), self.cm.DynArray()
        self.oracle.actions, self.oracle.action_ids = self.cm.TreeMap(), self.cm.DynArray()
        self.oracle.rulings = self.cm.TreeMap()
        self.cgl.message.sender_address = "0xA"
        self.oracle.open_inquiry("i1", "What happened?", ["p one", "p two", "p three"], [5, 5, 5])
        self.oracle.submit_account("i1", "A", "yes", "", [])
        self.cgl.message.sender_address = "0xB"
        self.oracle.submit_account("i1", "B", "no", "", [])
        tc.STATE["llm"] = tc.llm_json([["A75", "A75"], ["A100", "D25"], ["A75", "D75"]])
        self.oracle.convene("i1")
        self.m, self.gl = load_gate(self.oracle)
        self.g = self.m.ConcordanceGate("0x" + "c" * 40)
        self.g.policies, self.g.policy_ids = self.m.TreeMap(), self.m.DynArray()
        self.sender("0xF", 1000)

    def sender(self, a, value=0):
        self.gl.message.sender_address, self.gl.message.value = a, value

    def open(self, props=(0, 1), wants=("TRUE", "TRUE"), minc=0):
        self.g.open_policy("p1", "i1", "0x" + "b" * 40, list(props), list(wants), minc)

    def test_constructor_validates_address(self):
        with self.assertRaises(self.gl.vm.UserError):
            self.m.ConcordanceGate("nope")

    def test_release_from_signals_pure(self):
        sig = [{"weight": 5, "lean": "TRUE", "clarity": 100}, {"weight": 5, "lean": "FALSE", "clarity": 60}]
        self.assertEqual(self.m.release_from_signals(sig, ["TRUE", "TRUE"], 0), 50)
        self.assertEqual(self.m.release_from_signals(sig, ["TRUE", "FALSE"], 0), 80)
        self.assertEqual(self.m.release_from_signals(sig, ["TRUE", "FALSE"], 70), 50)

    def test_open_policy_validation_and_cross_contract_check(self):
        with self.assertRaises(self.gl.vm.UserError):
            self.g.open_policy("p", "does-not-exist", "0x" + "b" * 40, [0], ["TRUE"], 0)  # oracle says unknown
        self.sender("0xF", 0)
        with self.assertRaises(self.gl.vm.UserError):
            self.open()  # no value
        self.sender("0xF", 10)
        with self.assertRaises(self.gl.vm.UserError):
            self.g.open_policy("p", "i1", "bad", [0], ["TRUE"], 0)
        with self.assertRaises(self.gl.vm.UserError):
            self.g.open_policy("p", "i1", "0x" + "b" * 40, [0, 0], ["TRUE", "TRUE"], 0)
        with self.assertRaises(self.gl.vm.UserError):
            self.g.open_policy("p", "i1", "0x" + "b" * 40, [0], ["MAYBE"], 0)

    def test_claim_pays_the_graded_share_and_never_twice(self):
        self.open()
        out = json.loads(self.g.claim("p1"))
        self.assertEqual(out["release_pct"], 72)  # (5*100 + 5*43) / 10
        self.assertEqual(SENT[-1], ("0x" + "b" * 40, 720))
        with self.assertRaises(self.gl.vm.UserError):
            self.g.claim("p1")

    def test_a_ruling_on_the_oracle_unlocks_the_gate(self):
        self.open(props=(2,), wants=("TRUE",))
        with self.assertRaises(self.gl.vm.UserError):
            self.g.claim("p1")  # deadlocked -> nothing releasable
        tc.STATE["llm"] = {"verdict": "HOLDS", "reason": "the clause covers it"}
        self.cgl.message.sender_address = "0xC"
        self.oracle.request_ruling("i1", 2, "Clause: it applies.", "")
        out = json.loads(self.g.claim("p1"))
        self.assertEqual((out["release_pct"], out["paid_now"]), (100, 1000))
        self.assertEqual(json.loads(self.g.get_policy("p1"))["history"][0]["ruled"], [2])

    def test_refund_only_funder_only_when_inquiry_cannot_improve_and_conserves_funds(self):
        self.open()
        self.g.claim("p1")
        with self.assertRaises(self.gl.vm.UserError):
            self.g.refund("p1")  # inquiry still open
        self.cgl.message.sender_address = "0xA"
        self.oracle.close_inquiry("i1")
        self.sender("0xNOT")
        with self.assertRaises(self.gl.vm.UserError):
            self.g.refund("p1")
        self.sender("0xF")
        self.assertEqual(json.loads(self.g.refund("p1"))["refunded"], 280)
        self.assertEqual(sum(v for _, v in SENT), 1000)
        with self.assertRaises(self.gl.vm.UserError):
            self.g.refund("p1")

    def test_open_policy_rejected_on_closed_inquiry(self):
        self.cgl.message.sender_address = "0xA"
        self.oracle.close_inquiry("i1")
        with self.assertRaises(self.gl.vm.UserError):
            self.open()

    def test_list_policies(self):
        self.open()
        self.assertEqual(json.loads(self.g.list_policies(0, 10))[0]["policy_id"], "p1")


if __name__ == "__main__":
    unittest.main()
