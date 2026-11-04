// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The Agent Software Testing authors
// Checks of the strip of the front page, and of the table of Results that follows it, in headless Chrome against built sites served over loopback.
//   node scripts/strip.mjs [--dist dist] [--wide DIST] [--port 9456]
// --dist is the site of the real release: the opening ten entries, the key with its crosses, the box that adds an entry, the way back, the address, the link to Results and
// the table that Results builds from the address. --wide is a site made from a release of many programs and ten tools (tests/conftest.py, make_wide_release): the page of
// 30 programs with its box to find one and its two buttons, the colours that repeat after eight tools and the limit of two entries for each tool. Prints PASS or FAIL per check.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { launch } from "./cdp.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const arg = (name, dflt) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : dflt; };
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
function serve(dist, asked) {
  return new Promise((res) => {
    const server = createServer((req, resp) => {
      const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      asked.push(p);
      const f = join(dist, p === "/" ? "index.html" : p);
      if (!f.startsWith(dist) || !existsSync(f) || !statSync(f).isFile()) { resp.writeHead(404); resp.end("not found"); return; }
      resp.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" });
      resp.end(readFileSync(f));
    });
    server.listen(0, "127.0.0.1", () => res({ server, base: `http://127.0.0.1:${server.address().port}/` }));
  });
}
const b = await launch({ port: Number(arg("port", 9456)) });
let failed = 0;
const ok = (name, cond, extra = "") => { if (!cond) failed++; console.log(cond ? "PASS" : "FAIL", name, extra); };
const errors = (p) => p.logs.filter((l) => /^(error|EXCEPTION)/.test(l));

