/* SPDX-License-Identifier: Apache-2.0
   Copyright 2026 The Agent Software Testing authors

   Compare: any two tools program by program. The page carries the default comparison written by the build; this file
   builds the same markup for any other pair from window.CRCompare (compact arrays written by the build). Every
   string below is built with the same replacements and number formats as the build, and the test suite checks that
   the default pair comes out identical. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;
  else factory(root);
})(typeof self !== "undefined" ? self : this, function (win) {
  "use strict";
  var FAMILY = { agent: "Agent", llm: "Language model", symbolic: "Symbolic", fuzzer: "Fuzzer", hybrid: "Hybrid", other: "Other" };
  var FAMILY_ORDER = ["agent", "llm", "symbolic", "fuzzer", "hybrid", "other"];

  var WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
  var NF = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });      // one formatter: toLocaleString builds a new one on every call
  function fmt(n) { return n == null || isNaN(n) ? "" : NF.format(n); }
  function words(n) { return n >= 0 && n < 10 ? WORDS[n] : fmt(n); }
  function plural(n, a, b) { return n === 1 ? a : b; }
  function p1(x) { return Number(x).toFixed(1); }
  function signed(n) { return n === 0 ? "0" : (n > 0 ? "+" : "−") + fmt(Math.abs(n)); }
  function hours(s) { return s % 3600 === 0 ? (s / 3600) + " h" : (s / 3600).toFixed(2).replace(/0+$/, "").replace(/\.$/, "") + " h"; }
  function median(a) {
    var s = a.slice().sort(function (x, y) { return x - y; }), n = s.length;
    if (!n) return null;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  }
  // the Vargha-Delaney A12 of sample a against sample b; ties count one half
  function a12(a, b) {
    var u = 0, i, j;
    for (i = 0; i < a.length; i++) for (j = 0; j < b.length; j++) u += a[i] > b[j] ? 1 : a[i] === b[j] ? 0.5 : 0;
    return u / (a.length * b.length);
  }
  function inSentence(label) { return label.indexOf("The ") === 0 ? "t" + label.slice(1) : label; }
  function coresWords(s) { return s.cores == null ? s.nocores : words(s.cores); }
  function budgetText(s) { return s.budget ? hours(s.budget) : s.nobudget; }
  // the line key of a tool: its colour where it has one on every page (the default group), a neutral ink otherwise; dash as the tool's own
  function toolKey(s) {
    var slot = s.primary ? s.slot : 0, dash = s.dash ? " d" + s.dash : "";
    return '<span class="keyswatch" aria-hidden="true"><svg viewBox="0 0 22 10"><line class="c' + slot + dash + '" x1="2" y1="5" x2="20" y2="5" stroke-width="2" stroke-linecap="round"/></svg></span>';
  }
  var NA_TRACKS = '<span class="muted">n/a (different tracks)</span>';
  // line to 0.1 px with ties going up, as the build writes it (Python formats half-way values to the even digit)
  function r1(v) { return (Math.round(v * 10 + 1e-9) / 10).toFixed(1); }

  function Model(C) {
    var M = { C: C, S: {}, P: {}, pi: {}, si: {}, ovl: {} };
    C.systems.forEach(function (s, i) { M.S[s.id] = s; M.si[s.id] = i; });
    C.programs.forEach(function (p, i) { M.P[p.id] = p; M.pi[p.id] = i; });
    C.ovl.forEach(function (o) {
      var pid = C.programs[o[0]].id, a = C.systems[o[1]].id, b = C.systems[o[2]].id;
      (M.ovl[pid] || (M.ovl[pid] = {}))[a + "|" + b] = [o[3], o[4], o[5]];
    });
    return M;
  }
  function overlapOf(M, pid, x, y) {
    var o = M.ovl[pid]; if (!o) return null;
    var v = o[x + "|" + y]; if (v) return { a: v[0], b: v[1], both: v[2] };
    v = o[y + "|" + x]; if (v) return { a: v[1], b: v[0], both: v[2] };
    return null;
  }
  function has(M, sid, pid) { return !!(M.C.fin[sid] && M.C.fin[sid][pid]); }

  function options(M, selected) {
    var h = "";
    FAMILY_ORDER.forEach(function (fam) {
      var list = M.C.systems.filter(function (s) { return s.family === fam; });
      if (!list.length) return;
      h += '<optgroup label="' + esc(FAMILY[fam]) + '">';
      list.forEach(function (s) {
        var title = M.C.studies[s.study].toLowerCase(), bits = [];      // what follows the label when it does not say it, as sitebuild/pages.py option_tail writes it
        if (!s.primary && s.label.toLowerCase().slice(-(title.length + 2)) !== "(" + title + ")") bits.push(title);
        if (s.status !== "current") bits.push(s.status);
        var tail = bits.length ? " (" + bits.join(", ") + ")" : "";
        h += '<option value="' + esc(s.id) + '"' + (s.id === selected ? " selected" : "") + ">" + esc(s.label) + tail + "</option>";
      });
      h += "</optgroup>";
    });
    return h;
  }

  function differNote(A, B) {
    var parts = [], t;
    if (A.track !== B.track) parts.push("track (A " + A.track + ", B " + B.track + ")");
    if (A.cores !== B.cores) parts.push("cores (A " + coresWords(A) + ", B " + coresWords(B) + ")");
    if (A.budget !== B.budget) parts.push("budget (A " + budgetText(A) + ", B " + budgetText(B) + ")");
    if (!parts.length) return "";
    t = "A and B differ in " + (parts.length === 1 ? parts[0] : parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1]) + ".";
    if (A.track !== B.track) t += " Results of the two tracks are not comparable.";
    return '<p class="callout cmp-warn">' + t + "</p>";
  }

  function render(M, aId, bId) {
    var C = M.C, A = M.S[aId], B = M.S[bId], h = "";
    if (aId === bId) return { html: '<p class="callout">Choose two different tools.</p>', both: 0 };
    var both = C.programs.filter(function (p) { return has(M, aId, p.id) && has(M, bId, p.id); });
    var shared = both.map(function (p) { return p.id; }), xt = A.track !== B.track;
    h += '<div class="cmp-key"><span class="cmp-side"><span class="ab a"></span>' + toolKey(A) + '<b class="cmp-l">A:</b> ' + esc(A.label) + '</span><span class="cmp-side"><span class="ab b"></span>' + toolKey(B) + '<b class="cmp-l">B:</b> ' + esc(B.label) + "</span></div>";
    h += '<p class="lede lede-sm cmp-intro">Both ran on ' + words(both.length) + (both.length === 1 ? " program" : " programs") + (both.length ? "." : ", so there is nothing to compare.") + "</p>";
    h += differNote(A, B);
    if (!both.length) return { html: h, both: 0 };
    h += '<section class="section" id="medians"><div class="section-head"><h2 id="h-med">Median final coverage</h2></div>' +
      '<div class="tbl-wrap" tabindex="0" role="region" aria-label="Median final coverage of A and B by program"><table class="tbl fit"><caption class="sr">Median final coverage of A and B by program, with A12</caption><thead><tr><th class="sticky" scope="col">Program</th><th scope="col">Median share</th>' +
      '<th class="r" scope="col"><span class="ab a"></span>A median</th><th class="r" scope="col"><span class="ab b"></span>B median</th>' +
      (xt ? '<th class="r" scope="col" colspan="2">Comparison</th>' : '<th class="r" scope="col" title="B minus A, in branches">B − A</th><th class="r" scope="col">A12</th>') +
      '<th class="r" scope="col">Runs A / B</th><th scope="col">Curves</th></tr></thead><tbody>';
    var anyInc = false;
    both.forEach(function (p) {
      var fa = C.fin[aId][p.id], fb = C.fin[bId][p.id], inc = fa[3] || fb[3], st = null;
      if (inc) anyInc = true;
      if (!inc && !xt) st = a12(C.runs[aId][p.id], C.runs[bId][p.id]);
      var d = fb[1] - fa[1], ca = C.curves[aId] && C.curves[aId][p.id], cb = C.curves[bId] && C.curves[bId][p.id], cv = "–";
      if (ca && cb) {
        var w = 88, hg = 22, mx = Math.max(Math.max.apply(null, ca), Math.max.apply(null, cb));
        var pts = function (v) { return v.map(function (y, i) { return r1(2 + 84 * i / (v.length - 1)) + " " + r1(hg - 2 - 18 * y / mx); }).join("L"); };
        cv = '<svg class="spark" viewBox="0 0 ' + w + " " + hg + '" role="img" aria-label="Median curves of A and B on ' + esc(p.name) + '"><path class="ca" d="M' + pts(ca) + '"/><path class="cb" d="M' + pts(cb) + '"/></svg>';
      }
      var stats;
      if (xt) stats = '<td class="r na-cell" colspan="2">' + NA_TRACKS + "</td>";
      else stats = '<td class="num r">' + signed(d) + '</td><td class="num r">' + (st !== null ? st.toFixed(2) : '<span class="muted" title="Fewer than three runs">n/a</span>') + "</td>";
      h += '<tr><th class="sticky" scope="row"><a class="pname" href="programs/' + esc(p.id) + '.html">' + esc(p.name) + '</a><span class="sub mono">' + fmt(p.total) + ' branches</span></th><td><div class="pair"><div class="row"><span class="l">A</span><i class="a-fill" style="width:' + (fa[2] * 1.5).toFixed(1) + 'px"></i><span class="n">' + p1(fa[2]) + '%</span></div><div class="row"><span class="l">B</span><i class="b-fill" style="width:' + (fb[2] * 1.5).toFixed(1) + 'px"></i><span class="n">' + p1(fb[2]) + "%</span></div></div></td>" +
        '<td class="num r">' + fmt(fa[1]) + '</td><td class="num r">' + fmt(fb[1]) + "</td>" + stats +
        '<td class="num r">' + fa[0] + " / " + fb[0] + (inc ? '<sup class="dag" title="Fewer than three runs">†</sup>' : "") + "</td><td>" + cv + "</td></tr>";
    });
    h += "</tbody></table></div>" + (anyInc && !xt ? '<p class="key-line">† fewer than three runs; A12 is left out.</p>' : "") + "</section>";
    h += '<section class="section" id="only"><div class="section-head"><h2 id="h-only">Branches only each tool reaches</h2></div>' +
      '<div class="tbl-wrap" tabindex="0" role="region" aria-label="Branches only A reaches, both reach and only B reaches"><table class="tbl fit"><caption class="sr">Branches reached by only A, by both and by only B</caption><thead><tr><th class="sticky" scope="col">Program</th><th class="r" scope="col"><span class="ab a"></span>Only A</th><th class="r" scope="col">Both</th><th class="r" scope="col"><span class="ab b"></span>Only B</th><th scope="col" class="split">Split of the union</th></tr></thead><tbody>';
    var anyOv = false;
    both.forEach(function (p) {
      var o = overlapOf(M, p.id, aId, bId);
      if (!o) { h += '<tr><th class="sticky" scope="row"><a class="pname" href="programs/' + esc(p.id) + '.html">' + esc(p.name) + '</a></th><td class="num r miss muted left" colspan="3">Not every run of both tools has a branch set</td><td></td></tr>'; return; }
      anyOv = true;
      var bar = xt ? NA_TRACKS : '<div class="stack" role="img" aria-label="' + esc(fmt(o.a) + " only A, " + fmt(o.both) + " both, " + fmt(o.b) + " only B") + '"><i class="a-fill" style="flex:' + o.a + '"></i><i class="both" style="flex:' + o.both + '"></i><i class="b-fill" style="flex:' + o.b + '"></i></div>';
      h += '<tr><th class="sticky" scope="row"><a class="pname" href="programs/' + esc(p.id) + '.html">' + esc(p.name) + '</a></th><td class="num r">' + fmt(o.a) + '</td><td class="num r">' + fmt(o.both) + '</td><td class="num r">' + fmt(o.b) + "</td><td>" + bar + "</td></tr>";
    });
    h += "</tbody></table></div>" + (anyOv ? "" : '<p class="notes">The release holds no overlap rows for this pair.</p>') + "</section>";
    function runsOn(s) { return shared.reduce(function (t, q) { return t + C.fin[s.id][q][0]; }, 0); }
    function tok(s) {
      if (!s.model) return '<span class="muted">not applicable (no model)</span>';
      var all = [];
      shared.forEach(function (q) { ((C.toks[s.id] && C.toks[s.id][q]) || []).forEach(function (t) { all.push(t); }); });
      if (!all.length) return '<span class="muted">not reported</span>';
      var n = runsOn(s);
      return fmt(Math.floor(median(all) + 0.5)) + ' <span class="muted">(' + all.length + " " + (all.length === n ? plural(all.length, "run", "runs") : "of " + n + " runs") + ")</span>";
    }
    var rows = [
      ["Family", function (s) { return esc(FAMILY[s.family]); }],
      ["Backend", function (s) { return esc(s.backend); }],
      ["Model", function (s) { return s.model ? esc(s.model) : '<span class="muted">none</span>'; }],
      ["Track", function (s) { return esc(s.track); }],
      ["Cores per campaign", function (s) { return s.cores == null ? '<span class="muted">' + esc(s.nocores) + "</span>" : String(s.cores); }],
      ["Budget per campaign", function (s) { return s.budget ? hours(s.budget) : '<span class="muted">' + esc(s.nobudget) + "</span>"; }],
      ["Runs, on the shared programs", function (s) { return String(runsOn(s)); }],
      ["Output tokens per run, median, on the shared programs", tok],
    ];
    h += '<section class="section" id="resources"><div class="section-head"><h2 id="h-res">Resources</h2></div>' +
      '<div class="tbl-wrap" tabindex="0" role="region" aria-label="Resources of A and B"><table class="tbl fit recs"><caption class="sr">Resources of tool A and tool B</caption><thead><tr><th class="sticky" scope="col"><span class="sr">Resource</span></th><th scope="col"><span class="ab a"></span>' + toolKey(A) + esc(A.label) + '</th><th scope="col"><span class="ab b"></span>' + toolKey(B) + esc(B.label) + "</th></tr></thead><tbody>";
    rows.forEach(function (r) { h += '<tr><th class="sticky rowlab" scope="row">' + esc(r[0]) + '</th><td data-label="Tool A">' + r[1](A) + '</td><td data-label="Tool B">' + r[1](B) + "</td></tr>"; });
    h += "</tbody></table></div></section>";
    return { html: h, both: both.length };
  }

  var api = { Model: Model, render: render, options: options, esc: esc };
  if (win && win.CRCompare) {
    var $ = function (s) { return document.querySelector(s); };
    var out = $("#cmp-out");
    var M = Model(win.CRCompare), selA = $("#sel-a"), selB = $("#sel-b"), swap = $("#swap");
    var A = win.CRApp || {};
    var token = function () { var h = location.hash.slice(1).split("_vs_"); return h.length === 2 && M.S[h[0]] && M.S[h[1]] ? h : null; };
    var show = function (a, b, fromHash) {
      selA.innerHTML = options(M, a); selB.innerHTML = options(M, b);
      var res = render(M, a, b); out.innerHTML = res.html; out.setAttribute("data-a", a); out.setAttribute("data-b", b);
      if (A.recsRoles) A.recsRoles();
      var jump = document.querySelector('.subbar nav[aria-label="On this page"]'); if (jump) jump.hidden = res.both === 0;      // with no table the links lead nowhere
      if (A.spy) A.spy();
      if (!fromHash) {
        if (A.swapIn) A.swapIn(out);
        try { history.replaceState(null, "", "#" + a + "_vs_" + b); } catch (e) { /* sandboxed */ }
      }
      if (A.say) A.say(a === b ? "Choose two different tools" : "Comparing " + inSentence(M.S[a].label) + " with " + inSentence(M.S[b].label) + ": " + res.both + " shared programs");
    };
    if (selA && selB && out) {
      var t = token();
      if (t && (t[0] !== out.getAttribute("data-a") || t[1] !== out.getAttribute("data-b"))) show(t[0], t[1], true);
      selA.addEventListener("change", function () { show(selA.value, selB.value, false); });
      selB.addEventListener("change", function () { show(selA.value, selB.value, false); });
      if (swap) swap.addEventListener("click", function () { var a = selA.value, b = selB.value; show(b, a, false); selA.focus(); });
      window.addEventListener("hashchange", function () { var k = token(); if (k && (k[0] !== selA.value || k[1] !== selB.value)) show(k[0], k[1], true); });
    }
  }
  return api;
});
