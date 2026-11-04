// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The Agent Software Testing authors
// Checks of "Cells arranged" on the program pages (the branch map put in bands by the number of tools that reach each cell), in headless Chrome against a built
// site served over loopback:
//   the control (name, options, default, announcements, one tool in view returns the cells to source order and disables it);
//   for all 18 programs: the size of every band is the legend's count for its class, both in the layout and in the pixels of the canvas, and after a round trip
//     (source order, bands, source order, by a move, a cross-fade, an instant change and a move turned round half way) the canvas is pixel-identical;
//   hover, pin, the keys and the table view in both arrangements; the highlight of a legend chip and the marks of the branches that one tool reaches;
//   the motion: 200 ms on one animation frame loop, a stage whose height steps once at each end, a move turned round from where the cells are, nothing running when idle,
//     an instant change for reduced motion and a hidden page, the 120 ms cross-fade for more than 12,000 cells, and the guard (a slow frame ends the move and every later change
//     is a cross-fade);
//   frame times on Krep, WOFF2 and xorriso unthrottled and at 4 times slower CPU (--timing prints the table of them).
//   node scripts/regroup.mjs [--dist dist] [--port 9480] [--timing] [--shots DIR]
// --shots DIR also writes screenshots of both arrangements (1440 and 390 px, light and dark; Krep and WOFF2) and a sheet of the frames of the move to DIR.
// Prints PASS or FAIL per check; exit status 1 on a failure.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { launch } from "./cdp.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const arg = (name, dflt) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : dflt; };
const dist = resolve(root, arg("dist", "dist"));
const shots = arg("shots", "");
const timing = process.argv.includes("--timing");
const gpu = process.argv.includes("--gpu");                      // with --timing: leave the GPU on (the default is software canvas, as in the other checks of the site)
const onlyTiming = process.argv.includes("--only-timing");        // skip every check but the frame times
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const f = join(dist, p);
  if (!f.startsWith(dist) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;
const b = await launch({ port: Number(arg("port", 9480)), gpu });
let failed = 0;
const ok = (name, cond, extra = "") => { if (!cond) failed++; console.log(cond ? "PASS" : "FAIL", name, extra); };
const programs = readdirSync(join(dist, "programs")).filter((f) => f.endsWith(".html")).sort().map((f) => f.replace(/\.html$/, ""));
const bigPrograms = ["gawk", "gcal", "jq", "xorriso"];          // more than 12,000 cells (a cross-fade)
if (shots) mkdirSync(shots, { recursive: true });

// The view of the page's own map: the script of the page keeps it in a closure, so the mount function is wrapped before the page runs. A second hook counts what is
// running (timers, intervals, animation frames), for the checks of an idle page.
const HOOK = `(function(){var bm;Object.defineProperty(window,"BranchMap",{configurable:true,get:function(){return bm},set:function(v){bm=v;var m=v.mount;v.mount=function(){var view=m.apply(this,arguments);(window.__views=window.__views||[]).push(view);return view}}})})();`;
const COUNT = `(function(){var L=window.__live={t:new Set(),i:new Set(),r:new Set(),rafCalls:0,maxPending:0};var st=window.setTimeout,ct=window.clearTimeout,si=window.setInterval,ci=window.clearInterval,ra=window.requestAnimationFrame,ca=window.cancelAnimationFrame;
window.setTimeout=function(f,d){var a=[].slice.call(arguments,2),id=st.call(window,function(){L.t.delete(id);return typeof f==="function"?f.apply(this,a):0},d);L.t.add(id);return id};
window.clearTimeout=function(id){L.t.delete(id);return ct.call(window,id)};
window.setInterval=function(f,d){var id=si.apply(window,arguments);L.i.add(id);return id};window.clearInterval=function(id){L.i.delete(id);return ci.call(window,id)};
window.requestAnimationFrame=function(f){L.rafCalls++;var id=ra.call(window,function(ts){L.r.delete(id);return f(ts)});L.r.add(id);if(L.r.size>L.maxPending)L.maxPending=L.r.size;return id};
window.cancelAnimationFrame=function(id){L.r.delete(id);return ca.call(window,id)}})();`;

async function open(prog, { w = 1440, h = 900, dpr = 1, scheme = "light", reduced = "", forced = "", count = false, mobile = null, wait = 2000, touch = false } = {}) {
  const p = await b.newPage();
  await p.viewport(w, h, dpr, mobile === null ? w < 700 : mobile);
  await p.media({ scheme, reduced, forced });
  if (touch) await p.cmd("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await p.cmd("Page.addScriptToEvaluateOnNewDocument", { source: HOOK + (count ? COUNT : "") });
  const t0 = Date.now();
  await p.goto(base + `programs/${prog}.html`, wait);
  // The wait is how long the page is given, not a promise that it has loaded: on a loaded machine a navigation can outlast it, and then every check reads
  // window.__views[0] from a document that has not run its scripts. Wait for the page to be complete and its map mounted before handing it to a check.
  const path = `/programs/${prog}.html`;
  for (;;) {
    let ready = false;
    try {
      ready = await p.eval(`(function () { return document.readyState === "complete" && location.pathname.slice(-${path.length}) === ${JSON.stringify(path)} && (window.__views || []).length > 0; })()`);
    } catch {}                                        // (the document may still be on its way: a protocol error here is not a failed check)
    if (ready) break;
    if (Date.now() - t0 > 30000) throw new Error(`programs/${prog}.html did not finish loading and mount its map within 30 s`);
    await b.sleep(50);
  }
  return p;
}
const settle = (p, ms = 900) => p.eval(`new Promise(function (r) { var v = window.__views[0], t0 = performance.now(); (function w() { if ((!v.anim && !v.fade) && performance.now() - t0 > 40 || performance.now() - t0 > ${ms}) r({ anim: !!v.anim, fade: !!v.fade }); else setTimeout(w, 20); })(); })`);
const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : null; };
const pick = (p, to) => p.eval(`document.querySelector('.bm-order input[value=${to}]').click()`);
const hash = (p) => p.eval(`(function () { var v = window.__views[0], c = v.base, d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, h = 2166136261; for (var i = 0; i < d.length; i += 1) { h ^= d[i]; h = Math.imul(h, 16777619); } return c.width + "x" + c.height + ":" + (h >>> 0); })()`);

let p;
if (!onlyTiming) {
// ---- the control ------------------------------------------------------------------------------------------------------------
p = await open("krep", { count: true });
ok("control: no script error", p.logs.filter((l) => /^(error|EXCEPTION)/.test(l)).length === 0, p.logs.join("|"));
const ctl = JSON.parse(await p.eval(`JSON.stringify((function () {
  var o = document.querySelector(".bm-order"), g = o.querySelector(".seg"), ins = [...g.querySelectorAll("input")], frame = document.querySelector(".bm-frame");
  return { label: o.querySelector(".bm-order-k").textContent, name: g.getAttribute("aria-label"), role: g.getAttribute("role"), opts: ins.map(function (i) { return i.nextElementSibling.textContent; }), vals: ins.map(function (i) { return i.value; }),
    checked: ins.map(function (i) { return i.checked; }), seg: g.classList.contains("seg"), disabled: g.getAttribute("aria-disabled"),
    above: o.nextElementSibling === frame, gap: Math.round(frame.getBoundingClientRect().top - o.getBoundingClientRect().bottom), canvases: document.querySelectorAll(".bm-stage canvas").length };
})())`));
ok("control: the label is 'Cells arranged' and the group is named 'Arrange the cells'", ctl.label === "Cells arranged" && ctl.name === "Arrange the cells" && ctl.role === "radiogroup", JSON.stringify(ctl));
ok("control: two options, 'By source file' (the default) and 'By tools reaching', in the site's .seg style", JSON.stringify(ctl.opts) === '["By source file","By tools reaching"]' && JSON.stringify(ctl.checked) === "[true,false]" && ctl.seg);
ok("control: directly above the canvas, enabled, and the map has one canvas at rest", ctl.above && ctl.gap >= 0 && ctl.gap <= 12 && ctl.disabled !== "true" && ctl.canvases === 1, JSON.stringify({ above: ctl.above, gap: ctl.gap, disabled: ctl.disabled }));
const liveOf = (pp, test, ms = 3000) => pp.eval(`new Promise(function (r) { var t0 = performance.now(); (function w() { var t = document.getElementById("live").textContent; if (${test}(t) || performance.now() - t0 > ${ms}) r(t); else setTimeout(w, 50); })(); })`);
await pick(p, "reach");
ok("control: arranging by tools reaching says so in the live region", (await liveOf(p, "function (t) { return /^Cells arranged/.test(t); }")) === "Cells arranged by the number of tools that reach them");
await settle(p);
await pick(p, "src");
ok("control: back to source order says so in the live region", (await liveOf(p, "function (t) { return t === 'Cells arranged by source file'; }")) === "Cells arranged by source file");
await settle(p);
await pick(p, "reach"); await settle(p);
// one tool in view: source order, control disabled, no change by a click, the cells stay in source order
await p.eval(`[...document.querySelectorAll(".bm-tool input")].find(function (r) { return r.value === "3"; }).click()`);
await b.sleep(200);
const one = JSON.parse(await p.eval(`JSON.stringify((function () { var v = window.__views[0], g = document.querySelector(".bm-order .seg"), ins = [...g.querySelectorAll("input")]; return { arr: v.arr, lay: v.lay === v.src, dis: g.getAttribute("aria-disabled"), inDis: ins.map(function (i) { return i.getAttribute("aria-disabled"); }), checked: ins.map(function (i) { return i.checked; }), anim: !!v.anim, title: g.title, tab: ins.every(function (i) { return !i.disabled; }) }; })())`));
ok("control: choosing one tool returns the cells to source order and sets aria-disabled on the control (it stays in the tab order)", one.arr === "src" && one.lay && one.dis === "true" && one.inDis.every((x) => x === "true") && JSON.stringify(one.checked) === "[true,false]" && !one.anim && one.tab, JSON.stringify(one));
await p.eval(`document.querySelector('.bm-order input[value=reach]').click()`); await b.sleep(400);
ok("control: while one tool is in view a click on 'By tools reaching' changes nothing", await p.eval(`(function () { var v = window.__views[0]; return v.arr === "src" && v.lay === v.src && !v.anim && !v.fade && document.querySelector('.bm-order input[value=src]').checked; })()`));
await p.eval(`window.__views[0].arrange("reach")`); await b.sleep(300);
ok("control: the API does not arrange by tools reaching while one tool is in view", await p.eval(`window.__views[0].arr === "src"`));
await p.eval(`document.querySelector(".bm-tool input[value='-1']").click()`); await b.sleep(200);
ok("control: all tools in view enables it again, in source order (the arrangement is not remembered)", await p.eval(`(function () { var g = document.querySelector(".bm-order .seg"); return g.getAttribute("aria-disabled") === "false" && window.__views[0].arr === "src" && document.querySelector('.bm-order input[value=src]').checked; })()`));
await pick(p, "reach"); await settle(p);
ok("control: and it works again", await p.eval(`window.__views[0].arr === "reach" && window.__views[0].lay === window.__views[0].rch`));
await p.close();

// ---- band sizes against the legend, for all programs; a round trip leaves the canvas as it was -------------------------------------------------------
const bandCheck = `(function () {
  var v = window.__views[0], chips = [...document.querySelectorAll(".bm-legend .bm-chip")], out = { prog: v.d.program, n: v.n, chips: [], bands: [], px: [], pxOk: true, colourOk: true, colourBad: [] };
  chips.forEach(function (c) { out.chips.push(parseInt(c.querySelector(".bm-chip-n").textContent.replace(/,/g, ""), 10)); });
  var L = v.rch, b, st = L.start; for (b = 0; b < L.nseg; b++) out.bands.push(st[b + 1] - st[b]);
  var probe = document.createElement("canvas"); probe.width = probe.height = 1; var pc = probe.getContext("2d", { willReadFrequently: true });
  function rgb(css) { pc.clearRect(0, 0, 1, 1); pc.fillStyle = css; pc.fillRect(0, 0, 1, 1); var d = pc.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; }
  function near(a, b2) { return Math.abs(a[0] - b2[0]) <= 2 && Math.abs(a[1] - b2[1]) <= 2 && Math.abs(a[2] - b2[2]) <= 2; }
  // the pixels: walk the bands from the legend's counts alone (rows of perRow cells, a gap between bands) and count the squares that are painted
  var c = v.c, pr = v.perRow, gap = v.gap, dpr = v.dpr, s = Math.max(1, Math.round(v.s * dpr)), cv = v.base, W = cv.width, H = cv.height, img = cv.getContext("2d").getImageData(0, 0, W, H).data, at = 0, ci, bi = 0;
  var uniq = rgb(v.tok.unique);
  for (ci = 0; ci < out.chips.length; ci++) {
    var k = out.chips[ci]; if (!k) continue;
    var rows = Math.ceil(k / pr), painted = 0, r, col, centre = null, corner = null;
    for (r = 0; r < rows; r++) for (col = 0; col < pr; col++) {
      var x0 = Math.round(col * c * dpr), y0 = Math.round((at + r * c) * dpr), x = x0 + (s >> 1), y = y0 + (s >> 1), a = img[(y * W + x) * 4 + 3], idx = r * pr + col;
      if (idx < k) { if (a > 0) painted++; if (idx === 0) { centre = [img[(y * W + x) * 4], img[(y * W + x) * 4 + 1], img[(y * W + x) * 4 + 2]]; corner = [img[(y0 * W + x0) * 4], img[(y0 * W + x0) * 4 + 1], img[(y0 * W + x0) * 4 + 2]]; } }
      else if (a > 0) out.pxOk = false;                      // past the last cell of a band the canvas is empty
    }
    var yb = Math.round((at + rows * c) * dpr) + (s >> 1);   // the row below the band (the gap, or the end of the map) is empty
    if (yb < H) for (col = 0; col < pr; col++) { var xb = Math.round(col * c * dpr) + (s >> 1); if (img[(yb * W + xb) * 4 + 3] > 0) out.pxOk = false; }
    var want = rgb(chips[ci].querySelector(".bm-chip-sw").style.background), good = ci === 1 ? (near(corner, uniq) || near(centre, want) || near(centre, uniq)) : near(centre, want);
    if (!good) { out.colourOk = false; out.colourBad.push([ci, centre, corner, want, uniq]); }
    out.px.push({ k: k, painted: painted });
    at += rows * c + gap; bi++;
  }
  out.h = v.rch.h; out.stageH = v.sh;
  return out;
})()`;
let allBands = true, allPix = true, allTrip = true, allCol = true, report = [];
for (const prog of programs) {
  p = await open(prog, { reduced: "reduce", wait: 1600 });        // the change is at once, so the check does not wait for the motion
  const before = await hash(p);
  await pick(p, "reach"); await b.sleep(150);
  const r = await p.eval(bandCheck);
  const expect = r.chips.filter((x) => x > 0);
  const sameBands = JSON.stringify(expect) === JSON.stringify(r.bands) && r.chips.reduce((a, c) => a + c, 0) === r.n;
  const samePix = r.pxOk && r.px.every((x) => x.painted === x.k);
  allBands = allBands && sameBands; allPix = allPix && samePix; allCol = allCol && r.colourOk;
  if (!sameBands || !samePix || !r.colourOk) report.push(prog + " " + JSON.stringify({ chips: r.chips, bands: r.bands, px: r.px.map((x) => [x.k, x.painted]), pxOk: r.pxOk, colourBad: r.colourBad }));
  await pick(p, "src"); await b.sleep(150);
  const after = await hash(p);
  allTrip = allTrip && before === after;
  if (before !== after) report.push(prog + " round trip differs " + before + " " + after);
  await p.close();
}
ok(`bands: for all ${programs.length} programs the size of every band (legend order, none first) is the legend's count and they add up to the branches`, allBands, report.join(" | "));
ok("bands: for all programs the canvas holds exactly that many cells in each band (a count of the painted squares), none past the end of a band", allPix, report.join(" | "));
ok("bands: the cells of every band are painted in the colour of its legend chip (the band of one tool carries the marks)", allCol, report.join(" | "));
ok("round trip: for all programs the canvas is pixel-identical after source order, bands, source order (instant change)", allTrip, report.join(" | "));

// the round trip by a move (up to 12,000 cells) and by a cross-fade (more), and turned round half way
let tripMotion = true, rep2 = [];
for (const prog of ["bc", "krep", "libyaml", "woff2", "gcal", "xorriso"]) {
  p = await open(prog, { wait: 1800 });
  const before = await hash(p);
  await pick(p, "reach"); const s1 = await settle(p);
  const mid = await hash(p);
  await pick(p, "src"); const s2 = await settle(p);
  const after = await hash(p);
  const rest = await p.eval(`(function () { var v = window.__views[0]; return { slow: v.slow, anim: !!v.anim, fade: !!v.fade, canv: document.querySelectorAll(".bm-stage canvas").length, h: v.sh, lay: v.lay.h }; })()`);
  const good = before === after && mid !== before && !rest.anim && !rest.fade && rest.canv === 1 && Math.max(1, rest.lay) === rest.h && !rest.slow;
  tripMotion = tripMotion && good;
  if (!good) rep2.push(prog + " " + JSON.stringify({ before, mid, after, rest, s1, s2 }));
  // turned round half way: reach, 90 ms later src; the picture at rest is the original again
  await pick(p, "reach"); await b.sleep(90); await pick(p, "src"); await settle(p);
  const after2 = await hash(p);
  tripMotion = tripMotion && after2 === before;
  if (after2 !== before) rep2.push(prog + " turned round differs");
  await p.close();
}
ok("round trip: by a move (bc, Krep, LibYAML, WOFF2) and by a cross-fade (gcal, xorriso), at rest the canvas is pixel-identical, one canvas is left, the stage has the height of the layout; the same after a move turned round half way", tripMotion, rep2.join(" | "));

// ---- hover, pin, keys, table view in both arrangements --------------------------------------------------------------------------------------------
p = await open("woff2", { reduced: "reduce", wait: 1800 });
async function pointAt(i, arr) {          // viewport coordinates of the centre of cell i in the layout in use
  return JSON.parse(await p.eval(`JSON.stringify((function () { var v = window.__views[0], P = v._px(v.lay), r = v.stage.getBoundingClientRect(); return { x: r.left + (P.x[${i}] + v.s * v.dpr / 2) / v.dpr, y: r.top + (P.y[${i}] + v.s * v.dpr / 2) / v.dpr }; })())`));
}
await p.eval(`document.querySelector(".bm-stage").scrollIntoView({ block: "center" })`); await b.sleep(250);
for (const arr of ["src", "reach"]) {
  if (arr === "reach") { await pick(p, "reach"); await b.sleep(200); await p.eval(`document.querySelector(".bm-stage").scrollIntoView({ block: "center" })`); await b.sleep(200); }
  const cells = [5, 1000, 4321, 9000, 11000];
  let hits = true, tips = true, pins = true, info = [];
  for (const i of cells) {
    const c = await pointAt(i);
    await p.move(c.x, c.y); await b.sleep(80);
    const t = JSON.parse(await p.eval(`JSON.stringify((function () { var v = window.__views[0], tip = document.querySelector(".bm-tip"); return { hover: v.hover, hidden: tip.hidden, text: tip.textContent, want: v.fileName[v._fileOf(${i})] + ":" + v.lines[${i}], ring: !v.ringHover.hidden }; })())`));
    if (t.hover !== i) { hits = false; info.push(arr + " hover " + i + " got " + t.hover); }
    if (t.hidden || !t.text.includes(t.want)) { tips = false; info.push(arr + " tip " + i); }
    await p.click(c.x, c.y); await b.sleep(80);
    const pin = JSON.parse(await p.eval(`JSON.stringify((function () { var v = window.__views[0], P = v._px(v.lay), cur = v.cursor, m = /translate\\(([-\\d.]+)px, ?([-\\d.]+)px\\)/.exec(cur.style.transform); return { pin: v.pin, shown: !cur.hidden, x: m ? parseFloat(m[1]) : null, y: m ? parseFloat(m[2]) : null, wx: P.x[${i}] / v.dpr, wy: P.y[${i}] / v.dpr, pad: v.s >= 5 ? 1.5 : 2.5, status: document.querySelector(".bm-inspector").textContent.slice(0, 80) }; })())`));
    if (pin.pin !== i || !pin.shown || Math.abs(pin.x + pin.pad - pin.wx) > 1 || Math.abs(pin.y + pin.pad - pin.wy) > 1) { pins = false; info.push(arr + " pin " + i + " " + JSON.stringify(pin)); }
  }
  ok(`${arr === "src" ? "source order" : "bands"}: the pointer finds the cell under it (hover), the tooltip names its file and line`, hits && tips, info.join(" | "));
  ok(`${arr === "src" ? "source order" : "bands"}: a click pins the cell and the ring is on it`, pins, info.join(" | "));
}
// the pin stays on its cell when the cells move; the keys follow the layout in use
await p.eval(`window.__views[0].setPin(4321, false)`);
await p.eval(`window.__views[0].arrange("src")`); await settle(p);
const pinMoved = JSON.parse(await p.eval(`JSON.stringify((function () { var v = window.__views[0], P = v._px(v.lay), cur = v.cursor, m = /translate\\(([-\\d.]+)px, ?([-\\d.]+)px\\)/.exec(cur.style.transform); return { shown: !cur.hidden, x: parseFloat(m[1]) + 1.5, wx: P.x[4321] / v.dpr, y: parseFloat(m[2]) + 1.5, wy: P.y[4321] / v.dpr, pin: v.pin }; })())`));
ok("pin: the pinned cell keeps its pin when the cells go back to source order, and the ring follows it", pinMoved.pin === 4321 && pinMoved.shown && Math.abs(pinMoved.x - pinMoved.wx) <= 1.5 && Math.abs(pinMoved.y - pinMoved.wy) <= 1.5, JSON.stringify(pinMoved));
await p.eval(`window.__views[0].arrange("reach")`); await settle(p);
const keys = JSON.parse(await p.eval(`JSON.stringify((function () {
  var v = window.__views[0], L = v.rch, bi = 0, out = [], q;
  for (q = 1; q < L.nseg; q++) if (L.start[q + 1] - L.start[q] > L.start[bi + 1] - L.start[bi]) bi = q;     // the largest band: several rows
  var i = L.ord[L.start[bi] + 3];
  v.setPin(i, false);
  function k(key, ctrl) { return v._move(key, ctrl); }
  var rank = function (c) { return L.rk[c]; };
  out.push(["right", rank(k("ArrowRight")) === rank(i) + 1]);
  out.push(["left", rank(k("ArrowLeft")) === rank(i) - 1]);
  out.push(["down", rank(k("ArrowDown")) === rank(i) + v.perRow]);
  out.push(["home", rank(k("Home")) === L.start[bi]]);
  out.push(["end", rank(k("End")) === L.start[bi + 1] - 1]);
  out.push(["pagedown", rank(k("PageDown")) === (bi + 1 < L.nseg ? L.start[bi + 1] : v.n - 1)]);
  out.push(["pageup", rank(k("PageUp")) === L.start[bi]]);
  out.push(["ctrl-home", rank(k("Home", true)) === 0]);
  var j = L.ord[L.start[bi] + v.perRow + 2];
  v.setPin(j, false);
  out.push(["up", rank(k("ArrowUp")) === rank(j) - v.perRow]);
  // the inspector's file buttons follow the files, in either arrangement
  var f = v._fileOf(j);
  out.push(["next file", v._move("PageDown", false, v.src) === v.fileStart[f + 1]]);
  return out;
})())`));
ok("keys: in the arrangement by tools reaching the arrow keys, Home, End and the page keys follow the bands as they are drawn; the file buttons still follow the files", keys.every((x) => x[1]), JSON.stringify(keys.filter((x) => !x[1])));
await p.eval(`document.querySelector(".bm-tables > summary").click()`); await b.sleep(250);
ok("table view: opens and lists the three tables in this arrangement too", await p.eval(`(function () { var d = document.querySelector(".bm-tables"); return d.open && d.querySelectorAll("table").length === 3 && d.querySelectorAll("tbody tr").length > 12; })()`));
await p.close();

// highlight and marks in the bands
p = await open("krep", { reduced: "reduce", wait: 1800 });
await pick(p, "reach"); await b.sleep(150);
const h0 = await hash(p);
await p.eval(`document.querySelectorAll(".bm-chip")[2].click()`); await b.sleep(150);
const h1 = await hash(p);
const hl = await p.eval(bandCheck);
ok("highlight: a legend chip dims the other bands in the arrangement by tools reaching, and the bands stay as they were", h1 !== h0 && hl.pxOk && hl.px.every((x) => x.painted === x.k), hl.pxOk + "");
await p.eval(`document.querySelectorAll(".bm-chip")[2].click()`); await b.sleep(150);
ok("highlight: choosing the chip again restores the picture", (await hash(p)) === h0);
await p.eval(`document.querySelector(".bm-opt input").click()`); await b.sleep(150);
const hm = await hash(p);
await p.eval(`document.querySelector(".bm-opt input").click()`); await b.sleep(150);
ok("marks: the switch for the branches that one tool reaches changes the band of one tool, and back", hm !== h0 && (await hash(p)) === h0);
await p.close();

// ---- keyboard, announcements, the inspector's buttons, the pin on a phone, forced colours ------------------------------------------------------------
// Real key and mouse events, not clicks made by the page.
{
  const sendSpace = async (pp) => { await pp.cmd("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", text: " ", windowsVirtualKeyCode: 32 }); await pp.cmd("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 }); };
  const live = (pp) => pp.eval(`document.getElementById("live").textContent`);
  const waitLive = (pp, re, ms = 1500) => pp.eval(`new Promise(function (r) { var t0 = performance.now(); (function w() { var t = document.getElementById("live").textContent; if (${re}.test(t) || performance.now() - t0 > ${ms}) r(t); else setTimeout(w, 30); })(); })`);
  const WHY = "Available when all tools are shown";
  p = await open("krep", { wait: 1800, reduced: "reduce" });
  await p.eval(`document.querySelector(".bm-order").scrollIntoView({ block: "center" })`); await b.sleep(250);
  await p.eval(`document.querySelector('.bm-order input[value=src]').focus()`);
  await p.key("ArrowRight");
  const k1 = await waitLive(p, "/^Cells arranged/");
  const t1 = JSON.parse(await p.eval(`JSON.stringify({ arr: window.__views[0].arr, checked: document.querySelector('.bm-order input[value=reach]').checked, active: document.activeElement.value })`));
  ok("keyboard: an arrow key on the control arranges the cells and announces it once, focus stays on the control", t1.arr === "reach" && t1.checked && t1.active === "reach" && k1 === "Cells arranged by the number of tools that reach them", JSON.stringify({ t1, k1 }));
  await p.key("Tab");
  ok("keyboard: Tab leaves the control for the map (one tab stop for the group)", await p.eval(`document.activeElement.classList.contains("bm-stage")`));
  await p.key("Tab", { modifiers: 8 });
  ok("keyboard: Shift+Tab returns to the checked option", await p.eval(`document.activeElement.value === "reach"`));
  // choosing a tool while the bands are on puts the cells back, and says so
  await p.eval(`[...document.querySelectorAll(".bm-tool input")].find(function (r) { return r.value === "3"; }).click()`);
  const k2 = await waitLive(p, "/source order/");
  ok("announcements: choosing one tool while the cells are in bands says that they are in source order again", /reaches [\d,]+ of [\d,]+ branches/.test(k2) && / The cells are in source order\.$/.test(k2) && (await p.eval(`window.__views[0].arr`)) === "src", k2);
  // one tool in view: the control is unavailable, and a click, Space or Enter says why; an arrow key is quiet (a screen reader has said that the control is unavailable)
  await p.eval(`document.getElementById("live").textContent = "x"`);
  await p.eval(`document.querySelector('.bm-order input[value=reach]').focus()`);
  await p.key("ArrowLeft"); await b.sleep(250);
  const quiet = await live(p);
  ok("announcements: an arrow key on the unavailable control says nothing and changes nothing", quiet === "x" && (await p.eval(`window.__views[0].arr === "src" && document.querySelector('.bm-order input[value=src]').checked`)), quiet);
  await p.eval(`document.querySelector('.bm-order input[value=reach]').focus()`);
  await sendSpace(p);
  const k3 = await waitLive(p, `/^${WHY}/`);
  ok("announcements: Space on the unavailable control says why (Available when all tools are shown) and changes nothing", k3 === WHY && (await p.eval(`window.__views[0].arr === "src" && document.querySelector('.bm-order input[value=src]').checked`)), k3);
  await p.eval(`document.getElementById("live").textContent = "x"`);
  const rc = JSON.parse(await p.eval(`JSON.stringify((function () { var r = document.querySelector('.bm-order input[value=reach]').closest("label").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })())`));
  await p.click(rc.x, rc.y);
  const k4 = await waitLive(p, `/^${WHY}/`);
  ok("announcements: a mouse click on the unavailable control says why too", k4 === WHY && (await p.eval(`window.__views[0].arr === "src"`)), k4);
  await p.close();

  // the buttons of the inspector follow the cells as they are drawn (the arrow keys do), the file buttons follow the files
  p = await open("woff2", { wait: 1800, reduced: "reduce" });
  const nb = JSON.parse(await p.eval(`JSON.stringify((function () {
    var v = window.__views[0], out = [];
    function press(label) { [...document.querySelectorAll(".bm-steps .bm-btn")].find(function (x) { return x.textContent === label; }).click(); }
    v.arrange("reach");
    var L = v.rch, bi = 2, i = L.ord[L.start[bi] + 1], r = L.rk[i];
    v.setPin(i, false); press("Next branch"); out.push(["bands next", L.rk[v.pin] === r + 1]);
    press("Previous branch"); press("Previous branch"); out.push(["bands previous", L.rk[v.pin] === r - 1]);
    v.setPin(L.ord[L.start[bi + 1] - 1], false); press("Next branch"); out.push(["bands next at the end of a band goes to the next band", L.rk[v.pin] === L.start[bi + 1]]);
    v.arrange("src"); v.setPin(500, false); press("Next branch"); out.push(["source next", v.pin === 501]); press("Previous branch"); press("Previous branch"); out.push(["source previous", v.pin === 499]);
    v.setPin(0, false); press("Previous branch"); out.push(["source previous at the start stays", v.pin === 0]);
    return out;
  })())`));
  ok("inspector: Next branch and Previous branch follow the cells as they are drawn in bands, and by position in source order", nb.every((x) => x[1]), JSON.stringify(nb.filter((x) => !x[1])));
  await p.close();

  // a phone: the map is a frame that scrolls inside the page; after a change of arrangement the ring of the pinned cell is still in it
  for (const [prog, reduced, wait] of [["woff2", "reduce", 0], ["xorriso", "", 600], ["woff2", "", 0]]) {
    p = await open(prog, { w: 390, h: 844, dpr: 2, touch: true, reduced, wait: 2200 });
    const inFrame = `(function () { var v = window.__views[0], c = v.cursor.getBoundingClientRect(), f = v.frame.getBoundingClientRect(); return { shown: !v.cursor.hidden, inside: c.top >= f.top - 1 && c.bottom <= f.bottom + 1, top: Math.round(v.frame.scrollTop), max: v.frame.scrollHeight - v.frame.clientHeight }; })()`;
    await p.eval(`(function () { var v = window.__views[0]; v.frame.scrollIntoView({ block: "start" }); v.setPin(v.n - 1, false, true); })()`); await b.sleep(300);
    const a0 = JSON.parse(await p.eval(`JSON.stringify(${inFrame})`));
    await pick(p, "reach"); await settle(p, 1500); await b.sleep(wait);
    const a1 = JSON.parse(await p.eval(`JSON.stringify(${inFrame})`));
    await pick(p, "src"); await settle(p, 1500); await b.sleep(wait);
    const a2 = JSON.parse(await p.eval(`JSON.stringify(${inFrame})`));
    ok(`phone ${prog}${reduced ? "" : " (animated)"}: the pinned cell is in view in the frame of the map before, after the change to bands and after the change back (frame scrolled to ${a0.top}, ${a1.top}, ${a2.top} of at most ${a0.max}, ${a1.max}, ${a2.max})`, a0.shown && a0.inside && a1.shown && a1.inside && a2.shown && a2.inside, JSON.stringify({ a0, a1, a2 }));
    await p.close();
  }

  // forced colours: when the control is unavailable both options are drawn in the grey of disabled text, and the focus ring of the chosen option is not the colour of its fill
  p = await open("krep", { wait: 1800, forced: "active" });
  await p.eval(`[...document.querySelectorAll(".bm-tool input")].find(function (r) { return r.value === "3"; }).click()`); await b.sleep(200);
  await p.eval(`document.querySelector('.bm-order input[value=src]').focus()`); await p.key("Tab", { modifiers: 8 }); await p.key("Tab"); await b.sleep(100);
  const fc = JSON.parse(await p.eval(`JSON.stringify((function () {
    function col(css, prop) { var e = document.createElement("i"); e.style.cssText = prop + ":" + css; document.body.appendChild(e); var c = getComputedStyle(e)[prop === "outline-color" ? "outlineColor" : "color"]; e.remove(); return c; }
    var src = document.querySelector('.bm-order input[value=src]'), reach = document.querySelector('.bm-order input[value=reach]'), cs = function (i) { return getComputedStyle(i.nextElementSibling); };
    src.focus();
    return { gray: col("GrayText", "color"), reach: cs(reach).color, srcBg: cs(src).backgroundColor, grayBg: col("GrayText", "color"), hl: col("HighlightText", "outline-color"), ring: cs(src).outlineColor, fv: src.matches(":focus-visible"), forced: matchMedia("(forced-colors: active)").matches };
  })())`));
  ok("forced colours: the option that is not chosen is GrayText while the control is unavailable, and the focus ring of the chosen option is HighlightText", fc.forced && fc.reach === fc.gray && fc.srcBg === fc.grayBg && (!fc.fv || fc.ring === fc.hl), JSON.stringify(fc));
  await p.close();
}

// ---- motion ---------------------------------------------------------------------------------------------------------------------------------------------------------
// 200 ms on one animation frame loop; the stage's height steps once, in either direction (up to the taller layout before the cells move, or down to the shorter one
// after they have arrived; confetti is the program whose bands are taller than its files); idle runs nothing; a second click turns the move round from where the cells are
for (const prog of ["krep", "woff2", "confetti"]) {
  p = await open(prog, { count: true, wait: 2000 });
  await p.eval(`document.querySelector(".bm-order").scrollIntoView({ block: "center" })`); await b.sleep(300);
  const idle0 = JSON.parse(await p.eval(`JSON.stringify({ t: window.__live.t.size, i: window.__live.i.size, r: window.__live.r.size })`));
  const move = (to) => p.eval(`new Promise(function (done) {
    var v = window.__views[0], L = window.__live, h0 = v.sh, steps = [], frames = 0, t0 = performance.now(), hs = Math.max(1, v.src.h), hr = Math.max(1, v.rch.h);
    L.rafCalls = 0; L.maxPending = 0;
    var probe = function (ts) { frames++; if (v.sh !== (steps.length ? steps[steps.length - 1][1] : h0)) steps.push([performance.now() - t0, v.sh]);
      if (!v.anim && performance.now() - t0 > 40 || performance.now() - t0 > 1500) { done({ ms: performance.now() - t0, h0: h0, steps: steps, frames: frames, rafCalls: L.rafCalls, maxPending: L.maxPending, srcH: hs, rchH: hr, end: v.sh }); return; }
      requestAnimationFrame(probe); };
    document.querySelector('.bm-order input[value=${to}]').click();
    steps.length === 0 && v.sh !== h0 && steps.push([0, v.sh]);       // a step made by the click itself, before the first frame
    requestAnimationFrame(probe);
  })`);
  const run = await move("reach");
  await b.sleep(500);
  const idle1 = JSON.parse(await p.eval(`JSON.stringify({ t: window.__live.t.size, i: window.__live.i.size, r: window.__live.r.size })`));
  const back = await move("src");
  await b.sleep(300);
  ok(`${prog}: the move takes 200 ms (frames over 160 to 320 ms) and is drawn on one animation frame loop (at most 2 frames pending: ours and the probe's)`, run.ms >= 160 && run.ms <= 320 && run.maxPending <= 2 && back.ms >= 160 && back.ms <= 320 && back.maxPending <= 2, JSON.stringify({ ms: Math.round(run.ms), frames: run.frames, rafCalls: run.rafCalls, maxPending: run.maxPending, back: Math.round(back.ms) }));
  const stepOk = (r, to) => {
    const target = Math.max(1, to === "reach" ? r.rchH : r.srcH), taller = Math.max(r.srcH, r.rchH);
    if (r.end !== target) return false;
    if (r.srcH === r.rchH) return r.steps.length === 0;
    if (target === taller) return r.steps.length === 1 && r.steps[0][1] === taller && r.steps[0][0] < 40;                  // grow, before the cells move
    return r.steps.length === 1 && r.steps[0][1] === target && r.steps[0][0] > r.ms - 80;                                     // shrink, after they have arrived
  };
  ok(`${prog}: the height of the stage steps once, up to the taller layout before the cells move or down to the shorter after they have arrived, never in between (source order ${run.srcH} px, bands ${run.rchH} px)`, stepOk(run, "reach") && stepOk(back, "src"), JSON.stringify({ run, back }));
  ok(`${prog}: idle, nothing is running (no timer, no interval, no animation frame: before ${JSON.stringify(idle0)}, after ${JSON.stringify(idle1)})`, idle1.t === 0 && idle1.i === 0 && idle1.r === 0 && idle0.i === 0 && idle0.r === 0, JSON.stringify({ idle0, idle1 }));
  // turn round: src, 80 ms into the move to the bands, src again; from where the cells are
  await pick(p, "reach"); await b.sleep(80);
  const turn = JSON.parse(await p.eval(`JSON.stringify((function () {
    var v = window.__views[0], m = v.anim, before = Float32Array.from(m.x), i;
    var moved = 0; for (i = 0; i < v.n; i++) if (Math.abs(before[i] - m.fx[i]) > 0.5) moved++;
    document.querySelector('.bm-order input[value=src]').click();
    var m2 = v.anim, same = m2 === m, fromHere = true; for (i = 0; i < v.n; i++) { if (Math.abs(m2.fx[i] - before[i]) > 0.01) fromHere = false; }
    var towardsSrc = m2.to === v._px(v.src);
    return { same: same, fromHere: fromHere, towardsSrc: towardsSrc, moved: moved, notAtStart: moved > v.n * 0.2, raf: m2.raf !== 0 };
  })())`));
  ok(`${prog}: a click in the middle of the move turns it round from the current positions, in the same loop (it was ${turn.moved} of the cells away from the start)`, turn.same && turn.fromHere && turn.towardsSrc && turn.notAtStart && turn.raf, JSON.stringify(turn));
  await settle(p);
  await p.close();
}

// reduced motion and a hidden page: the change is at once
p = await open("woff2", { reduced: "reduce", count: true });
await pick(p, "reach"); await b.sleep(150);
ok("reduced motion: the change is at once, nothing runs", await p.eval(`(function () { var v = window.__views[0]; return v.arr === "reach" && v.lay === v.rch && !v.anim && !v.fade && window.__live.r.size === 0 && v.sh === Math.max(1, v.rch.h); })()`));
await p.close();
p = await open("woff2", { count: true });
await p.eval(`Object.defineProperty(document, "hidden", { configurable: true, get: function () { return true; } })`);
await pick(p, "reach"); await b.sleep(150);     // (the announcement is written 30 ms later: that is the only timer)
ok("hidden page: the change is at once, nothing runs", await p.eval(`(function () { var v = window.__views[0]; return v.arr === "reach" && v.lay === v.rch && !v.anim && !v.fade && window.__live.r.size === 0 && window.__live.t.size === 0; })()`));
await p.close();

// the cross-fade: 120 ms, two finished pictures, a canvas of the old one over the new one, gone afterwards
for (const prog of ["xorriso", "gawk"]) {
  p = await open(prog, { count: true, wait: 2200 });
  await p.eval(`document.querySelector(".bm-order").scrollIntoView({ block: "center" })`); await b.sleep(300);
  await pick(p, "reach");
  const mid = JSON.parse(await p.eval(`JSON.stringify((function () { var v = window.__views[0], f = v.fade, o = f ? getComputedStyle(f) : null; return { fade: !!f, anim: !!v.anim, canv: document.querySelectorAll(".bm-stage canvas").length, trans: o ? o.transitionDuration : "", opacityEnd: f ? f.style.opacity : "", raf: window.__live.r.size, sh: v.sh, taller: Math.max(v.src.h, v.rch.h), cls: f ? f.className : "" }; })())`));
  await b.sleep(400);
  const end = JSON.parse(await p.eval(`JSON.stringify((function () { var v = window.__views[0]; return { fade: !!v.fade, canv: document.querySelectorAll(".bm-stage canvas").length, t: window.__live.t.size, r: window.__live.r.size, sh: v.sh, h: Math.max(1, v.rch.h) }; })())`));
  ok(`${prog}: more than 12,000 cells change by a 120 ms cross-fade: one canvas over the other, no animation frames, the stage as tall as the taller layout meanwhile`, mid.fade && !mid.anim && mid.canv === 2 && mid.trans === "0.12s" && mid.opacityEnd === "0" && mid.raf === 0 && mid.sh === mid.taller, JSON.stringify(mid));
  ok(`${prog}: afterwards the old picture is gone, the stage has the height of the new layout and nothing is running`, !end.fade && end.canv === 1 && end.t === 0 && end.r === 0 && end.sh === end.h, JSON.stringify(end));
  await p.close();
}

// the guard: an animation frame of 12 ms or more ends the move, and the changes of the next 30 seconds are cross-fades; one stall does not decide for the life of the page.
// The frame is made slow by 14 ms of work in the page, in the animation frames only (the first draw, made in the click, is no animation frame and is not judged as one).
const SLOWEN = (inFrame) => `(function () { var v = window.__views[0], f = v._paintUnique; v._paintUnique = function (c) { if (c && ${inFrame ? "v.anim && v.anim.t" : "!(v.anim && v.anim.t)"}) { var t = performance.now(); while (performance.now() - t < 14); } return f.apply(this, arguments); }; })()`;
p = await open("krep", { count: true });
await p.eval(`document.querySelector(".bm-order").scrollIntoView({ block: "center" })`); await b.sleep(300);
await p.eval(SLOWEN(true));
await pick(p, "reach"); await b.sleep(120);
const g1 = JSON.parse(await p.eval(`JSON.stringify((function () { var v = window.__views[0]; return { slow: !!v.slow, anim: !!v.anim, arr: v.arr, lay: v.lay === v.rch, r: window.__live.r.size, sh: v.sh, h: Math.max(1, v.rch.h) }; })())`));
ok("guard: an animation frame of 14 ms ends the move at once (the cells are in their places, nothing is running)", g1.slow && !g1.anim && g1.arr === "reach" && g1.lay && g1.r === 0 && g1.sh === g1.h, JSON.stringify(g1));
await p.eval(`(function () { var v = window.__views[0]; delete v._paintUnique; })()`);
await pick(p, "src");
const g2 = JSON.parse(await p.eval(`JSON.stringify((function () { var v = window.__views[0]; return { fade: !!v.fade, anim: !!v.anim, canv: document.querySelectorAll(".bm-stage canvas").length }; })())`));
ok("guard: the next change is a cross-fade", g2.fade && !g2.anim && g2.canv === 2, JSON.stringify(g2));
await settle(p);
await p.eval(`window.__views[0].slow = performance.now() - 31000`);
await pick(p, "reach");
const g3 = JSON.parse(await p.eval(`JSON.stringify((function () { var v = window.__views[0]; return { anim: !!v.anim, fade: !!v.fade }; })())`));
ok("guard: after 30 seconds the next change is a move again (a stall that was seen once does not decide for the life of the page)", g3.anim && !g3.fade, JSON.stringify(g3));
await settle(p);
await p.eval(`window.__views[0].slow = performance.now()`);
await p.viewport(900, 900, 1, false); await b.sleep(500);
ok("guard: a new width is a new bitmap, and the slow frame that was seen no longer counts", await p.eval(`window.__views[0].slow === 0`));
await p.close();
// the first draw: when drawing the cells alone takes 5 ms or more the change is a cross-fade at once (no stutter first), and it is not remembered
p = await open("krep", { count: true });
await p.eval(`document.querySelector(".bm-order").scrollIntoView({ block: "center" })`); await b.sleep(300);
await p.eval(SLOWEN(false));
await pick(p, "reach");
const d1 = JSON.parse(await p.eval(`JSON.stringify((function () { var v = window.__views[0]; return { fade: !!v.fade, anim: !!v.anim, slow: v.slow, canv: document.querySelectorAll(".bm-stage canvas").length, raf: window.__live.r.size, lay: v.lay === v.rch }; })())`));
ok("first draw: a first draw of 14 ms makes the change a cross-fade at once, with no animation frame, and nothing is remembered about it", d1.fade && !d1.anim && d1.slow === 0 && d1.canv === 2 && d1.raf === 0 && d1.lay, JSON.stringify(d1));
await settle(p);
await p.eval(`(function () { var v = window.__views[0]; delete v._paintUnique; })()`);
await pick(p, "src");
ok("first draw: the next change is a move again", await p.eval(`!!window.__views[0].anim && !window.__views[0].fade`));
await settle(p);
await p.close();

// one bitmap: a change of arrangement never makes a new bitmap (its height is that of the taller layout), the stage clips it, and a cross-fade draws the new picture once
for (const prog of ["xorriso", "woff2", "confetti"]) {
  p = await open(prog, { count: true, wait: 2200 });
  await p.eval(`document.querySelector(".bm-order").scrollIntoView({ block: "center" })`); await b.sleep(300);
  const r = JSON.parse(await p.eval(`new Promise(function (done) {
    var v = window.__views[0], cv = v.base, h0 = cv.height, w0 = cv.width, n = 0, f = v._repaint, setH = 0, out = {};
    v._repaint = function () { n++; return f.apply(this, arguments); };
    var d = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "height"); Object.defineProperty(cv, "height", { configurable: true, get: function () { return d.get.call(cv); }, set: function (x) { setH++; d.set.call(cv, x); } });
    document.querySelector('.bm-order input[value=reach]').click();
    setTimeout(function () { out.afterReach = { n: n, setH: setH, same: cv.height === h0 && cv.width === w0, fade: !!v.fade, anim: !!v.anim };
      setTimeout(function () { out.rest = { n: n, setH: setH, same: cv.height === h0, fade: !!v.fade, anim: !!v.anim, sh: v.sh, h: Math.max(1, v.rch.h), taller: Math.max(v.src.h, v.rch.h), css: getComputedStyle(v.stage).overflowX + "|" + getComputedStyle(v.stage).overflowY, bitmap: cv.style.height };
        document.querySelector('.bm-order input[value=src]').click();
        setTimeout(function () { out.back = { n: n, setH: setH, same: cv.height === h0, sh: v.sh, h: Math.max(1, v.src.h) }; done(JSON.stringify(out)); }, 500); }, 450); }, 60);
  })`));
  const css = r.rest.css === "clip|clip";
  const noNew = r.afterReach.same && r.rest.same && r.back.same && r.afterReach.setH === 0 && r.back.setH === 0 && parseFloat(r.rest.bitmap) === r.rest.taller;
  ok(`${prog}: a change of arrangement makes no new bitmap (its height is the taller layout's ${r.rest.taller} px, never set again), the stage clips it (overflow ${r.rest.css}) and has the height of the layout in use at rest`, css && noNew && r.rest.sh === r.rest.h && r.back.sh === r.back.h, JSON.stringify(r));
  if (bigPrograms.includes(prog)) ok(`${prog}: a cross-fade draws the new picture once (one repaint in the change, none when the old picture has gone)`, r.afterReach.n === 1 && r.rest.n === 1, JSON.stringify({ afterReach: r.afterReach.n, rest: r.rest.n }));
  await p.close();
}

}

// ---- the frame times -----------------------------------------------------------------------------------------------------------------------------------------------
// Frame cost = from the start of an animation frame to the end of its rendering, counted for the frames in which the cells move (a message posted by a probe that is
// registered before the page's own callback, so that the page's drawing falls inside the frame; frames after the cells have arrived are not counted). The click handler is the
// time the click itself takes (the change of the control, and for a cross-fade the whole drawing of the new picture). A raster or GPU time is not seen from the page.
const frameCost = (to) => `new Promise(function (done) {
  var v = window.__views[0], ch = new MessageChannel(), t0 = 0, costs = [], gaps = [], last = 0, start = performance.now(), saw = false, moving = false, handler = 0, firstAt = 0, draw = -1, fr = v._frame;
  v._frame = function () { var t = performance.now(), r = fr.apply(this, arguments); if (draw < 0) draw = performance.now() - t; return r; };      // (the first call is the draw of the cells at the start of the move, made in the click)
  ch.port1.onmessage = function () { if (moving) costs.push(performance.now() - t0); };
  var probe = function (ts) {
    moving = !!v.anim; t0 = performance.now();
    if (moving) { ch.port2.postMessage(0); if (last) gaps.push(ts - last); last = ts; if (!firstAt) firstAt = t0 - start; }
    if (v.fade) saw = true;
    if (!v.anim && !v.fade && performance.now() - start > 60 || performance.now() - start > 1500) { setTimeout(function () { done({ costs: costs, gaps: gaps, byFrame: v.slow > 0, any: saw || v.slow > 0, big: v.big, handler: handler, draw: draw, ms: performance.now() - start }); }, 40); return; }
    requestAnimationFrame(probe); };
  requestAnimationFrame(probe);
  var c0 = performance.now(); document.querySelector('.bm-order input[value=${to}]').click(); handler = performance.now() - c0;
})`;
const VIEWS = { desktop: { w: 1440, h: 900, dpr: 1 }, "desktop dpr 2": { w: 1440, h: 900, dpr: 2 }, phone: { w: 390, h: 844, dpr: 3 } };
const plan = [["krep", "desktop", [1, 4]], ["woff2", "desktop", [1, 4]], ["xorriso", "desktop", [1, 4]]];
if (timing) plan.push(["libyaml", "desktop", [4]], ["xmlwf", "desktop", [4]], ["sed", "desktop", [4]], ["du", "desktop", [4]], ["woff2", "desktop", [6]],
  ["krep", "desktop dpr 2", [1, 4]], ["woff2", "desktop dpr 2", [1, 4]],
  ["krep", "phone", [1, 4, 6]], ["woff2", "phone", [1, 4]], ["du", "phone", [4]], ["gawk", "phone", [1, 4]], ["xorriso", "phone", [1, 4]]);
const table = [];
for (const [prog, view, rates] of plan) {
  for (const rate of rates) {
    const costs = [], gaps = [], handlers = [], draws = []; let engaged = 0, byFrame = 0, runs = 0, frames = 0, msAll = [], big = false;
    for (let k = 0; k < (timing ? 8 : 3); k++) {
      const V = VIEWS[view];
      p = await open(prog, { w: V.w, h: V.h, dpr: V.dpr, wait: 1800 });
      await p.eval(`document.querySelector(".bm-order").scrollIntoView({ block: "center" })`); await b.sleep(250);
      await p.cmd("Emulation.setCPUThrottlingRate", { rate });
      const r = await p.eval(frameCost("reach"));
      await p.cmd("Emulation.setCPUThrottlingRate", { rate: 1 });
      runs++; if (r.any) engaged++; if (r.byFrame) byFrame++; big = r.big;
      costs.push(...r.costs); gaps.push(...r.gaps); handlers.push(r.handler); if (r.draw >= 0) draws.push(r.draw); frames += r.costs.length; msAll.push(r.ms);
      await p.close();
    }
    table.push({ prog, view, rate, runs, engaged, byFrame, big, frames, costMed: q(costs, 0.5), costP95: q(costs, 0.95), costMax: costs.length ? Math.max(...costs) : null, gapMed: q(gaps, 0.5), gapP95: q(gaps, 0.95), gapMax: gaps.length ? Math.max(...gaps) : null,
      handlerMed: q(handlers, 0.5), handlerMax: Math.max(...handlers), drawMed: q(draws, 0.5), drawMax: draws.length ? Math.max(...draws) : null, ms: Math.round(q(msAll, 0.5)) });
  }
}
const f1 = (x) => (x == null ? "-" : x.toFixed(1)).padStart(5);
console.log(`frame times${gpu ? " (GPU on)" : " (software canvas)"}: the first change of a fresh page, ${timing ? 8 : 3} loads for each row; frames are the animation frames in which the cells move`);
console.log("program  view           CPU   cross-fade (of those, by a frame)   click med/max    first draw med/max   frames   cost med / p95 / max          gap med / p95 / max         time");
for (const t of table) console.log(`${t.prog.padEnd(8)} ${t.view.padEnd(14)} x${t.rate}    ${String(t.engaged).padStart(2)}/${t.runs}${t.big ? " (size)" : ""} (${t.byFrame})`.padEnd(66) + `${f1(t.handlerMed)} ${f1(t.handlerMax)}      ${f1(t.drawMed)} ${f1(t.drawMax)}      ${String(t.frames).padStart(5)}   ${[t.costMed, t.costP95, t.costMax].map(f1).join(" ")}      ${[t.gapMed, t.gapP95, t.gapMax].map(f1).join(" ")}      ${t.ms} ms`);
// ---- the phone: the control fits and wraps, no sideways scroll ------------------------------------------------------------------------------------------------------------
for (const w of [360, 390]) {
  p = await open("krep", { w, h: 800, dpr: 2, touch: true, wait: 2000 });
  const m = JSON.parse(await p.eval(`JSON.stringify((function () { var o = document.querySelector(".bm-order"), g = o.querySelector(".seg"), r = g.getBoundingClientRect(), labels = [...g.querySelectorAll("label > span")].map(function (e) { return Math.round(e.getBoundingClientRect().height); });
    var card = document.querySelector("#mapbox").getBoundingClientRect(); return { sw: document.documentElement.scrollWidth, iw: innerWidth, right: Math.round(r.right), card: Math.round(card.right), h: labels, wrap: g.getBoundingClientRect().top > o.querySelector(".bm-order-k").getBoundingClientRect().bottom - 2 }; })())`));
  ok(`phone ${w}: no sideways scroll, the control lies inside the card, each option is at least 40 px high under a touch screen (${m.h.join(", ")})`, m.sw <= m.iw && m.right <= m.card && m.h.every((x) => x >= 40), JSON.stringify(m));
  await p.close();
}

// ---- the phone: after "By tools reaching" the frame shows the first band that has colour (the band of the unreached branches comes first and can fill the frame) ------------------
for (const prog of ["woff2", "xorriso", "krep"]) {
  for (const reduced of ["reduce", ""]) {
    p = await open(prog, { w: 390, h: 844, dpr: 2, touch: true, reduced, wait: 2200 });
    await p.eval(`window.__views[0].frame.scrollIntoView({ block: "start" })`); await b.sleep(200);
    await pick(p, "reach"); await settle(p, 1500); await b.sleep(reduced ? 200 : 700);
    const r = JSON.parse(await p.eval(`JSON.stringify((function () {
      var v = window.__views[0], L = v.rch, f = v.frame, top = v.stage.getBoundingClientRect().top - f.getBoundingClientRect().top + f.scrollTop, max = f.scrollHeight - f.clientHeight;
      return { scrolls: max > 1, st: Math.round(f.scrollTop), want: Math.round(Math.min(top + (L.top[1] || 0), max)), none: v.bs[1] - v.bs[0], nseg: L.nseg, max: Math.round(max) };
    })())`));
    const expect = r.scrolls && r.none > 0 && r.nseg > 1;
    ok(`phone ${prog}${reduced ? "" : " (animated)"}: by tools reaching, the frame of the map is scrolled to the first band that has colour (${r.st} of at most ${r.max}, wanted ${r.want}; ${r.none} unreached cells)`,
      expect ? Math.abs(r.st - r.want) <= 3 && r.st > 0 : true, JSON.stringify(r));
    await pick(p, "src"); await settle(p, 1500); await b.sleep(reduced ? 200 : 700);
    const back = await p.eval(`Math.round(window.__views[0].frame.scrollTop)`);
    ok(`phone ${prog}${reduced ? "" : " (animated)"}: back in source order the frame is at the top`, back === 0, String(back));
    await p.close();
  }
}

// ---- screenshots and the frames of the move (--shots DIR) ------------------------------------------------------------------------------------------------------------------
if (shots) {
  for (const prog of ["krep", "woff2"]) for (const w of [1440, 390]) for (const scheme of ["light", "dark"]) for (const arr of ["src", "reach"]) {
    p = await open(prog, { w, h: w === 1440 ? 1000 : 844, dpr: w === 1440 ? 1 : 2, scheme, reduced: "reduce", wait: 1800 });
    if (arr === "reach") { await pick(p, "reach"); await b.sleep(300); }
    const r = JSON.parse(await p.eval(`JSON.stringify((function () { var e = document.querySelector("#mapbox").closest(".card"), x = e.getBoundingClientRect(); return { x: x.left + scrollX, y: x.top + scrollY, w: x.width, h: x.height }; })())`));
    await p.shot(join(shots, `${prog}-${w}-${scheme}-${arr}.png`), { full: true, clip: { x: r.x, y: r.y, width: r.w, height: r.h } });
    await p.close();
  }
  // the frames of the move, copied from the canvas as they are drawn (each animation frame, in the order the page draws them), laid out on one sheet
  for (const prog of ["krep", "woff2"]) for (const to of ["reach", "src"]) {
    p = await open(prog, { wait: 1800 });
    await p.eval(`document.querySelector(".bm-order").scrollIntoView({ block: "center" })`); await b.sleep(300);
    if (to === "src") { await pick(p, "reach"); await settle(p); await b.sleep(200); }
    const sheet = await p.eval(`new Promise(function (done) {
      var v = window.__views[0], frames = [], t0 = performance.now(), cv = v.base, rec = function (ts) {
        var c = document.createElement("canvas"); c.width = cv.width; c.height = Math.max(cv.height, 1); c.getContext("2d").drawImage(cv, 0, 0); frames.push({ c: c, t: ts });
        if (!v.anim && frames.length > 1 || performance.now() - t0 > 1000) { finish(); return; } requestAnimationFrame(rec); };
      function finish() {
        var n = frames.length, cols = 4, rows = Math.ceil(n / cols), w = cv.width, h = cv.height, pad = 6, lab = 16, out = document.createElement("canvas");
        out.width = cols * (w + pad) + pad; out.height = rows * (h + pad + lab) + pad; var x = out.getContext("2d");
        x.fillStyle = "#fff"; x.fillRect(0, 0, out.width, out.height); x.font = "12px sans-serif";
        frames.forEach(function (f, i) { var cx = pad + (i % cols) * (w + pad), cy = pad + Math.floor(i / cols) * (h + pad + lab); x.fillStyle = "#f4f4f5"; x.fillRect(cx, cy + lab, w, h); x.drawImage(f.c, cx, cy + lab); x.fillStyle = "#000"; x.fillText("frame " + i + "   " + Math.round(f.t - frames[0].t) + " ms", cx, cy + 12); });
        done({ url: out.toDataURL("image/png"), n: n, ms: Math.round(frames[n - 1].t - frames[0].t) });
      }
      document.querySelector('.bm-order input[value=${to}]').click();
      requestAnimationFrame(rec);
    })`);
    writeFileSync(join(shots, `frames-${prog}-to-${to}.png`), Buffer.from(sheet.url.split(",")[1], "base64"));
    console.log(`frames of the move ${prog} to ${to}: ${sheet.n} frames over ${sheet.ms} ms`);
    await p.close();
  }
}

await b.close();
server.close();
console.log(failed ? `${failed} checks failed` : "all checks passed");
process.exit(failed ? 1 : 0);