// what a visitor does, as events on the page
const Q = {
  rows: `document.querySelectorAll("#st-rows tr").length`,
  dots: `document.querySelectorAll("#st-rows .dot").length`,
  tools: `Array.prototype.map.call(document.querySelectorAll(".tool-key li"), function (l) { return l.getAttribute("data-tool"); })`,
  note: `document.querySelector("#st-note").textContent`,
  options: `Array.prototype.map.call(document.querySelectorAll("#st-list option"), function (o) { return o.value; })`,
  range: `document.querySelector("#st-range").textContent`,
  hash: `location.hash`,
  body: `document.querySelector("#st-rows").innerHTML`,
};
const ev = (p, q) => p.eval(q);
async function pick(p, label) {
  await p.eval(`(function () { var a = document.querySelector("#st-add"); a.focus(); a.value = ${JSON.stringify(label)}; a.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await b.sleep(450);
}
async function typeInAdd(p, text) {
  await p.eval(`(function () { var a = document.querySelector("#st-add"); a.focus(); a.value = ${JSON.stringify(text)}; a.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "x" })); })()`);
  await b.sleep(300);
}
async function drop(p, tool) { await p.eval(`document.querySelector('.tool-key li[data-tool="${tool}"] .tool-x').click()`); await b.sleep(450); }
async function open(base, path, { w = 1440, h = 900, wait = 700 } = {}) {
  const p = await b.newPage();
  await p.viewport(w, h, 1, w < 700);
  await p.media({ scheme: "light", reduced: "reduce" });
  await p.goto(base + path, wait);
  return p;
}

// =============================================================================================================================
// the site of the real release
// =============================================================================================================================
{
  const asked = [];
  const dist = resolve(root, arg("dist", "dist"));
  const dataSrc = readFileSync(join(dist, "index.html"), "utf8").match(/class="home" data-src="([^"]*)"/)[1];
  const dataPath = "/" + dataSrc;
  const entries = JSON.parse(readFileSync(join(dist, dataSrc, "entries.json"), "utf8"));
  const toolOf = Object.fromEntries(entries.entries.map((e) => [e[0], e[2]]));
  const countOf = Object.fromEntries(entries.entries.map((e) => [e[0], e[5]]));
  const programList = JSON.parse(readFileSync(join(dist, dataSrc, "programs.json"), "utf8")).programs;
  const programsOf = (id) => new Set(Object.keys(JSON.parse(readFileSync(join(dist, dataSrc, "e", id + ".json"), "utf8"))));
  const rowsOf = (ids) => new Set(ids.flatMap((id) => [...programsOf(id)])).size;
  const largestOf = (ids) => {
    const on = new Set(ids.flatMap((id) => [...programsOf(id)]));
    return programList.filter((p) => on.has(p[0])).sort((a, b) => b[2] - a[2] || a[1].localeCompare(b[1]))[0][1];
  };
  const { server, base } = await serve(dist, asked);
  let p = await open(base, "index.html");
  const open10 = await ev(p, `document.querySelector("#strip").getAttribute("data-open").split(",")`);
  const openTools = new Set(open10.map((x) => toolOf[x.slice(0, x.lastIndexOf(":"))]));
  const agolicSlot = Number(open10.find((x) => x.startsWith("agolic-")).split(":")[1]);
  const first = await ev(p, Q.body);
  ok("opening: the opening entries on show, one key item for each of their tools, each with a button and a cross, eighteen rows", open10.length === 10 && openTools.size === 7 && (await ev(p, Q.tools)).length === openTools.size
    && (await ev(p, `document.querySelectorAll(".tool-btn").length`)) === openTools.size && (await ev(p, `document.querySelectorAll(".tool-x").length`)) === openTools.size && (await ev(p, Q.rows)) === 18, open10.join(","));
  ok("opening: the key names each tool once and the dots of a row are the entries that have a result (at most ten)", (await ev(p, `Array.prototype.every.call(document.querySelectorAll("#st-rows tr"), function (r) { return r.querySelectorAll(".dot").length <= 10 && r.querySelectorAll(".dot").length >= 1; })`)));
  ok("opening: no reset, no box to find a program, no pager, no note", (await ev(p, `document.querySelector("#st-reset").hidden && document.querySelector("#st-findbox").hidden && document.querySelector("#st-pager").hidden`)) && (await ev(p, Q.note)) === "");
  ok("opening: the line on a dot and a ring is shown, and the link to Results is plain", (await ev(p, `!document.querySelector("#st-ring").hidden && document.querySelector("[data-results]").getAttribute("href")`)) === "results.html");
  ok("opening: nothing was asked for but the page and its assets", !asked.some((x) => x.startsWith("/data/")));

  // add: the list holds the other entries by name, alphabetical, narrows as a name is typed
  await ev(p, `document.querySelector("#st-add").focus()`); await b.sleep(500);
  const all = await ev(p, Q.options);
  ok("add: on focus the list holds the entries that are not on show, in alphabetical order, and the two files of the page were asked for", all.length === entries.entries.length - open10.length
    && JSON.stringify(all) === JSON.stringify(all.slice().sort()) && asked.filter((x) => x.startsWith(dataPath)).sort().join(" ") === dataPath + "entries.json " + dataPath + "programs.json", all.length + " " + asked.filter((x) => x.startsWith("/data/")).join(" "));
  await typeInAdd(p, "direct");
  ok("add: typing part of a name (here of the model, 'direct') narrows the list", JSON.stringify(await ev(p, Q.options)) === JSON.stringify(["Agolic Direct-Input, DeepSeek V4.1 Flash"]));
  await typeInAdd(p, "5.02c");
  ok("add: a version narrows it too (5.02c is the version of AFL++)", (await ev(p, Q.options)).length >= 1 && (await ev(p, Q.options)).every((o) => /AFL/.test(o)), (await ev(p, Q.options)).join("|"));

  // the limit of two entries for each tool, and the cross that takes a tool off
  await pick(p, "Agolic Direct-Input, DeepSeek V4.1 Flash");
  ok("limit: a third entry of a tool is not drawn, and the line under the box says why", (await ev(p, Q.note)) === "Agolic has two entries on show. Remove it to pick others." && (await ev(p, Q.tools)).length === openTools.size && (await ev(p, Q.dots)) === (first.match(/class="dot/g) || []).length);
  await drop(p, "agolic");
  const six = await ev(p, Q.tools);
  const keptIds = open10.filter((x) => !x.startsWith("agolic-")).map((x) => x.slice(0, x.lastIndexOf(":")));
  ok("cross: it takes a tool and its entries off (the key, the dots and the rows that lose their last dot)", six.length === openTools.size - 1 && !six.includes("agolic") && (await ev(p, `document.querySelectorAll('#st-rows [data-tool="agolic"]').length`)) === 0 && (await ev(p, Q.rows)) === rowsOf(keptIds));
  ok("cross: the way back appears, the address names the entries, and so does the link to Results", !(await ev(p, `document.querySelector("#st-reset").hidden`)) && /^#e=/.test(await ev(p, Q.hash))
    && /^results\.html#e=/.test(await ev(p, `document.querySelector("[data-results]").getAttribute("href")`)), await ev(p, Q.hash));
  ok("cross: the focus goes to the next tool and the change is said", (await ev(p, `document.activeElement.className + ":" + document.activeElement.closest("li").getAttribute("data-tool")`)).startsWith("tool-btn") && /Agolic removed/.test(await ev(p, `document.querySelector("#live").textContent`)));

  // add an entry of a tool that is not on show: it has its own colour, and one dot
  await pick(p, "Agolic Direct-Input, DeepSeek V4.1 Flash");
  ok("add: the entry comes on show with the colour of its tool and a dot, in the key after the others (the box is empty again)", JSON.stringify((await ev(p, Q.tools)).slice(-1)) === '["agolic"]'
    && (await ev(p, `document.querySelectorAll('#st-rows .dot.c${agolicSlot}:not(.ring)').length`)) === 9 && (await ev(p, `document.querySelector("#st-add").value`)) === "", (await ev(p, Q.tools)).join(","));
  await pick(p, "Agolic KLEE, GPT-5.5");
  ok("add: a second entry of the tool is drawn as a dot for the earlier entry and a ring for the later (by the date of submission, not the order of picking)",
    (await ev(p, `document.querySelectorAll('#st-rows .dot.c${agolicSlot}.ring[title^="Agolic Direct-Input"]').length`)) === 9 && (await ev(p, `document.querySelectorAll('#st-rows .dot.c${agolicSlot}:not(.ring)[title^="Agolic KLEE, GPT-5.5"]').length`)) === 18);
  await pick(p, "Agolic KLEE, DeepSeek V4.1 Flash");
  ok("limit: the third entry of that tool is refused again", /^Agolic has two entries/.test(await ev(p, Q.note)));

  // an entry of a group other than the main one comes on show with its tool and the programs it has
  await pick(p, "AFL++ rebuilt targets");
  ok("add: an entry of the control group comes on show with the colour of its tool and only the programs it has", (await ev(p, Q.tools)).includes("aflpp")
    && (await ev(p, `document.querySelectorAll('#st-rows .dot[title^="AFL++ rebuilt targets"]').length`)) === countOf["aflpp-rebuilt-control"], "");

  // the way back
  await ev(p, `document.querySelector("#st-reset").click()`); await b.sleep(600);
  ok("reset: the opening entries and rows are back, byte for byte, and the address and the link to Results are plain", (await ev(p, Q.body)) === first && (await ev(p, `document.querySelector("#st-reset").hidden`))
    && ["", "#"].includes(await ev(p, Q.hash)) && (await ev(p, `document.querySelector("[data-results]").getAttribute("href")`)) === "results.html" && (await ev(p, Q.tools)).length === openTools.size);

  // the key makes a tool stand out, also after the strip is drawn again
  await pick(p, "AFL++ rebuilt targets");
  await ev(p, `document.querySelector('.tool-key li[data-tool="aflpp"] .tool-btn').click()`); await b.sleep(200);
  await drop(p, "klee");
  ok("stand out: the tool that stands out still does after the strip is drawn again, and the others stay back", (await ev(p, `document.querySelectorAll('.tool-key [aria-pressed="true"]').length`)) === 1 && (await ev(p, `document.querySelectorAll("#st-rows .trk .off").length`)) > 0
    && (await ev(p, `document.querySelectorAll('#st-rows .trk i:not(.off)').length`)) === (await ev(p, `document.querySelectorAll('#st-rows [data-tool="aflpp"]').length`)));
  await drop(p, "aflpp");
  ok("stand out: taking the tool off ends it", (await ev(p, `document.querySelectorAll(".trk .off").length`)) === 0 && (await ev(p, `document.querySelectorAll('.tool-key [aria-pressed="true"]').length`)) === 0);

  // everything off, and back
  await ev(p, `document.querySelector("#st-reset").click()`); await b.sleep(500);
  for (const t of await ev(p, Q.tools)) await drop(p, t);
  ok("empty: with every tool off the strip says so, and an entry can be added again", (await ev(p, Q.tools)).length === 0 && /No entries on show\./.test(await ev(p, `document.querySelector("#st-rows").textContent`)) && (await ev(p, Q.rows)) === 1);
  await pick(p, "AFL++ rebuilt targets");
  ok("empty: one entry brings back its tool and its rows", (await ev(p, Q.tools)).join() === "aflpp" && (await ev(p, Q.rows)) === countOf["aflpp-rebuilt-control"], String(await ev(p, Q.rows)));
  ok("strip: no script error", errors(p).length === 0, p.logs.join("|"));

  // the address and the link to Results carry the entries
  await ev(p, `document.querySelector("#st-reset").click()`); await b.sleep(500);
  await drop(p, "agolic"); await drop(p, "concollmic");
  await pick(p, "Agolic KLEE, DeepSeek V4.1 Flash");
  await pick(p, "AFL++ rebuilt targets");
  const hash = await ev(p, Q.hash), body = await ev(p, Q.body), tools = await ev(p, Q.tools).then((t) => t.join());
  const chosenIds = hash.split("e=")[1].split("&")[0].split(",").map((x) => x.slice(0, x.lastIndexOf(":")));
  await p.close();
  p = await open(base, "index.html" + hash, { wait: 1600 });
  ok("address: a page opened on that address shows the same entries, rows and key (a link that was shared)", (await ev(p, Q.body)) === body && (await ev(p, Q.tools)).join() === tools && !(await ev(p, `document.querySelector("#st-reset").hidden`)), tools);
  await p.close();
  p = await open(base, "index.html#e=klee-fixed-6w:3,nosuch:2,klee-uniform-6w:3,klee-fixed-1w:5,symtuner-6w:3", { wait: 1600 });
  ok("address: an entry that is not there is left out, a third entry of a tool is left out, and a colour that is taken is chosen again", JSON.stringify(await ev(p, `Array.prototype.map.call(document.querySelectorAll(".tool-key li"), function (l) { return l.getAttribute("data-tool") + ":" + l.querySelector(".dot").className; })`)) === JSON.stringify(["symtuner:dot c2", "klee:dot c3"]));
  await p.close();

  // Results opens on the entries that are on show
  p = await open(base, "results.html" + hash, { wait: 2000 });
  const r = JSON.parse(await ev(p, `JSON.stringify({ radio: document.querySelector('input[name=rgroup][value=chosen]') && document.querySelector('input[name=rgroup][value=chosen]').checked,
    shown: !document.querySelector("#g-chosen").hidden, main: document.querySelector("#g-main").hidden, heads: Array.prototype.map.call(document.querySelectorAll("#g-chosen thead tr:nth-child(2) th"), function (t) { return t.querySelector(".th-static").textContent.replace(/\\s+/g, " ").trim(); }),
    rows: document.querySelectorAll("#g-chosen tbody tr").length, hash: location.hash })`));
  ok("results: the address opens the table on the entries of the strip, as one more group that is chosen, and the other groups are hidden", r.radio === true && r.shown && r.main && r.heads.length === chosenIds.length && r.rows === rowsOf(chosenIds), JSON.stringify(r));
  const same = await ev(p, `(function () { var names = {}; Array.prototype.forEach.call(document.querySelectorAll("#g-main thead tr:nth-child(2) th"), function (t, i) { names[t.querySelector(".th-static").textContent.replace(/\\s+/g, " ").trim()] = "c" + i; });
    var bad = [], n = 0; document.querySelectorAll("#g-chosen tbody tr").forEach(function (tr) { var m = document.querySelector('#g-main tbody tr[data-name="' + tr.getAttribute("data-name") + '"]'); if (!m) return;
      var ch = tr.querySelectorAll("td.cell"), heads = document.querySelectorAll("#g-chosen thead tr:nth-child(2) th");
      ch.forEach(function (td, i) { var key = heads[i].querySelector(".th-static").textContent.replace(/\\s+/g, " ").trim(), c = names[key]; if (!c) return; var mt = m.querySelector('td[data-c="' + c + '"]'); n++; if (!mt || mt.getAttribute("data-pct") !== td.getAttribute("data-pct") || mt.getAttribute("data-med") !== td.getAttribute("data-med")) bad.push(tr.getAttribute("data-name") + " " + key); }); });
    return { n: n, bad: bad.slice(0, 5) }; })()`);
  ok("results: a cell of the table equals the cell of the main table for the same entry and program", same.n > 40 && same.bad.length === 0, JSON.stringify(same));
  await ev(p, `document.querySelector('input[name=unit][value=n]').click()`); await b.sleep(300);
  ok("results: the table of 18 programs has no box to find one", (await ev(p, `document.querySelector("#ch-find")`)) === null);
  ok("results: the count unit works on it and is kept in the address next to the entries", (await ev(p, `getComputedStyle(document.querySelector("#g-chosen td.cell .u-n")).display`)) !== "none" && /^#e=.+&branches$/.test(await ev(p, Q.hash)), await ev(p, Q.hash));
  await ev(p, `document.querySelector('#g-chosen thead button.sort[data-k="total"]').click()`); await b.sleep(200);
  ok("results: a heading sorts it (the largest program first)", (await ev(p, `document.querySelector("#g-chosen tbody tr th a").textContent`)) === largestOf(chosenIds));
  await ev(p, `document.querySelector('input[name=rgroup][value=control]').click()`); await b.sleep(300);
  ok("results: another group leaves the entries and writes its own token", (await ev(p, `document.querySelector("#g-control").hidden`)) === false && (await ev(p, Q.hash)) === "#control-branches", await ev(p, Q.hash));
  ok("results: no script error", errors(p).length === 0, p.logs.join("|"));
  await p.close();
  p = await open(base, "results.html#e=nosuch:1", { wait: 1500 });
  ok("results: an address that names no entry leaves the groups as they are", (await ev(p, `document.querySelector("#g-main").hidden`)) === false && (await ev(p, `document.querySelector("#g-chosen")`)) === null);
  await p.close();
  const before = asked.filter((x) => x.startsWith("/data/")).length;
  p = await open(base, "results.html", { wait: 800 });
  ok("results: opened plainly it is the table of the main group, and no data file was asked for", (await ev(p, `document.querySelector("#g-main").hidden`)) === false && asked.filter((x) => x.startsWith("/data/")).length === before);
  await p.close();

  // a phone
  p = await open(base, "index.html", { w: 390, h: 844, wait: 900 });
  await ev(p, `document.querySelector("#st-add").focus()`); await b.sleep(300);
  const ph = JSON.parse(await ev(p, `JSON.stringify({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth, add: document.querySelector("#st-add").getBoundingClientRect().width, main: document.querySelector(".strip-fig").getBoundingClientRect().width,
    font: getComputedStyle(document.querySelector("#st-add")).fontSize, cross: document.querySelector(".tool-x").getBoundingClientRect().height, rows: document.querySelectorAll("#st-rows tr").length })`));
  ok("phone: no sideways scroll, the box to add an entry takes the width of the strip, its type is 16 px", ph.over <= 0 && ph.add > ph.main * 0.6 && ph.font === "16px" && ph.rows === 18, JSON.stringify(ph));
  await p.close();
  server.close();
}

// =============================================================================================================================
// a site of 65 programs and ten tools
// =============================================================================================================================
if (arg("wide", "")) {
  const asked = [];
  const { server, base } = await serve(resolve(root, arg("wide")), asked);
  let p = await open(base, "index.html");
  const names = (q = "") => ev(p, `Array.prototype.map.call(document.querySelectorAll("#st-rows tr th a"), function (a) { return a.textContent; })`);
  ok("pages: the page holds 30 rows, its box to find a program and its pager (Programs 1 to 30 of 65, Previous off)", (await ev(p, Q.rows)) === 30 && !(await ev(p, `document.querySelector("#st-findbox").hidden`)) && !(await ev(p, `document.querySelector("#st-pager").hidden`))
    && (await ev(p, Q.range)) === "Programs 1 to 30 of 65" && (await ev(p, `document.querySelector("#st-prev").disabled`)) === true && (await ev(p, `document.querySelector("#st-next").disabled`)) === false);
  ok("pages: all ten tools are on show, in the order of their colours (the ninth and the tenth take the first and the second colour again)", (await ev(p, Q.tools)).join() === "t01,t09,t02,t10,t03,t04,t05,t06,t07,t08");
  const first30 = await ev(p, Q.body);
  await ev(p, `document.querySelector("#st-next").click()`); await b.sleep(450);
  ok("pages: Next draws rows 31 to 60 (the files of the shown entries were asked for by that click), Previous is on", (await ev(p, Q.rows)) === 30 && (await ev(p, Q.range)) === "Programs 31 to 60 of 65" && (await names())[0] === "Program 31" && (await ev(p, `document.querySelector("#st-prev").disabled`)) === false
    && asked.filter((x) => /\/data\/2026\.1\/e\//.test(x)).length === 12, String(asked.filter((x) => /\/e\//.test(x)).length));
  await ev(p, `document.querySelector("#st-next").click()`); await b.sleep(400);
  ok("pages: the last page holds the five that are left and Next is off", (await ev(p, Q.rows)) === 5 && (await ev(p, Q.range)) === "Programs 61 to 65 of 65" && (await ev(p, `document.querySelector("#st-next").disabled`)) === true);
  await ev(p, `document.querySelector("#st-prev").click()`); await ev(p, `document.querySelector("#st-prev").click()`); await b.sleep(500);
  ok("pages: back on the first page the rows are those the page was written with", (await ev(p, Q.body)) === first30);
  await ev(p, `(function () { var f = document.querySelector("#st-find"); f.value = "gram 6"; f.dispatchEvent(new Event("input", { bubbles: true })); })()`); await b.sleep(400);
  ok("find: part of a name narrows the rows to the programs that hold it (Program 60 to 65), the pager goes, the box stays", (await ev(p, Q.rows)) === 6 && (await names())[0] === "Program 60" && (await ev(p, `document.querySelector("#st-pager").hidden`)) === true && !(await ev(p, `document.querySelector("#st-findbox").hidden`)));
  await ev(p, `(function () { var f = document.querySelector("#st-find"); f.value = "gram 1"; f.dispatchEvent(new Event("input", { bubbles: true })); })()`); await b.sleep(400);
  ok("find: ten programs hold 'gram 1' (Program 10 to 19), shown on one page", (await ev(p, Q.rows)) === 10 && (await names())[0] === "Program 10", String(await ev(p, Q.rows)));
  await ev(p, `(function () { var f = document.querySelector("#st-find"); f.value = "zzz"; f.dispatchEvent(new Event("input", { bubbles: true })); })()`); await b.sleep(300);
  ok("find: a name that no program has leaves a line that says so", /No program matches\./.test(await ev(p, `document.querySelector("#st-rows").textContent`)));
  await ev(p, `(function () { var f = document.querySelector("#st-find"); f.value = ""; f.dispatchEvent(new Event("input", { bubbles: true })); })()`); await b.sleep(300);

  // the map: the list of the box holds 50 programs of the 65
  await ev(p, `document.querySelector("#hm-sel").focus()`); await b.sleep(400);
  ok("map: the list of the box beside the map holds the first 50 programs, in alphabetical order, and narrows to the programs that hold a text", (await ev(p, `document.querySelectorAll("#hm-list option").length`)) === 50
    && (await ev(p, `document.querySelector("#hm-list option").value`)) === "Program 01");
  await ev(p, `(function () { var s = document.querySelector("#hm-sel"); s.value = "program 6"; s.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "6" })); })()`); await b.sleep(300);
  ok("map: 'program 6' leaves Program 60 to 65", (await ev(p, `document.querySelectorAll("#hm-list option").length`)) === 6);
  await ev(p, `document.querySelector("#st-add").focus()`); await b.sleep(200);

  // no limit of tools: colours repeat once the eight are used, and a colour that is freed is taken again
  await drop(p, "t03");
  ok("tools: taking a tool off leaves nine, and no note", (await ev(p, Q.tools)).length === 9 && (await ev(p, Q.note)) === "");
  await pick(p, "Tool 03 entry a, 6 cores");
  const slots = await ev(p, `Array.prototype.map.call(document.querySelectorAll(".tool-key li"), function (l) { return l.getAttribute("data-tool") + ":" + l.querySelector(".dot").className.replace("dot c", ""); })`);
  ok("tools: the tool that comes back has its own colour, and the key is in the order of the colours", JSON.stringify(slots) === JSON.stringify(["t01:1", "t09:1", "t02:2", "t10:2", "t03:3", "t04:4", "t05:5", "t06:6", "t07:7", "t08:8"]), slots.join(","));
  await pick(p, "Tool 01 entry c, 6 cores");
  ok("limit: a third entry of the first tool is refused (two are on show)", /^Tool 01 has two entries on show\./.test(await ev(p, Q.note)));
  ok("pages: a pick draws the first page again, and the address holds the entries", (await ev(p, Q.range)) === "Programs 1 to 30 of 65" && /^#e=/.test(await ev(p, Q.hash)));
  ok("wide: no script error", errors(p).length === 0, p.logs.join("|"));
  await p.close();
  p = await open(base, "index.html#e=t09-a:3,t01-a:1,t01-b:1,t01-c:1,t02-a:2&p=p42", { wait: 1800 });
  ok("address: the entries come on show up to the limits (t01-c is a third entry and is left out) and the program comes on the map", (await ev(p, `Array.prototype.map.call(document.querySelectorAll(".tool-key li"), function (l) { return l.getAttribute("data-tool") + ":" + l.querySelector(".dot").className.replace("dot c", ""); }).join()`)) === "t01:1,t02:2,t09:3"
    && (await ev(p, `document.querySelector("#hm-name").textContent`)) === "Program 42");
  await p.close();
  p = await open(base, "results.html#e=t01-a:1,t02-a:2,t05-a:5", { wait: 1800 });
  ok("results: the table built from the address holds 65 rows and, above 30, a box to find a program", (await ev(p, `document.querySelectorAll("#g-chosen tbody tr").length`)) === 65 && (await ev(p, `!!document.querySelector("#g-chosen #ch-find")`)));
  await ev(p, `(function () { var f = document.querySelector("#ch-find"); f.value = "gram 6"; f.dispatchEvent(new Event("input", { bubbles: true })); })()`); await b.sleep(250);
  ok("results: part of a name leaves the rows that hold it (Program 60 to 65)", (await ev(p, `Array.prototype.filter.call(document.querySelectorAll("#g-chosen tbody tr"), function (r) { return !r.hidden; }).map(function (r) { return r.querySelector("th a").textContent; }).join()`)) === "Program 60,Program 61,Program 62,Program 63,Program 64,Program 65");
  ok("results: no script error", errors(p).length === 0, p.logs.join("|"));
  await p.close();
  server.close();
}

await b.close();
console.log(failed ? `${failed} checks failed` : "all checks passed");
process.exit(failed ? 1 : 0);
