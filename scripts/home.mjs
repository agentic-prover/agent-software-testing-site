// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The Agent Software Testing authors
// Checks of the figures of the front page in headless Chrome against a built site served over loopback: the branch map fills file by file in 1.2 s at most and then leaves nothing of
// the animation; under prefers-reduced-motion and without scripts it is the complete picture at once; every branch of the program is a cell, before and after the box beside the
// map names another program (the list holds every program, narrows as a name is typed, and the address keeps the program); the key of the strip makes one tool stand out; nothing is
// asked for until a visitor does something; a click, a tap or the Enter key on a cell of the map opens the popup of the program page with a link to the page of the program; no script error.
//   node scripts/home.mjs [--dist dist] [--port 9455]
// Prints PASS or FAIL per check and exits with status 1 when one fails.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { launch } from "./cdp.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const arg = (name, dflt) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : dflt; };
const dist = resolve(root, arg("dist", "dist"));
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const asked = [];      // every path that the server was asked for, in order
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  asked.push(p);
  const f = join(dist, p === "/" ? "index.html" : p);
  if (!f.startsWith(dist) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;
const b = await launch({ port: Number(arg("port", 9455)) });
let failed = 0;
const ok = (name, cond, extra = "") => { if (!cond) failed++; console.log(cond ? "PASS" : "FAIL", name, extra); };

// the cells of the map that is shown: a run of cells is one segment of a path (M x y h length), cut into cells by the dash pattern of its group
const CELLS = `(function () {
  var svg = Array.prototype.filter.call(document.querySelectorAll("#hm-stage .hm-svg"), function (s) { return s.getBoundingClientRect().width > 0; })[0];
  if (!svg) return -1;
  var g = svg.querySelector("g"), s = parseFloat(g.getAttribute("stroke-width")), da = (g.getAttribute("stroke-dasharray") || "").split(" "), gap = da.length > 1 ? parseFloat(da[1]) : 0, n = 0;
  Array.prototype.forEach.call(svg.querySelectorAll("path"), function (p) {
    var re = /M[-\\d.]+ [-\\d.]+h([-\\d.]+)/g, m, d = p.getAttribute("d");
    while ((m = re.exec(d))) n += Math.round((parseFloat(m[1]) + gap) / (s + gap));
  });
  return n;
})()`;
// a drawing that is not shown (the one for the other width) has no animation and reports the first keyframe, so only the shown one is counted
const CLIPPED = `Array.prototype.filter.call(document.querySelectorAll("#hm-stage .hm-svg"), function (s) { return s.getBoundingClientRect().width > 0; }).reduce(function (n, s) { return n + Array.prototype.filter.call(s.querySelectorAll(".hm-f"), function (g) { var c = getComputedStyle(g).clipPath; return c && c !== "none"; }).length; }, 0)`;
const ANIMS = `document.getAnimations().filter(function (a) { return a.animationName === "hm-fill"; }).length`;

async function open(path, { w = 1440, h = 900, reduced = "", nojs = false, wait = 150 } = {}) {
  const p = await b.newPage();
  await p.viewport(w, h, 1, false);
  await p.media({ scheme: "light", reduced });
  if (nojs) await p.cmd("Emulation.setScriptExecutionDisabled", { value: true });
  await p.goto(base + path, wait);
  return p;
}

// ---- with motion: the map plays once, in 1.2 s at most, and leaves nothing behind ----------------------------------------------
// A recorder in the page looks at every frame from the start of the document (a fixed wait would depend on how busy the machine is): the most animations and clipped files seen
// at once, and the latest end of a file's animation (delay plus length).
const RECORD = `(function () {
  var rec = window.__hm = { anims: 0, clipped: 0, end: 0, frames: 0 }, t0 = performance.now();
  function shown() { return Array.prototype.filter.call(document.querySelectorAll("#hm-stage .hm-svg"), function (s) { return s.getBoundingClientRect().width > 0; }); }
  function tick() {
    var a = document.getAnimations().filter(function (x) { return x.animationName === "hm-fill"; });
    rec.anims = Math.max(rec.anims, a.length);
    a.forEach(function (x) { var t = x.effect.getComputedTiming(); rec.end = Math.max(rec.end, t.delay + t.duration); });
    var c = 0; shown().forEach(function (s) { Array.prototype.forEach.call(s.querySelectorAll(".hm-f"), function (g) { var v = getComputedStyle(g).clipPath; if (v && v !== "none") c++; }); });
    rec.clipped = Math.max(rec.clipped, c); rec.frames++;
    if (performance.now() - t0 < 4000) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})()`;
let p = await b.newPage();
await p.viewport(1440, 900, 1, false);
await p.media({ scheme: "light" });
await p.cmd("Page.addScriptToEvaluateOnNewDocument", { source: `document.addEventListener("DOMContentLoaded", function () { ${RECORD} });` });
await p.goto(base + "index.html", 4500);
const rec = await p.eval(`window.__hm`);
ok("motion: the map is revealed after load (files are clipped, animations run)", rec.anims > 0 && rec.clipped > 0, JSON.stringify(rec));
ok("motion: the last file ends within 1,200 ms of the start", rec.end > 0 && rec.end <= 1200, "ends at " + rec.end + " ms");
ok("motion: afterwards no animation is left and no file is clipped", (await p.eval(ANIMS)) === 0 && (await p.eval(CLIPPED)) === 0);
ok("motion: no script error", p.logs.filter((l) => /^(error|EXCEPTION)/.test(l)).length === 0, p.logs.join("|"));
const branches = await p.eval(`Number(document.querySelector("#hm-count").textContent.split(" ")[0].replace(/,/g, ""))`);
ok("map: every branch of the program is a cell", (await p.eval(CELLS)) === branches && branches > 1000, `${await p.eval(CELLS)} cells, ${branches} branches`);
const legend = await p.eval(`Array.prototype.map.call(document.querySelectorAll("#hm-lg b"), function (b) { return Number(b.textContent.replace(/,/g, "")); }).reduce(function (a, b) { return a + b; }, 0)`);
ok("map: the counts of the key add up to the branches of the program", legend === branches, `${legend} of ${branches}`);

// ---- nothing is asked for before a visitor does something --------------------------------------------------------------------------
ok("load: no data file was asked for while the page opened and played", !asked.some((x) => x.startsWith("/data/")), asked.filter((x) => x.startsWith("/data/")).join(" "));
ok("load: the box beside the map names the program that is drawn", (await p.eval(`document.querySelector("#hm-sel").value`)) === "bc" && (await p.eval(`document.querySelectorAll("#hm-list option").length`)) === 0);

// ---- the box beside the map: a list of programs that narrows as a name is typed, and draws the program that is chosen ------------------------------
// The list is the browser's own (a datalist); a visitor's pick arrives as an input event whose value is a name of the list, which is what is sent here.
const names = (n) => p.eval(`Array.prototype.map.call(document.querySelectorAll("#hm-list option"), function (o) { return o.value; })`);
await p.eval(`document.querySelector("#hm-sel").focus()`); await b.sleep(400);
const all = await names();
ok("box: on focus it is empty (the drawn program is its placeholder) and the list holds every program, in alphabetical order", (await p.eval(`document.querySelector("#hm-sel").value`)) === "" && (await p.eval(`document.querySelector("#hm-sel").placeholder`)) === "bc"
  && all.length === 18 && JSON.stringify(all) === JSON.stringify(all.slice().sort((x, y) => x.toLowerCase() < y.toLowerCase() ? -1 : 1)), all.join(","));
ok("box: the files of the programs were asked for by that first focus and by nothing before it", asked.filter((x) => x.startsWith("/data/")).join(" ") === "/data/" + (await p.eval(`document.querySelector(".home").getAttribute("data-src")`)).replace(/^data\//, "") + "programs.json");
await p.eval(`(function () { var s = document.querySelector("#hm-sel"); s.value = "xo"; s.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "o" })); })()`); await b.sleep(250);
ok("box: typing part of a name narrows the list", JSON.stringify(await names()) === JSON.stringify(["xorriso"]) && (await p.eval(`document.querySelector("#hm-name").textContent`)) === "bc");
await p.eval(`(function () { var s = document.querySelector("#hm-sel"); s.value = "xorriso"; s.dispatchEvent(new Event("input", { bubbles: true })); })()`);
await b.sleep(1100);
const x = JSON.parse(await p.eval(`JSON.stringify({ name: document.querySelector("#hm-name").textContent, count: document.querySelector("#hm-count").textContent, prog: document.querySelector("#map").getAttribute("data-program"), href: document.querySelector("#hm-open").getAttribute("href"), cells: ${CELLS}, live: document.querySelector("#live").textContent, hash: location.hash, value: document.querySelector("#hm-sel").value })`));
ok("box: xorriso is named, counted and linked", x.name === "xorriso" && x.count.startsWith("54,607 branches") && x.prog === "xorriso" && x.href === "programs/xorriso.html#map" && x.value === "xorriso", JSON.stringify(x));
ok("box: every branch of the program is a cell", x.cells === 54607, String(x.cells));
ok("box: the change is said in the live region", /Branch map of xorriso/.test(x.live), x.live);
ok("box: the address names the program (#p=xorriso)", x.hash === "#p=xorriso", x.hash);
await p.eval(`(function () { var s = document.querySelector("#hm-sel"); s.value = "BC"; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
await b.sleep(1100);
ok("box: a change event with a name that is typed in capitals draws bc again, the same cells, and the address is empty", (await p.eval(CELLS)) === branches && (await p.eval(`document.querySelector("#hm-name").textContent`)) === "bc" && ["", "#"].includes(await p.eval("location.hash")));
await p.eval(`(function () { var s = document.querySelector("#hm-sel"); s.value = "zzz"; s.dispatchEvent(new Event("change", { bubbles: true })); s.dispatchEvent(new Event("blur")); })()`); await b.sleep(300);
ok("box: a text that names no program leaves the drawn one and puts its name back", (await p.eval(`document.querySelector("#hm-name").textContent`)) === "bc" && (await p.eval(`document.querySelector("#hm-sel").value`)) === "bc");
ok("box: no script error", p.logs.filter((l) => /^(error|EXCEPTION)/.test(l)).length === 0, p.logs.join("|"));
await p.close();
p = await open("index.html#p=gzip", { wait: 1800 });
ok("address: #p=gzip opens the map of gzip", (await p.eval(`document.querySelector("#hm-name").textContent`)) === "gzip" && (await p.eval(`document.querySelector("#hm-sel").value`)) === "gzip" && (await p.eval(CELLS)) === 3083);
await p.close();

// ---- a cell of the map: the popup of the program page, with a link to the page of the program ---------------------------------------------------
// The cell is found from the geometry in the drawing (data-geo: pitch, cell, cells in a row, gutter, branches, then the first branch and the top of the first row of each file).
const CELL_XY = (file, col) => `(function () {
  var st = document.querySelector("#hm-stage"); st.scrollIntoView({ block: "start" });
  var svg = Array.prototype.filter.call(st.querySelectorAll(".hm-svg"), function (s) { return s.getBoundingClientRect().width > 0; })[0];
  var a = svg.getAttribute("data-geo").split(",").map(Number), r = svg.getBoundingClientRect(), k = r.width / svg.viewBox.baseVal.width;
  return JSON.stringify({ x: r.left + (a[3] + ${col} * a[0] + a[1] / 2) * k, y: r.top + (a[5 + 2 * ${file} + 1] + a[1] / 2) * k });
})()`;
const POP = `JSON.stringify((function () { var e = document.querySelector(".bm-pop"), st = document.querySelector("#hm-stage"); if (!e) return { none: true }; var r = e.getBoundingClientRect(), a = e.querySelector("a");
  return { hidden: e.hidden, role: e.getAttribute("role"), name: e.getAttribute("aria-label"), text: e.innerText, link: a && a.textContent, href: a && a.getAttribute("href"), after: e.previousElementSibling === st,
           inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, active: document.activeElement === e ? "popup" : (document.activeElement && (document.activeElement.id || document.activeElement.className)),
           ring: !document.querySelector(".hm-ring").hidden, live: document.getElementById("live").textContent }; })())`;
p = await open("index.html", { wait: 1800 });
ok("cell: the map is a focus stop that says what it is, and nothing of the map data was asked for", (await p.eval(`document.querySelector("#hm-stage").tabIndex`)) === 0 && (await p.eval(`document.querySelector("#hm-stage").getAttribute("role")`)) === "application"
  && /Arrow keys/.test(await p.eval(`document.querySelector("#hm-stage").getAttribute("aria-label")`)) && !asked.some((x) => /branchmap/.test(x)), asked.filter((x) => /branchmap/.test(x)).join(" "));
let c = JSON.parse(await p.eval(CELL_XY(2, 4)));
await b.sleep(250);
await p.click(c.x, c.y); await b.sleep(1200);
let pop = JSON.parse(await p.eval(POP));
ok("cell: a click opens the popup of the program page for that cell (file and line, the tools that reach it) with one link to the page of the program", !pop.hidden && pop.role === "dialog" && /^bc\/main\.c:\d+\n+Block \d+, branch \d+, 5 of 60 in this file/.test(pop.text)
  && /Reached by/.test(pop.text) && pop.link === "Open bc" && pop.href === "programs/bc.html#map" && pop.after && pop.inView && pop.ring, JSON.stringify(pop));
ok("cell: the map data was asked for by that click", asked.some((x) => /^\/assets\/branchmap\.[0-9a-f]+\.js$/.test(x)) && asked.some((x) => /^\/assets\/branchmap\/bc\.[0-9a-f]+\.js$/.test(x)), asked.filter((x) => /branchmap/.test(x)).join(" "));
ok("cell: the cell is said in the live region", /^bc\/main\.c:\d+, block \d+, branch \d+, reached by/.test(pop.live), pop.live);
await p.key("Escape"); await b.sleep(150);
ok("cell: Escape closes the popup and the ring", JSON.parse(await p.eval(POP)).hidden === true && (await p.eval(`document.querySelector(".hm-ring").hidden`)) === true);
await p.click(c.x, c.y); await b.sleep(500);
await p.click(60, 60); await b.sleep(200);
ok("cell: a press outside the popup closes it", JSON.parse(await p.eval(POP)).hidden === true);
await p.click(c.x, c.y); await b.sleep(500);
const lk = JSON.parse(await p.eval(`(function () { var r = document.querySelector(".bm-pop a").getBoundingClientRect(); return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); })()`));
await p.click(lk.x, lk.y); await b.sleep(1500);
ok("cell: a click on the link goes to the page of the program", (await p.eval(`location.pathname`)).endsWith("/programs/bc.html"), await p.eval(`location.pathname`));
await p.close();
p = await open("index.html", { wait: 1800 });
await p.eval(`document.querySelector("#hm-stage").focus()`); await b.sleep(900);
pop = JSON.parse(await p.eval(POP));
ok("cell: the focus puts a ring on the first branch and says it", pop.none && /^bc\/\S+:\d+, block \d+, branch \d+, reached by/.test(await p.eval(`document.getElementById("live").textContent`)) && (await p.eval(`document.querySelector(".hm-ring").hidden`)) === false);
for (let i = 0; i < 3; i++) await p.key("ArrowRight");
await p.key("ArrowDown"); await b.sleep(250);
const said = await p.eval(`document.getElementById("live").textContent`);
await p.key("Enter"); await b.sleep(500);
pop = JSON.parse(await p.eval(POP));
ok("cell: the arrow keys move between branches (and say where) and Enter opens the popup of the branch, with the focus in it", !pop.hidden && pop.active === "popup" && pop.text.startsWith(said.split(",")[0] + "\n") && pop.link === "Open bc", said + " | " + pop.active);
await p.key("Tab"); await b.sleep(100);
ok("cell: the Tab key reaches the link", (await p.eval(`document.activeElement.className`)) === "bm-open");
await p.key("Escape"); await b.sleep(200);
ok("cell: Escape closes the popup and gives the focus back to the map, with the ring on the branch", JSON.parse(await p.eval(POP)).hidden === true && (await p.eval(`document.activeElement.id`)) === "hm-stage" && (await p.eval(`document.querySelector(".hm-ring").hidden`)) === false);
ok("cell: no script error", p.logs.filter((l) => /^(error|EXCEPTION)/.test(l)).length === 0, p.logs.join("|"));
await p.close();
p = await b.newPage();
await p.viewport(390, 844, 2, true);
await p.media({ scheme: "light" });
await p.cmd("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
await p.goto(base + "index.html", 1800);
c = JSON.parse(await p.eval(CELL_XY(3, 10)));
await b.sleep(300);
c = JSON.parse(await p.eval(CELL_XY(3, 10)));
await p.cmd("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: c.x, y: c.y }] });
await p.cmd("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await b.sleep(1500);
pop = JSON.parse(await p.eval(POP));
ok("cell: a tap on the phone opens the popup, inside the window, with the link (a target of 40 px under a finger)", !pop.hidden && pop.link === "Open bc" && pop.inView && (await p.eval(`document.querySelector(".bm-pop a").getBoundingClientRect().height`)) >= 40, JSON.stringify(pop));
ok("cell: no script error on the phone", p.logs.filter((l) => /^(error|EXCEPTION)/.test(l)).length === 0, p.logs.join("|"));
await p.close();

// ---- the key of the strip -----------------------------------------------------------------------------------------------------
p = await open("index.html", { wait: 1500 });
const nButtons = await p.eval(`document.querySelectorAll(".tool-key .tool-btn").length`);
ok("strip: the key has a button for each tool, and a cross beside each", nButtons === (await p.eval(`document.querySelectorAll(".tool-key li").length`)) && nButtons === 7 && (await p.eval(`document.querySelectorAll(".tool-key .tool-x").length`)) === 7, String(nButtons));
await p.eval(`document.querySelector(".tool-key li:nth-child(2) .tool-btn").click()`); await b.sleep(250);
const on = JSON.parse(await p.eval(`JSON.stringify({ pressed: document.querySelectorAll('.tool-key [aria-pressed="true"]').length, dim: document.querySelectorAll(".trk .off").length, all: document.querySelectorAll(".trk i").length })`));
ok("strip: a tool is highlighted and the others stand back", on.pressed === 1 && on.dim > 0 && on.dim < on.all, JSON.stringify(on));
await p.eval(`document.querySelector(".tool-key li:nth-child(2) .tool-btn").click()`); await b.sleep(250);
ok("strip: pressing it again shows every tool", (await p.eval(`document.querySelectorAll(".trk .off").length`)) === 0);
await p.close();

// ---- the complete picture without motion and without scripts -----------------------------------------------------------------------
p = await open("index.html", { reduced: "reduce", wait: 60 });
ok("reduced motion: no animation is created and no file is clipped", (await p.eval(ANIMS)) === 0 && (await p.eval(CLIPPED)) === 0);
ok("reduced motion: every branch is a cell at once", (await p.eval(CELLS)) === branches);
await p.close();
p = await open("index.html", { nojs: true, wait: 700 });
const nj = JSON.parse(await p.eval(`JSON.stringify({ cells: ${CELLS}, anims: ${ANIMS}, clipped: ${CLIPPED}, noJs: document.querySelector("main").classList.contains("no-js"), select: getComputedStyle(document.querySelector("#hm-sel").closest(".hm-ctl")).display, boxes: getComputedStyle(document.querySelector(".strip-ctl")).display, crosses: document.querySelectorAll(".tool-x").length, rows: document.querySelectorAll(".strip tbody tr").length })`));
ok("no script: the map is complete, nothing is animated, the box beside the map and the boxes of the strip are not offered", nj.cells === branches && nj.anims === 0 && nj.clipped === 0 && nj.noJs && nj.select === "none" && nj.boxes === "none" && nj.crosses === 0, JSON.stringify(nj));
ok("no script: the strip has a row for every program", nj.rows === 18, JSON.stringify(nj));
await p.shot(resolve(root, "shots", "home-nojs-1440.png"), { full: true }).catch(() => {});
await p.close();

// ---- the phone: the narrow drawing is shown, the wide one is not ------------------------------------------------------------------
p = await open("index.html", { w: 390, h: 844, wait: 1500 });
const ph = JSON.parse(await p.eval(`JSON.stringify({ wide: document.querySelector(".hm-svg.wide").getBoundingClientRect().width, narrow: document.querySelector(".hm-svg.narrow").getBoundingClientRect().width, cells: ${CELLS}, over: document.documentElement.scrollWidth - document.documentElement.clientWidth })`));
ok("phone: the narrow drawing is shown and every branch is a cell", ph.wide === 0 && ph.narrow > 300 && ph.cells === branches && ph.over <= 0, JSON.stringify(ph));
await p.close();

await b.close();
server.close();
console.log(failed ? `${failed} checks failed` : "all checks passed");
process.exit(failed ? 1 : 0);
