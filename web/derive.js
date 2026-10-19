/* Line-for-line mirror of derive_record / records_equivalent / release_fraction in contracts/concordance.py.
   tests/test_concordance.py runs both implementations on the same fixtures and fails on any difference,
   so what the demo shows is computed by the contract's own rules, not drawn by hand. */
(function (root) {
  var AGREE_MAX = 20, WEAK_SUPPORT = 50, VOICE_FLOOR = 25, INJECTION_STRENGTH_CAP = 25;
  var INDEX_TOLERANCE = 20, CLASS_MATCH_NUM = 3, CLASS_MATCH_DEN = 7;
  var fl = Math.floor;

  function deriveRecord(weights, reading, flagged) {
    var nParties = reading.rows.length ? reading.rows[0].cells.length : 0;
    var props = [];
    reading.rows.forEach(function (row, i) {
      var cells = [], a = 0, d = 0, support = 0;
      row.cells.forEach(function (c, j) {
        var s = c.strength;
        if (flagged.indexOf(j) >= 0 && s > INJECTION_STRENGTH_CAP) s = INJECTION_STRENGTH_CAP;
        cells.push({ stance: c.stance, strength: s });
        if (c.stance === "AFFIRMS") { a += s + VOICE_FLOOR; support += s; }
        else if (c.stance === "DENIES") { d += s + VOICE_FLOOR; support += s; }
      });
      var total = a + d;
      var divergence = total ? fl((200 * Math.min(a, d)) / total) : 0;
      var status, lean, clarity;
      if (support < WEAK_SUPPORT) { status = "UNSUPPORTED"; lean = "NONE"; clarity = 0; }
      else {
        lean = a > d ? "TRUE" : (d > a ? "FALSE" : "NONE");
        clarity = 100 - divergence;
        status = divergence <= AGREE_MAX ? (lean === "TRUE" ? "AGREED_TRUE" : "AGREED_FALSE") : "CONTESTED";
      }
      props.push({
        index: i, weight: weights[i], cells: cells, affirm: a, deny: d, divergence: divergence,
        status: status, lean: lean, clarity: clarity,
        cause: status === "CONTESTED" ? row.cause : "NONE",
        crux: status === "CONTESTED" ? row.crux : "",
        decisive: row.decisive
      });
    });
    var wsum = weights.reduce(function (x, y) { return x + y; }, 0) || 1;
    var acc = 0;
    props.forEach(function (p) { acc += p.weight * (p.status === "UNSUPPORTED" ? 100 : p.divergence); });
    var ambiguity = fl((acc + fl(wsum / 2)) / wsum);
    var alignment = [];
    for (var j = 0; j < nParties; j++) {
      var n = 0, ok = 0;
      props.forEach(function (p) {
        if (p.lean === "NONE") return;
        var st = p.cells[j].stance;
        if (st === "SILENT") return;
        n += 1;
        if ((st === "AFFIRMS") === (p.lean === "TRUE")) ok += 1;
      });
      alignment.push(n ? fl((100 * ok) / n) : null);
    }
    return {
      props: props, ambiguity: ambiguity, concordance: 100 - ambiguity,
      agreed: props.filter(function (p) { return p.status.indexOf("AGREED") === 0; }).length,
      contested: props.filter(function (p) { return p.status === "CONTESTED"; }).length,
      unsupported: props.filter(function (p) { return p.status === "UNSUPPORTED"; }).length,
      alignment: alignment, flagged: flagged.slice()
    };
  }

  function klass(p) { return p.status.indexOf("AGREED") === 0 ? "AGREED" : p.status; }
  function recordsEquivalent(a, b) {
    var n = a.props.length;
    if (n !== b.props.length || Math.abs(a.ambiguity - b.ambiguity) > INDEX_TOLERANCE) return false;
    var same = 0;
    for (var i = 0; i < n; i++) {
      var x = a.props[i], y = b.props[i];
      if (x.status.indexOf("AGREED") === 0 && y.status.indexOf("AGREED") === 0 && x.lean !== y.lean) return false;
      if (klass(x) === klass(y)) same += 1;
    }
    return same * CLASS_MATCH_DEN >= n * CLASS_MATCH_NUM;
  }

  function releaseFraction(props, reqProps, reqWants, minClarity) {
    var total = 0, got = 0;
    reqProps.forEach(function (i) { total += props[i].weight; });
    total = total || 1;
    reqProps.forEach(function (i, k) {
      var p = props[i];
      if (p.lean === reqWants[k] && p.clarity >= minClarity) got += p.weight * p.clarity;
    });
    return fl((got + fl(total / 2)) / total);
  }

  /* Leave-one-out robustness from a stored record alone: remove each party, re-derive, see what flips. */
  function fragility(record) {
    var props = record.props;
    if (!props.length) return { base_ambiguity: 0, parties: [], fragile_props: [], fragility: 0, pivotal: null };
    var weights = props.map(function (p) { return p.weight; }), nParties = props[0].cells.length;
    function rowsWithout(skip) {
      return { rows: props.map(function (p) {
        return { cells: p.cells.map(function (c, k) { return k === skip ? { stance: "SILENT", strength: 0 } : { stance: c.stance, strength: c.strength }; }), cause: "NONE", crux: "", decisive: [] };
      }) };
    }
    var base = deriveRecord(weights, rowsWithout(-1), []), per = [], fragile = {};
    for (var j = 0; j < nParties; j++) {
      var alt = deriveRecord(weights, rowsWithout(j), []), flips = [];
      for (var i = 0; i < props.length; i++) {
        if (klass(base.props[i]) !== klass(alt.props[i]) || base.props[i].lean !== alt.props[i].lean) { flips.push(i); fragile[i] = true; }
      }
      per.push({ party: j, ambiguity: alt.ambiguity, delta: alt.ambiguity - base.ambiguity, flips: flips });
    }
    var pivotal = null, bestF = 0, bestD = 0;
    per.forEach(function (e) {
      var f = e.flips.length, d = Math.abs(e.delta);
      if (f && (f > bestF || (f === bestF && d > bestD))) { bestF = f; bestD = d; pivotal = e.party; }
    });
    var fp = Object.keys(fragile).map(Number).sort(function (x, y) { return x - y; });
    return { base_ambiguity: base.ambiguity, parties: per, fragile_props: fp, fragility: fl((100 * fp.length) / props.length), pivotal: pivotal };
  }

  /* Effective record: a proposition with a final ruling is settled by it. verdicts: { index: "HOLDS"|"DOES_NOT_HOLD"|"UNDETERMINED" } */
  function applyRulings(record, verdicts) {
    var props = record.props.map(function (p) {
      var v = verdicts[p.index];
      if (v !== "HOLDS" && v !== "DOES_NOT_HOLD") return p;
      var q = {}; Object.keys(p).forEach(function (k) { q[k] = p[k]; });
      q.ruled = true; q.status_before = p.status; q.divergence_before = p.divergence;
      q.status = v === "HOLDS" ? "RULED_TRUE" : "RULED_FALSE"; q.lean = v === "HOLDS" ? "TRUE" : "FALSE"; q.divergence = 0; q.clarity = 100;
      return q;
    });
    var wsum = props.reduce(function (x, p) { return x + p.weight; }, 0) || 1, acc = 0;
    props.forEach(function (p) { acc += p.weight * (p.status === "UNSUPPORTED" ? 100 : p.divergence); });
    var amb = fl((acc + fl(wsum / 2)) / wsum), out = {};
    Object.keys(record).forEach(function (k) { out[k] = record[k]; });
    out.props = props; out.ambiguity = amb; out.concordance = 100 - amb;
    out.agreed = props.filter(function (p) { return p.status.indexOf("AGREED") === 0 || p.status.indexOf("RULED") === 0; }).length;
    out.contested = props.filter(function (p) { return p.status === "CONTESTED"; }).length;
    out.unsupported = props.filter(function (p) { return p.status === "UNSUPPORTED"; }).length;
    out.ruled = props.filter(function (p) { return p.ruled; }).length;
    return out;
  }

  var api = { deriveRecord: deriveRecord, recordsEquivalent: recordsEquivalent, releaseFraction: releaseFraction, fragility: fragility, applyRulings: applyRulings };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Concordance = api;
})(typeof window !== "undefined" ? window : globalThis);
