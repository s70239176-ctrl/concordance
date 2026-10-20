/* Concordance: the 90-second film. render(t) is a pure function of time, so frames are deterministic.
   Every number on screen is computed by web/derive.js from the scenario, or read from the recorded Studio results
   (web/real.js, web/rulings.js). Nothing here is hand-typed except words. */
(function () {
  var S = window.SCENARIO, C = window.Concordance, W = S.props.map(function (p) { return p.weight; }), NS = "http://www.w3.org/2000/svg";
  var RL = window.RULING, GT = window.GATE, R = window.REAL;
  var clamp = function (x, a, b) { a = a == null ? 0 : a; b = b == null ? 1 : b; return Math.max(a, Math.min(b, x)); };
  var seg = function (t, a, b) { return clamp((t - a) / (b - a)); };
  var eo = function (x) { return 1 - Math.pow(1 - x, 3); };
  var eio = function (x) { return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  var lerp = function (a, b, k) { return a + (b - a) * k; };
  var g = document.getElementById("g"), ui = document.getElementById("ui");
  function sv(tag, a, parent) { var e = document.createElementNS(NS, tag); for (var k in a) e.setAttribute(k, a[k]); (parent || g).appendChild(e); return e; }
  function hd(css, html, parent, cls) { var e = document.createElement("div"); if (cls) e.className = cls; css = css || ""; if (!/position\s*:/.test(css) && /(^|;)\s*(left|top)\s*:/.test(css)) css = "position:absolute;" + css; e.style.cssText = css; if (html != null) e.innerHTML = html; (parent || ui).appendChild(e); return e; }
  function vis(e, o) { e.style.opacity = o; e.style.display = o <= 0.002 ? "none" : "block"; }
  function T(parent, x, y, s, o) { o = o || {}; var e = sv("text", { x: x, y: y, fill: o.fill || "#ece6d8", "font-size": o.size || 18, "font-weight": o.weight || 400, "text-anchor": o.anchor || "start", "letter-spacing": o.ls || 0 }, parent); if (o.family) e.style.fontFamily = o.family; if (o.italic) e.style.fontStyle = "italic"; e.textContent = s; return e; }

  /* ---------- data, all computed ---------- */
  var rec = C.deriveRecord(W, S.rounds[1].reading, []);                 // round 2: ambiguity 38
  var ruledRec = C.applyRulings(rec, { 6: RL ? RL.verdict : "DOES_NOT_HOLD" });
  var frag = C.fragility(rec);
  var CAUSE = { FACTUAL: "different facts", DEFINITIONAL: "different meaning", TEMPORAL: "different clock", SCOPE: "different boundary" };
  var HUE = S.parties.map(function (p) { return p.hue; });
  function stColor(p) { if (p.status.indexOf("RULED") === 0) return "#ece6d8"; if (p.status === "UNSUPPORTED") return "#77736a"; if (p.status.indexOf("AGREED") === 0) return "#8fd19e"; return p.divergence >= 80 ? "#ff5d4d" : p.divergence >= 55 ? "#f08a3c" : "#e0b040"; }
  function stText(p) { if (p.status === "RULED_FALSE") return "RULED · DOES NOT HOLD"; if (p.status === "RULED_TRUE") return "RULED · HOLDS"; if (p.status === "AGREED_TRUE") return "AGREED · TRUE"; if (p.status === "AGREED_FALSE") return "AGREED · FALSE"; if (p.status === "UNSUPPORTED") return "UNSUPPORTED"; return p.lean === "NONE" ? "DEADLOCKED" : "CONTESTED · leans " + p.lean; }

  /* validators: same perturbation as the live demo, equivalence computed by the real rule */
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function perturb(reading, seed) { var rnd = rng(seed); return { rows: reading.rows.map(function (row) { return { cause: row.cause, crux: row.crux, decisive: row.decisive, cells: row.cells.map(function (c) { if (c.stance === "SILENT" || rnd() > 0.14) return c; var s = c.strength + (rnd() < .5 ? -25 : 25); return { stance: c.stance, strength: Math.max(0, Math.min(100, s)) }; }) }; }) }; }
  var MODELS = ["gpt-5.4", "gemini", "grok", "qwen", "mistral"];
  var vals = MODELS.map(function (m, k) { var r = k === 0 ? rec : C.deriveRecord(W, perturb(S.rounds[1].reading, 2000 + k * 37), []); return { model: m, rec: r, ok: k === 0 ? true : C.recordsEquivalent(rec, r) }; });

  /* ---------- the ambiguity timeline: drives the needle AND the soundtrack ---------- */
  function AMB(t) {
    if (t < 9.5) return 55 + 45 * eo(seg(t, 0.4, 8.5));
    if (t < 11) return 100;
    if (t < 17.6) { var k = eio(seg(t, 11, 17.6)); return clamp(lerp(100, 38, k) + 24 * Math.sin(t * 9.7) * (1 - seg(t, 12.5, 17.6)) + 10 * Math.sin(t * 23.1) * (1 - seg(t, 12.5, 17.6)), 0, 100); }
    if (t < 41.5) return 38;
    if (t < 45.2) return 38 + 15 * Math.sin(t * 8.3) * seg(t, 41.5, 42.5) * (1 - seg(t, 44, 45.2));
    if (t < 47.4) return lerp(38, ruledRec.ambiguity, eio(seg(t, 45.2, 47.4)));
    if (t < 84) return ruledRec.ambiguity;
    return lerp(ruledRec.ambiguity, 0, eio(seg(t, 84, 88)));
  }
  window.AMB = AMB;
  window.EVENTS = [];
  for (var i = 0; i < 16; i++) window.EVENTS.push({ t: 16.6 + i * 0.19, type: "tick" });
  window.EVENTS.push({ t: 9.4, type: "whoosh" }, { t: 24.9, type: "whoosh" }, { t: 36.0, type: "whoosh" }, { t: 51.9, type: "whoosh" }, { t: 63.9, type: "whoosh" }, { t: 77.9, type: "whoosh" },
    { t: 45.25, type: "chime" }, { t: 71.0, type: "chime" }, { t: 5.0, type: "thud" }, { t: 85.9, type: "chime" });

  var SCENES = [[0, "01 · the problem"], [9.5, "02 · the agreement map"], [25, "03 · why they disagree"], [36, "04 · a ruling"], [52, "05 · fragility"], [64, "06 · two contracts, one oracle"], [78, "07 · what failed first"], [86, ""]];
  var CAPS = [
    [0.5, 4.3, "One shipment. Four parties. <b>Four stories.</b>"],
    [4.5, 9.0, "A normal oracle crushes them into <b>one answer</b>."],
    [9.8, 14.0, "Concordance <b>keeps the disagreement</b>: what is settled, what is contested, and by how much."],
    [14.3, 19.0, "Five validators, <b>five different models</b>, each read every account on their own."],
    [19.4, 24.6, "They agree on a <b>small, bounded record</b>, the part that holds up on real validators."],
    [25.4, 29.6, "It also says <b>why</b> parties differ."],
    [29.9, 35.6, "Evidence can settle <b>facts</b>. No evidence settles <b>meaning</b>."],
    [36.3, 41.4, "When the dispute is about meaning, ask the clause <b>one narrow question</b>."],
    [41.8, 46.8, "Validators answer in <b>one word</b>. Consensus on one word is easy."],
    [47.3, 51.6, "The record updates. Ambiguity <b>38 → " + ruledRec.ambiguity + "</b>."],
    [52.4, 56.2, "Remove each party <b>in turn</b>."],
    [56.5, 63.4, "Before money moves, see which <b>single voice</b> the verdict hangs on."],
    [64.3, 68.4, "A <b>second contract</b> pays by the record."],
    [68.8, 74.0, "<b>43%</b> now. The rest after the ruling. No intermediary."],
    [74.3, 77.8, "The gate never changed. <b>The oracle did.</b>"],
    [78.3, 82.2, "We measured it. <b>The first design failed</b> on real validators."],
    [82.4, 85.8, "So we redesigned it, and we say <b>what is still open</b>."]
  ];
  window.CAPTIONS = CAPS;

  /* ---------- shared pieces ---------- */
  var capEl = document.getElementById("cap"), sceneLbl = document.getElementById("sceneLbl");

  // party cards (live across scenes 1-2)
  var QUOTES = ["“The hold was a port order.”", "“Nobody closed the port.”", "“We issued no hold.”", "“Notice 4471 exists.”"];
  var cards = S.parties.map(function (p, i) { var c = hd("--c:" + HUE[i] + ";width:255px;height:150px;padding:14px 16px;", '<h3>' + p.name + '</h3><div class="role">' + p.role + '</div><p>' + QUOTES[i] + '</p>', null, "card"); return c; });
  var CARD_A = [70, 365, 660, 955].map(function (x) { return { x: x, y: 130, w: 255, h: 150 }; });
  var NODE_B = [0, 1, 2, 3].map(function (i) { return { x: 40, y: 92 + i * 92, w: 240, h: 76 }; });

  // S1 funnel + answer
  var fun = sv("g", {}), funPaths = [0, 1, 2, 3].map(function (i) { return sv("path", { d: "M" + (CARD_A[i].x + 127) + ",290 C" + (CARD_A[i].x + 127) + ",380 640,370 640,430", fill: "none", stroke: HUE[i], "stroke-width": 3, "stroke-linecap": "round", pathLength: 1, "stroke-dasharray": 1, "stroke-dashoffset": 1 }, fun); });
  var ans = sv("g", {}); sv("rect", { x: 500, y: 420, width: 280, height: 120, fill: "#13151a", stroke: "#e0b040", "stroke-width": 2 }, ans);
  T(ans, 640, 505, "TRUE", { size: 78, anchor: "middle", family: "Fraunces,serif", weight: 400 });
  var ansLbl = hd("left:300px;width:680px;top:556px;text-align:center;font:500 13px var(--mono);letter-spacing:.2em;color:var(--muted);text-transform:uppercase", "a majority-vote oracle: one answer, no dissent kept");
  var hidden = hd("left:470px;width:340px;top:592px;text-align:center;font:700 14px var(--mono);letter-spacing:.18em;color:#16120a;background:#ff5d4d;padding:8px 0", "3 live disputes hidden");
  var kick1 = hd("left:70px;top:88px;font:500 13px var(--mono);letter-spacing:.26em;color:#e0b040;text-transform:uppercase", "a shipment arrives late. possibly warm.");

  // S2 map
  var mapG = sv("g", {});
  var PX = 280, QX = 760, QW = 470, QH = 44;
  var py = function (i) { return NODE_B[i].y + 38; }, qy = function (i) { return 88 + i * 52; };
  var ribbons = [], pods = [];
  rec.props.forEach(function (p, qi) { p.cells.forEach(function (c, pi) { if (c.stance === "SILENT") return;
    var y1 = py(pi) + (qi - 3) * 3, y2 = qy(qi) + QH / 2 + (pi - 1.5) * 5;
    var el = sv("path", { d: "M" + PX + "," + y1 + " C" + (PX + 200) + "," + y1 + " " + (QX - 200) + "," + y2 + " " + QX + "," + y2, fill: "none", stroke: c.stance === "AFFIRMS" ? "#4cc9c0" : "#ff7a59", "stroke-width": (1.2 + c.strength / 100 * 7).toFixed(1), "stroke-linecap": "round", pathLength: 1, "stroke-dasharray": 1, "stroke-dashoffset": 1, opacity: (0.4 + c.strength / 170).toFixed(2) }, mapG);
    ribbons.push({ el: el, qi: qi, pi: pi, strength: c.strength }); }); });
  S.props.forEach(function (pr, qi) { var p = rec.props[qi], col = stColor(p), grp = sv("g", {}, mapG);
    var box = sv("rect", { x: QX, y: qy(qi), width: QW, height: QH, fill: "#13151a", stroke: "#272a33", "stroke-width": 1.3 }, grp);
    var bar = sv("rect", { x: QX, y: qy(qi), width: 5, height: QH, fill: col }, grp);
    T(grp, QX + 18, qy(qi) + 19, pr.short, { size: 15.5, weight: 650 });
    var st = T(grp, QX + 18, qy(qi) + 36, stText(p), { size: 11, weight: 700, fill: col, ls: ".05em" });
    var dv = T(grp, QX + QW - 14, qy(qi) + 29, p.divergence + "%", { size: 21, weight: 700, fill: col, anchor: "end" });
    pods.push({ grp: grp, box: box, bar: bar, st: st, dv: dv, qi: qi }); });
  var valG = sv("g", {}), valEls = vals.map(function (v, k) {
    var x = 40 + k * 144, y = 466, grp = sv("g", {}, valG); sv("rect", { x: x, y: y, width: 132, height: 112, fill: "#13151a", stroke: "#3b3f4b", "stroke-width": 1 }, grp);
    var top = sv("rect", { x: x, y: y, width: 132, height: 3, fill: "#6e6a60" }, grp);
    T(grp, x + 10, y + 22, "V" + (k + 1) + " · " + v.model, { size: 11.5, fill: "#a8a395", family: "JetBrains Mono,monospace", weight: 600 });
    var bars = v.rec.props.map(function (p, j) { return sv("rect", { x: x + 10 + j * 16.5, y: y + 90, width: 12, height: 1, fill: stColor(p) }, grp); });
    var idx = T(grp, x + 10, y + 106, "index " + v.rec.ambiguity, { size: 10.5, fill: "#6e6a60", family: "JetBrains Mono,monospace" });
    var mk = T(grp, x + 122, y + 106, v.ok ? "✓ agrees" : "✗ differs", { size: 10.5, fill: v.ok ? "#8fd19e" : "#ff5d4d", family: "JetBrains Mono,monospace", weight: 700, anchor: "end" });
    return { grp: grp, top: top, bars: bars, idx: idx, mk: mk, v: v, y: y }; });
  var tuner = sv("g", {});
  var numEl = T(tuner, 800, 516, "100", { size: 72, family: "Fraunces,serif", weight: 300 });
  T(tuner, 800, 542, "AMBIGUITY INDEX", { size: 11, fill: "#a8a395", family: "JetBrains Mono,monospace", weight: 600, ls: "2.2" });
  var trackG = sv("g", {}, tuner); sv("defs", {}, trackG).innerHTML = '<linearGradient id="gr" x1="0" x2="1"><stop offset="0" stop-color="#8fd19e" stop-opacity=".6"/><stop offset=".55" stop-color="#e0b040" stop-opacity=".6"/><stop offset="1" stop-color="#ff5d4d" stop-opacity=".75"/></linearGradient>';
  sv("rect", { x: 800, y: 560, width: 430, height: 7, fill: "url(#gr)", stroke: "#3b3f4b" }, tuner);
  for (var tk = 0; tk <= 10; tk++) sv("line", { x1: 800 + tk * 43, y1: 570, x2: 800 + tk * 43, y2: 577, stroke: "#3b3f4b" }, tuner);
  T(tuner, 800, 594, "CONCORD", { size: 10, fill: "#6e6a60", family: "JetBrains Mono,monospace", ls: "2" });
  T(tuner, 1230, 594, "DISCORD", { size: 10, fill: "#6e6a60", family: "JetBrains Mono,monospace", ls: "2", anchor: "end" });
  var needle = sv("g", {}, tuner); sv("polygon", { points: "-7,-14 7,-14 0,-1", fill: "#ece6d8" }, needle); sv("line", { x1: 0, y1: -2, x2: 0, y2: 12, stroke: "#ece6d8", "stroke-width": 2 }, needle);
  var tally = T(tuner, 1230, 520, "", { size: 13, fill: "#a8a395", family: "JetBrains Mono,monospace", anchor: "end" });

  // S3 triage rows
  var triG = hd("left:0;top:0;width:1280px;height:720px", "");
  var TRI = [3, 4, 5, 6].map(function (qi, i) { var p = rec.props[qi], fix = p.cause !== "DEFINITIONAL";
    var row = hd("left:110px;top:" + (96 + i * 118) + "px;width:1060px;height:104px;border-top:1px solid var(--rule2);padding-top:10px", '<div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font:500 28px var(--serif)">' + S.props[qi].short + '</span><span style="font:600 22px var(--mono);color:#e0b040">' + p.divergence + '%</span></div>'
      + '<div style="font:italic 400 18px/1.4 var(--serif);color:var(--muted);margin:4px 0 8px">' + p.crux + '</div>'
      + '<span style="font:600 11px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--rule2);margin-right:14px">' + (CAUSE[p.cause] || "") + '</span>'
      + '<span style="font:600 11px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:' + (fix ? "#4cc9c0" : "#ff7a59") + ';border-bottom:1px solid ' + (fix ? "#4cc9c0" : "#ff7a59") + '">' + (fix ? "more evidence can settle this" : "needs a ruling") + '</span>', triG);
    return { row: row, fix: fix }; });

  // S4 ruling
  var rulG = hd("left:0;top:0;width:1280px;height:720px", "");
  var clauseText = (RL ? RL.clause_short : "").replace("formal order", "<em>formal order</em>").replace("is not subject to a port closure", "<em>is not subject to a port closure</em>");
  var clause = hd("left:60px;top:96px;width:560px;height:262px", '<div style="font:600 11px var(--mono);letter-spacing:.2em;color:#e0b040;margin-bottom:10px">GOVERNING TEXT</div>' + clauseText, rulG, "clause");
  var question = hd("left:60px;top:384px;width:560px;font:italic 400 27px/1.3 var(--serif)", "Does an anchorage hold count as a ‘port closure’?", rulG);
  var reel = hd("left:690px;top:96px;width:540px;height:262px;border:1px solid var(--rule2);background:rgba(19,21,26,.96);padding:18px 24px", '<div style="font:600 11px var(--mono);letter-spacing:.2em;color:#e0b040;margin-bottom:14px">VALIDATORS ANSWER ONE WORD</div>', rulG);
  var words = ["HOLDS", "DOES NOT HOLD", "UNDETERMINED"].map(function (w) { return hd("font:600 34px var(--mono);letter-spacing:.04em;padding:9px 12px;margin:5px 0;color:#6e6a60;border:1px solid transparent", w, reel); });
  var dots = [0, 1, 2, 3, 4].map(function (k) { return hd("position:absolute;left:" + (690 + 2 + k * 28) + "px;top:372px;width:18px;height:18px;border-radius:50%;border:2px solid #3b3f4b;background:transparent", "", rulG); });
  var dotLbl = hd("left:842px;top:371px;font:600 12px var(--mono);letter-spacing:.14em;color:#a8a395;text-transform:uppercase", "5 of 5 validators agree", rulG);
  var proof = hd("left:690px;top:408px;width:540px;font:600 13px/1.55 var(--mono);letter-spacing:.04em;color:#e0b040", "RECORDED ON GENLAYER STUDIO<br><span style='color:#a8a395;font-weight:500'>1 consensus round · " + (RL && /(\d+)s/.exec(RL.note) ? /(\d+)s/.exec(RL.note)[1] : "22") + " s · tx " + (RL ? RL.tx.slice(0, 10) + "…" + RL.tx.slice(-4) : "") + "</span>", rulG);

  var mini = hd("left:60px;top:476px;width:560px;height:84px;border:1px solid var(--rule2);background:rgba(19,21,26,.96);border-left:5px solid #ff5d4d;padding:12px 18px", "", rulG);
  var miniT = hd("font:500 21px var(--serif)", "Hold = ‘port closure’", mini), miniS = hd("font:700 13px var(--mono);letter-spacing:.06em;margin-top:6px;color:#ff5d4d", "DEADLOCKED · 100% divergence", mini);
  // S5 fragility
  var fragG = hd("left:0;top:0;width:1280px;height:720px", "");
  var maxd = 1; frag.parties.forEach(function (e) { maxd = Math.max(maxd, Math.abs(e.delta)); });
  var FR = frag.parties.map(function (e, i) { var y = 110 + i * 96, name = S.parties[e.party].name;
    var row = hd("left:120px;top:" + y + "px;width:1040px;height:84px;border-top:1px solid var(--rule2);padding-top:10px", '', fragG);
    var nm = hd("position:absolute;left:0;top:10px;font:500 28px var(--serif)", name, row);
    var x = hd("position:absolute;left:0;top:10px;font:700 28px var(--mono);color:#ff5d4d;opacity:0", "", row);
    var bar = hd("position:absolute;left:440px;top:22px;height:12px;width:0;background:" + (e.delta < 0 ? "#8fd19e" : "#e0b040"), "", row);
    var track = hd("position:absolute;left:440px;top:22px;width:400px;height:12px;border:1px solid var(--rule2)", "", row);
    var num = hd("position:absolute;left:860px;top:6px;font:500 26px var(--mono)", (e.delta > 0 ? "+" : "") + e.delta, row);
    var fl = hd("position:absolute;left:440px;top:46px;font:500 13.5px/1.3 var(--mono);color:var(--muted);width:600px", e.flips.length ? "removing them flips " + e.flips.length + " proposition" + (e.flips.length === 1 ? "" : "s") + ": " + e.flips.map(function (k) { return S.props[k].short; }).join(", ") : "removing them changes no proposition", row);
    var piv = hd("position:absolute;left:0;top:50px;font:700 11px var(--mono);letter-spacing:.16em;color:#16120a;background:#ff7a59;padding:3px 8px;opacity:0", "PIVOTAL", row);
    return { row: row, bar: bar, w: Math.max(3, Math.abs(e.delta) / maxd * 400), num: num, piv: piv, isPiv: e.party === frag.pivotal, x: x, nm: nm }; });
  var fragHead = hd("left:120px;top:512px;width:720px;font:500 25px/1.4 var(--serif)", "", fragG);
  var pe = frag.parties[frag.pivotal == null ? 0 : frag.pivotal];
  fragHead.innerHTML = frag.pivotal == null ? "No single party can flip any proposition." : '<span style="color:#ff7a59">' + S.parties[frag.pivotal].name + ' is pivotal.</span> Remove them and ' + pe.flips.length + ' of ' + rec.props.length + ' propositions change; the index goes ' + frag.base_ambiguity + ' → ' + pe.ambiguity + '.';

  // S6 gate
  var gateG = hd("left:0;top:0;width:1280px;height:720px", "");
  var bx1 = hd("left:70px;top:100px;width:440px;height:330px;border:1px solid var(--rule2);background:rgba(19,21,26,.96);padding:20px 24px", '<div style="font:600 12px var(--mono);letter-spacing:.2em;color:#e0b040">CONCORDANCE · THE ORACLE</div><div style="font:500 12px var(--mono);color:#6e6a60;margin:4px 0 22px">' + (GT ? GT.concordance.slice(0, 8) + "…" + GT.concordance.slice(-4) : "") + '</div><div style="font:500 22px var(--serif);margin-bottom:12px">Hold = ‘port closure’</div>', gateG);
  var bxStatus = hd("font:700 15px var(--mono);letter-spacing:.06em;padding:5px 10px;display:inline-block;color:#16120a;background:#e0b040", "CONTESTED · leans FALSE", bx1);
  var bxNote = hd("font:500 14px/1.5 var(--mono);color:var(--muted);margin-top:18px", "signal: lean FALSE · clarity 43", bx1);
  var bx2 = hd("left:770px;top:100px;width:440px;height:330px;border:1px solid var(--rule2);background:rgba(19,21,26,.96);padding:20px 24px", '<div style="font:600 12px var(--mono);letter-spacing:.2em;color:#e0b040">CONCORDANCEGATE · A SEPARATE CONTRACT</div><div style="font:500 12px var(--mono);color:#6e6a60;margin:4px 0 22px">' + (GT ? GT.address.slice(0, 8) + "…" + GT.address.slice(-4) : "") + '</div><div style="font:500 20px/1.3 var(--serif);margin-bottom:18px">Policy: pay the shipper if the hold is <i>not</i> a port closure</div>', gateG);
  var meterBox = hd("height:16px;border:1px solid var(--rule2);margin-top:6px", "", bx2), meterFill = hd("height:100%;width:0;background:#e0b040", "", meterBox);
  var meterTxt = hd("font:300 64px/1 var(--serif);margin-top:14px;font-variant-numeric:lining-nums", "0%", bx2);
  var meterSub = hd("font:500 13px var(--mono);color:var(--muted);margin-top:6px", "the oracle justifies now", bx2);
  var arrowG = sv("g", {}), arr = sv("path", { d: "M770,265 L520,265", stroke: "#e0b040", "stroke-width": 2, fill: "none", "stroke-dasharray": "6 6" }, arrowG); sv("polygon", { points: "520,265 534,258 534,272", fill: "#e0b040" }, arrowG);
  var arrLbl = hd("left:540px;top:208px;width:240px;text-align:center;font:600 12px/1.45 var(--mono);letter-spacing:.1em;color:#e0b040;text-transform:uppercase", "get_signal()<br>cross-contract read");
  var gateProof = hd("left:70px;top:470px;width:1140px;font:600 14px/1.6 var(--mono);letter-spacing:.03em;color:#a8a395", "ON GENLAYER STUDIO &nbsp;·&nbsp; <span style='color:#ece6d8'>claim #1: 43% paid</span> &nbsp;→&nbsp; <span style='color:#e0b040'>ruling</span> &nbsp;→&nbsp; <span style='color:#ece6d8'>claim #2: +57% paid</span> &nbsp;·&nbsp; policy history records <span style='color:#e0b040'>ruled: [6]</span>", gateG);

  // S7 honest
  var honG = hd("left:0;top:0;width:1280px;height:720px", "");
  var st1 = hd("left:60px;top:150px;width:320px", '<b style="color:#ff5d4d">0 / 8</b><span>convenes that agreed under the first design (per-cell consensus)</span>', honG, "stat");
  var st2 = hd("left:480px;top:150px;width:320px", '<b style="color:#8fd19e">6 / 6</b><span>agreed after the redesign: consensus on the index, not the words</span>', honG, "stat");
  var st3 = hd("left:900px;top:150px;width:320px", '<b style="color:#ece6d8">10 / 10</b><span>rulings accepted in one round (my cases, n = 10)</span>', honG, "stat");
  var arrow7 = hd("left:392px;top:176px;font:300 60px var(--serif);color:#e0b040", "→", honG);
  var open7 = hd("left:140px;top:430px;width:1000px;text-align:center;font:500 22px/1.5 var(--serif);color:#ece6d8", "Still open: <span style='color:#ff7a59'>the requester picks the clause text.</span><br><span style='font:500 14px var(--mono);color:#a8a395;letter-spacing:.06em'>Bind the governing text when the inquiry opens. Until then, do not use rulings adversarially.</span>", honG);

  // S8 end
  var endG = hd("left:0;top:0;width:1280px;height:720px", "");
  hd("left:0;width:1280px;top:210px;text-align:center;font:300 118px/1 var(--serif);letter-spacing:-.03em", "Concordance", endG);
  hd("left:0;width:1280px;top:350px;text-align:center;font:italic 400 29px/1.4 var(--serif);color:#a8a395", "An oracle that keeps the disagreement, explains it, and prices it.", endG);
  hd("left:0;width:1280px;top:600px;text-align:center;font:500 13px/1.6 var(--mono);letter-spacing:.05em;color:#6e6a60", "Every number in this film is computed by the product's own code (derive.js) or read from recorded GenLayer Studio transactions.", endG);
  hd("left:0;width:1280px;top:452px;text-align:center;font:600 19px/1.9 var(--mono);letter-spacing:.06em;color:#e0b040", "concordance-web.vercel.app<br><span style='color:#a8a395;font-weight:500;font-size:15px'>github.com/s70239176-ctrl/concordance · MIT · GenLayer Studio</span>", endG);

  /* ---------- callouts ---------- */
  var CO = [
    { t0: 11.8, t1: 16.2, x: 40, y: 576, w: 440, text: "5 independent models. Each reads on its own.", dark: false, line: [180, 576] },
    { t0: 19.6, t1: 23.8, x: 410, y: 396, w: 290, text: "Ribbon width = how well that claim is evidenced.", dark: false, line: [520, 250] },
    { t0: 21.4, t1: 24.6, x: 930, y: 468, w: 270, text: "0 = concord, 100 = discord", dark: true, line: [1000, 560] },
    { t0: 31.4, t1: 35.4, x: 720, y: 384, w: 330, text: "Facts, clocks, boundaries: bring evidence.", dark: false, line: [490, 426] },
    { t0: 31.0, t1: 35.4, x: 420, y: 572, w: 330, text: "Meaning: no amount of evidence settles it.", dark: true, line: [330, 550] },
    { t0: 39.0, t1: 43.6, x: 860, y: 372, w: 370, text: "Only three answers exist, so validators can actually agree.", dark: false, line: [960, 358] },
    { t0: 48.4, t1: 51.7, x: 84, y: 290, w: 440, text: "Honest gap: the requester supplies this text.", dark: true, line: [330, 262] },
    { t0: 59.8, t1: 63.6, x: 880, y: 520, w: 320, text: "Computed from the stored record. No model call.", dark: false, line: [840, 540] },
    { t0: 66.2, t1: 70.4, x: 522, y: 296, w: 238, text: "A view call inside a write transaction. Verified on Studio.", dark: false, line: [641, 272] }
  ];
  var coEls = CO.map(function (c) { var e = hd("left:" + c.x + "px;top:" + c.y + "px;width:" + c.w + "px;max-width:" + c.w + "px", c.text, null, "co" + (c.dark ? " dark" : ""));
    var ln = sv("line", { x1: c.x + c.w / 2, y1: c.y, x2: c.line[0], y2: c.line[1], stroke: "#e0b040", "stroke-width": 1.6 }, g); return { c: c, e: e, ln: ln }; });

  function podState(p, t) { return p; }

  /* ---------- render ---------- */
  window.render = function (t) {
    var a, k;
    // header scene label
    var lbl = ""; SCENES.forEach(function (s) { if (t >= s[0]) lbl = s[1]; }); sceneLbl.textContent = lbl;
    // captions
    var cap = null; CAPS.forEach(function (c) { if (t >= c[0] && t <= c[1]) cap = c; });
    if (cap) { var o = Math.min(seg(t, cap[0], cap[0] + 0.25), 1 - seg(t, cap[1] - 0.25, cap[1])); capEl.innerHTML = cap[2]; capEl.style.opacity = o; capEl.style.display = "block"; } else capEl.style.display = "none";

    // ----- S1 + cards
    var s1 = 1 - seg(t, 9.4, 10.2);
    vis(kick1, seg(t, 0.15, 0.9) * s1);
    // cards: layout A -> B
    var morph = eio(seg(t, 9.6, 11.2));
    cards.forEach(function (c, i) {
      var A = CARD_A[i], B = NODE_B[i], appear = eo(seg(t, 0.5 + i * 0.45, 1.2 + i * 0.45));
      var x = lerp(A.x, B.x, morph), y = lerp(A.y, B.y, morph) + (1 - appear) * 22 + (1 - morph) * 0, w = lerp(A.w, B.w, morph), h = lerp(A.h, B.h, morph);
      c.style.left = x + "px"; c.style.top = y + "px"; c.style.width = w + "px"; c.style.height = h + "px";
      var dim = t > 5.4 && t < 9.6 ? 0.55 : 1; var fadeOut = 1 - seg(t, 24.6, 25.3);
      vis(c, appear * dim * fadeOut);
      c.style.padding = lerp(14, 8, morph) + "px " + lerp(16, 12, morph) + "px";
      c.querySelector("h3").style.fontSize = lerp(22, 16, morph) + "px";
      c.querySelector(".role").style.margin = lerp(2, 0, morph) + "px 0 " + lerp(8, 0, morph) + "px";
      var pEl = c.querySelector("p"); pEl.style.opacity = 1 - seg(t, 9.4, 10.2); pEl.style.display = (t > 10.3 ? "none" : "block");
    });
    funPaths.forEach(function (p, i) { p.setAttribute("stroke-dashoffset", 1 - eo(seg(t, 3.2 + i * 0.25, 4.6 + i * 0.25))); });
    vis(fun, s1);
    vis(ans, eo(seg(t, 4.9, 5.7)) * s1); vis(ansLbl, eo(seg(t, 5.4, 6.2)) * s1);
    vis(hidden, eo(seg(t, 6.8, 7.4)) * s1 * (0.78 + 0.22 * Math.sin(t * 7)));

    // ----- S2 map (+ tuner persistent 10..52)
    var mapA = seg(t, 10.8, 11.4) * (1 - seg(t, 24.6, 25.3));
    vis(mapG, mapA);
    ribbons.forEach(function (r, n) { var s = 16.5 + (r.pi * 7 + r.qi) * 0.07; r.el.setAttribute("stroke-dashoffset", 1 - eo(seg(t, s, s + 1.1))); });
    pods.forEach(function (p, i) { var s = 17.3 + i * 0.22, ap = eo(seg(t, s - 0.3, s)); p.grp.style.opacity = 0.18 + 0.82 * ap;
      var fl = clamp(1 - Math.abs(t - (s + 0.15)) / 0.5); p.box.setAttribute("stroke", fl > 0 ? "#e0b040" : "#272a33"); p.box.setAttribute("stroke-width", 1.3 + 2 * fl);
      var done = t > 41.4 ? ruledRec.props[i] : rec.props[i]; // after the ruling lands the pod changes
      if (t > 41.4 || i === 6) { var pp = (i === 6 && t > 45.4) ? ruledRec.props[6] : rec.props[i]; var col = stColor(pp); p.bar.setAttribute("fill", col); p.st.textContent = stText(pp); p.st.setAttribute("fill", col); p.dv.textContent = pp.divergence + "%"; p.dv.setAttribute("fill", col); }
      if (i === 6) { var f2 = clamp(1 - Math.abs(t - 45.6) / 0.6); if (f2 > 0) { p.box.setAttribute("stroke", "#ece6d8"); p.box.setAttribute("stroke-width", 1.3 + 3 * f2); } }
    });
    vis(valG, mapA);
    valEls.forEach(function (v, k) { var s = 11.4 + k * 0.45; var rise = eo(seg(t, s, s + 1.4)); v.bars.forEach(function (b, j) { var p = v.v.rec.props[j], hh = Math.max(3, (p.status === "UNSUPPORTED" ? 100 : p.divergence) * 0.5) * rise; b.setAttribute("height", hh.toFixed(1)); b.setAttribute("y", (v.y + 84 - hh).toFixed(1)); });
      var ck = seg(t, 14.6 + k * 0.28, 14.9 + k * 0.28); v.mk.style.opacity = ck; v.idx.style.opacity = rise; v.top.setAttribute("fill", ck > 0.5 ? (v.v.ok ? "#8fd19e" : "#ff5d4d") : "#6e6a60"); });
    // tuner
    var tunA = seg(t, 10.8, 11.4) * (1 - seg(t, 51.6, 52.3)) * (1 - seg(t, 24.6, 25.3) * (1 - seg(t, 35.6, 36.2))); vis(tuner, tunA);
    var amb = AMB(t); numEl.textContent = Math.round(amb); needle.setAttribute("transform", "translate(" + (800 + 430 * amb / 100) + ",558)");
    var recNow = t > 45.4 ? ruledRec : rec; tally.textContent = t > 19 ? recNow.agreed + " agreed · " + recNow.contested + " contested" + (recNow.ruled ? " · " + recNow.ruled + " ruled" : "") : "";
    numEl.setAttribute("fill", t > 12 && t < 17.6 ? "#e0b040" : (t > 41.5 && t < 45.2 ? "#e0b040" : "#ece6d8"));

    // ----- S3 triage
    var s3 = seg(t, 25.2, 25.8) * (1 - seg(t, 35.4, 36.0));
    vis(triG, s3);
    TRI.forEach(function (r, i) { var ap = eo(seg(t, 25.9 + i * 0.7, 26.5 + i * 0.7)); r.row.style.opacity = ap; r.row.style.transform = "translateY(" + ((1 - ap) * 18) + "px)"; });

    // ----- S4 ruling
    var s4 = seg(t, 36.0, 36.6) * (1 - seg(t, 51.6, 52.2));
    vis(rulG, s4);
    clause.style.opacity = eo(seg(t, 36.4, 37.2)); question.style.opacity = eo(seg(t, 37.4, 38.2)); reel.style.opacity = eo(seg(t, 38.0, 38.8));
    var landed = t >= 45.0, sweep = Math.floor((t - 39.0) * 5.5) % 3;
    words.forEach(function (w, i) { var on = landed ? (i === 1) : (t > 39.2 && sweep === i); w.style.color = on ? (landed ? "#ece6d8" : "#e0b040") : "#6e6a60"; w.style.borderColor = on ? (landed ? "#ece6d8" : "#e0b040") : "transparent"; w.style.background = (on && landed) ? "rgba(236,230,216,.1)" : "transparent"; });
    dots.forEach(function (d, k) { var on = t > 43.4 + k * 0.28; d.style.background = on ? "#8fd19e" : "transparent"; d.style.borderColor = on ? "#8fd19e" : "#3b3f4b"; });
    proof.style.opacity = eo(seg(t, 46.2, 47.0)); dotLbl.style.opacity = seg(t, 44.8, 45.4); mini.style.opacity = eo(seg(t, 38.6, 39.4));
    var rl = t >= 45.4; miniS.textContent = rl ? "RULED · DOES NOT HOLD · 0% divergence" : "DEADLOCKED · 100% divergence"; miniS.style.color = rl ? "#ece6d8" : "#ff5d4d"; mini.style.borderLeftColor = rl ? "#ece6d8" : "#ff5d4d";
    var mf = clamp(1 - Math.abs(t - 45.6) / 0.6); mini.style.borderColor = mf > 0 ? "#ece6d8" : "#3b3f4b";

    // ----- S5 fragility
    var s5 = seg(t, 52.1, 52.7) * (1 - seg(t, 63.4, 64.0)); vis(fragG, s5);
    FR.forEach(function (r, i) { var s = 52.9 + i * 1.5, ap = eo(seg(t, s, s + 0.5)), grow = eo(seg(t, s + 0.3, s + 1.4));
      r.row.style.opacity = ap; r.bar.style.width = (r.w * grow) + "px"; r.num.style.opacity = grow; r.piv.style.opacity = r.isPiv ? eo(seg(t, 58.4, 58.9)) : 0;
      r.x.style.opacity = 0; });
    fragHead.style.opacity = eo(seg(t, 59.0, 59.8));

    // ----- S6 gate
    var s6 = seg(t, 63.9, 64.5) * (1 - seg(t, 77.4, 78.0)); vis(gateG, s6); vis(arrowG, s6 * eo(seg(t, 65.0, 65.8))); vis(arrLbl, s6 * eo(seg(t, 65.2, 66.0)));
    bx1.style.opacity = eo(seg(t, 64.2, 64.9)); bx2.style.opacity = eo(seg(t, 64.6, 65.3));
    var ruledGate = t >= 70.4; var pct = t < 70.4 ? 43 * eo(seg(t, 66.4, 68.4)) : lerp(43, 100, eio(seg(t, 70.6, 72.8)));
    meterFill.style.width = pct + "%"; meterFill.style.background = pct >= 80 ? "#8fd19e" : "#e0b040"; meterTxt.textContent = Math.round(pct) + "%";
    bxStatus.textContent = ruledGate ? "RULED · DOES NOT HOLD" : "CONTESTED · leans FALSE"; bxStatus.style.background = ruledGate ? "#ece6d8" : "#e0b040";
    bxNote.textContent = ruledGate ? "signal: lean FALSE · clarity 100 · ruled" : "signal: lean FALSE · clarity 43";
    gateProof.style.opacity = eo(seg(t, 73.0, 74.0));

    // ----- S7 honest
    var s7 = seg(t, 77.9, 78.5) * (1 - seg(t, 85.6, 86.2)); vis(honG, s7);
    st1.style.opacity = eo(seg(t, 78.6, 79.6)); arrow7.style.opacity = eo(seg(t, 80.4, 81.0)); st2.style.opacity = eo(seg(t, 80.8, 81.8)); st3.style.opacity = eo(seg(t, 82.4, 83.4)); open7.style.opacity = eo(seg(t, 83.6, 84.6));

    // ----- S8 end
    vis(endG, seg(t, 86.2, 87.4));

    // callouts
    coEls.forEach(function (o) { var c = o.c, a = Math.min(seg(t, c.t0, c.t0 + 0.35), 1 - seg(t, c.t1 - 0.3, c.t1)); vis(o.e, a); o.ln.style.opacity = a; o.ln.style.display = a <= 0.002 ? "none" : "block"; });
  };
  window.DURATION = 90;
  window.READY = false;
  document.fonts.ready.then(function () { window.render(0); window.READY = true; });
})();
