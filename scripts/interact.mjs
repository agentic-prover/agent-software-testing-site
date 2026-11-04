// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The Agent Software Testing authors
// Behaviour checks in headless Chrome against a built site served over loopback: command palette (Ctrl K),
// Results (group switch, unit switch, sorting), Tools (expand, filter, deep link), Compare (pair, hash, swap), a program page
// (chart tooltip, legend cap, views, table tab, final table groups, next program, map) and the phone width; also the section links, Terms as a
// popover, the announcements of the map, the sort buttons' names, the repaint of the map when the system theme changes, the bitmap of a tall map, the landscape chart, touch on the map.
//   node scripts/interact.mjs [--dist dist] [--port 9446]
// Prints PASS or FAIL per check and exits with status 1 when one fails.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { launch } from "./cdp.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const arg = (name, dflt) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : dflt; };
const dist = resolve(root, arg("dist", "dist"));
const out = resolve(root, "shots");
mkdirSync(out, { recursive: true });
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".csv": "text/csv", ".svg": "image/svg+xml", ".png": "image/png" };
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const f = join(dist, p);
  if (!f.startsWith(dist) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;

const b = await launch({ port: Number(arg("port", 9446)) });
let failed = 0;
const ok = (name, cond, extra = "") => { if (!cond) failed++; console.log(cond ? "PASS" : "FAIL", name, extra); };
async function press(p, key, code, vk, modifiers = 0, text) {
  await p.cmd("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: vk, modifiers, text });
  await p.cmd("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers });
}
async function typeText(p, s) { for (const ch of s) { await p.cmd("Input.dispatchKeyEvent", { type: "keyDown", key: ch, text: ch }); await p.cmd("Input.dispatchKeyEvent", { type: "keyUp", key: ch }); } }
async function open(path, { w = 1440, h = 900, scheme = "light", mobile = false } = {}) {
  const p = await b.newPage();
  await p.viewport(w, h, 1, mobile);
  await p.media({ scheme });
  await p.goto(base + path, 1800);
  return p;
}

// ---- Results ---------------------------------------------------------------------------------------------------
let p = await open("results.html");
ok("results: no script error", p.logs.filter((l) => /^(error|EXCEPTION)/.test(l)).length === 0, p.logs.join("|"));
ok("results: main panel shown, others hidden", await p.eval(`document.querySelector("#g-main").hidden === false && document.querySelector("#g-ablation").hidden === true`));
await p.eval(`document.querySelector('input[name=rgroup][value=ablation]').click()`); await b.sleep(300);
ok("results: ablation panel shows 4 programs", await p.eval(`!document.querySelector("#g-ablation").hidden && document.querySelector("#g-main").hidden && document.querySelectorAll("#g-ablation tbody tr").length === 4`));
await p.eval(`document.querySelector('input[name=rgroup][value=main]').click()`); await b.sleep(200);
const vis = (sel) => `getComputedStyle(document.querySelector("${sel}")).display`;
ok("results: percent shown by default", (await p.eval(vis("#g-main td.cell .u-pct"))) !== "none" && (await p.eval(vis("#g-main td.cell .u-n"))) === "none");
await p.eval(`document.querySelector('input[name=unit][value=n]').click()`); await b.sleep(200);
ok("results: unit switch shows counts", (await p.eval(vis("#g-main td.cell .u-n"))) !== "none" && (await p.eval(vis("#g-main td.cell .u-pct"))) === "none");
await p.eval(`document.querySelector('input[name=unit][value=pct]').click()`);
const firstRow = `document.querySelector("#g-main tbody tr th a").textContent`;
await p.eval(`document.querySelector('#g-main button.sort[data-k="total"]').click()`); await b.sleep(200);
ok("results: sort by branch total (descending) puts xorriso first", (await p.eval(firstRow)) === "xorriso", await p.eval(firstRow));
await p.eval(`document.querySelector('#g-main button.sort[data-k="total"]').click()`); await b.sleep(200);
ok("results: second click reverses (libmatheval first)", (await p.eval(firstRow)) === "Libmatheval", await p.eval(firstRow));
await p.eval(`document.querySelector('#g-main button.sort[data-k="total"]').click()`); await b.sleep(200);
ok("results: third click restores the original order", (await p.eval(firstRow)) === "bc");
await p.eval(`document.querySelector('#g-main button.sort[data-k="c2"]').click()`); await b.sleep(200);      // c2 is ConcoLLMic with GPT-5.5, which has runs on 7 of the 18 programs
const topVals = JSON.parse(await p.eval(`JSON.stringify([...document.querySelectorAll('#g-main tbody tr td[data-c="c2"]')].map(function(t){return t.getAttribute("data-pct")}))`));
const nums = topVals.map(Number).filter((x) => topVals[0] !== "" && x === x);
ok("results: sort by a tool column puts missing runs last", topVals[topVals.length - 1] === "" && Number(topVals[0]) >= Number(topVals[1]), topVals.slice(0, 3).join(","));
// the group and the unit are written to the address as bare tokens, and read back
await p.eval(`document.querySelector('input[name=rgroup][value=control]').click()`); await b.sleep(200);
ok("results: choosing a group writes it to the address (#control)", (await p.eval("location.hash")) === "#control");
await p.eval(`document.querySelector('input[name=unit][value=n]').click()`); await b.sleep(200);
ok("results: choosing the count writes #control-branches", (await p.eval("location.hash")) === "#control-branches");
await p.eval(`document.querySelector('input[name=rgroup][value=main]').click(); document.querySelector('input[name=unit][value=spread]').click()`); await b.sleep(300);
ok("results: the third unit shows the median with its lowest and highest run, built when it is first chosen, with a range bar", await p.eval(`(function(){var td=document.querySelector('#g-main td.cell[data-lo]');var v=td.querySelector(".u-s");return !!v && /\\d–\\d/.test(v.textContent) && !/[()]/.test(v.querySelector(".rg").textContent) && getComputedStyle(v).display!=="none" && getComputedStyle(td.querySelector(".mb.rng")).display!=="none" && getComputedStyle(td.querySelector(".u-pct")).display==="none"})()`));
ok("results: the address of the main group with the third unit is #spread", (await p.eval("location.hash")) === "#spread");
await p.eval(`document.querySelector('input[name=unit][value=pct]').click()`); await b.sleep(150);
ok("results: the defaults write nothing", (await p.eval("location.hash")) === "" || (await p.eval("location.hash")) === "#");
await p.eval(`document.querySelector('.terms > summary').click()`); await b.sleep(150);
ok("results: Terms opens in place of a page and lists the track, the measures and the groups", await p.eval(`(function(){var d=document.querySelector(".terms");var t=d.textContent;return d.open && /Fixed track/.test(t) && /Seeding/.test(t) && d.querySelector("dl").getBoundingClientRect().height>100})()`));
await p.eval(`document.querySelector('.terms > summary').click()`);
ok("results: a row header holds the program name and its link, and no drawing", await p.eval(`document.querySelectorAll("#g-main .sky-mini, #g-main tbody th svg").length===0 && document.querySelectorAll("#g-main tbody tr").length===18 && [...document.querySelectorAll("#g-main tbody th a.pname")].every(function(a){return a.getAttribute("href").indexOf("programs/")===0})`));
// theme: the page follows the system setting
{
  const lightBg = await p.eval(`getComputedStyle(document.body).backgroundColor`);
  const d = await open("results.html", { scheme: "dark" });
  const darkBg = await d.eval(`getComputedStyle(document.body).backgroundColor`);
  ok("theme: the page is dark when the system is dark and light when it is light", lightBg === "rgb(255, 255, 255)" && darkBg === "rgb(14, 22, 37)", lightBg + " | " + darkBg);
  await d.close();
}
// palette
await press(p, "k", "KeyK", 75, 2); await b.sleep(300);
ok("palette: opens with Ctrl+K", await p.eval(`document.getElementById("pal").open`));
await typeText(p, "afl"); await b.sleep(250);
const items = await p.eval(`document.querySelectorAll("#pal-list li.i").length`);
ok("palette: filters 'afl'", items >= 4, "items=" + items);
ok("palette: the list state is exposed (expanded, option count read out, options out of the tab order)", (await p.eval(`document.getElementById("pal-in").getAttribute("aria-expanded")`)) === "true" && (await p.eval(`document.getElementById("pal-status").textContent`)).includes("results") && (await p.eval(`document.querySelectorAll('#pal-list a[role=option]:not([tabindex="-1"])').length`)) === 0);
ok("palette: has a visible Close button", await p.eval(`!!document.querySelector("#pal .pal-close") && document.querySelector("#pal .pal-close").getBoundingClientRect().width > 0`));
await p.shot(join(out, "i-palette.png"));
await press(p, "Escape", "Escape", 27); await b.sleep(200);
ok("palette: closes with Escape", (await p.eval(`document.getElementById("pal").open`)) === false);
await press(p, "k", "KeyK", 75, 2); await b.sleep(200);
await typeText(p, "p woff"); await b.sleep(250);
await press(p, "Enter", "Enter", 13); await b.sleep(900);
ok("palette: 'p woff' + Enter opens the WOFF2 page", (await p.eval("location.pathname")).endsWith("/programs/woff2.html"), await p.eval("location.pathname"));
// next program
await p.eval(`document.getElementById("pnext").click()`); await b.sleep(900);
ok("next: the Next link goes to the next program (xmlwf)", (await p.eval("location.pathname")).endsWith("/programs/xmlwf.html"), await p.eval("location.pathname"));
await p.close();
p = await open("results.html#control-spread");
ok("results: a token in the address opens the group and the unit (#control-spread)", await p.eval(`!document.querySelector("#g-control").hidden && document.querySelector("#g-control table").getAttribute("data-unit")==="spread" && document.querySelector('input[name=rgroup]:checked').value==="control"`));
await p.close();

// ---- Tools -----------------------------------------------------------------------------------------------------
p = await open("tools.html#aflpp");
ok("tools: #aflpp opens its row", (await p.eval(`document.getElementById("d-aflpp").hidden`)) === false && (await p.eval(`document.querySelector('#aflpp .rowbtn').getAttribute("aria-expanded")`)) === "true");
ok("tools: the detail has the program table", (await p.eval(`document.querySelectorAll("#d-aflpp tbody tr").length`)) === 6);
await p.eval(`document.querySelector('#klee-fixed-6w .rowbtn').click()`); await b.sleep(200);
ok("tools: a second row opens and the first stays open", (await p.eval(`document.getElementById("d-klee-fixed-6w").hidden`)) === false && (await p.eval(`document.getElementById("d-aflpp").hidden`)) === false);
await p.eval(`document.querySelector('input[name=tgroup][value=control]').click()`); await b.sleep(300);
ok("tools: control filter leaves 4 rows", (await p.eval(`document.querySelectorAll("tr.trow:not([hidden])").length`)) === 4 && (await p.eval(`document.getElementById("d-aflpp").hidden`)) === true);
await p.eval(`document.querySelector('input[name=tgroup][value=all]').click()`); await b.sleep(300);
ok("tools: all filter returns every row", (await p.eval(`document.querySelectorAll("tr.trow:not([hidden])").length === document.querySelectorAll("tr.trow").length && document.querySelectorAll("tr.trow").length > 4`)));
await p.eval(`document.querySelector('button.sort[data-k="cores"]').click()`); await b.sleep(200);
ok("tools: sorting moves the detail row with its row", await p.eval(`(function(){var r=document.querySelector("tr.trow");var n=r.nextElementSibling;return n&&n.classList.contains("detail")&&n.getAttribute("data-for")===r.getAttribute("data-id")})()`));
await p.close();

// ---- Compare ---------------------------------------------------------------------------------------------------
p = await open("compare.html");
const before = await p.eval(`document.getElementById("cmp-out").innerHTML.length`);
await p.eval(`(function(){var s=document.getElementById("sel-b");s.value="aflpp";s.dispatchEvent(new Event("change"))})()`); await b.sleep(300);
ok("compare: choosing a tool rebuilds the page and sets the hash", (await p.eval(`location.hash`)) === "#klee-fixed-6w_vs_aflpp" && (await p.eval(`document.getElementById("cmp-out").innerHTML.length`)) !== before);
await p.eval(`document.querySelector('.subbar nav a[data-sec="resources"]').click()`); await b.sleep(500);
ok("compare: the section bar scrolls to a section that was drawn by the script", (await p.eval(`window.scrollY`)) > 300 && (await p.eval(`document.querySelector(".subbar").getBoundingClientRect().top - parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bar-h"))`)) <= 2 && (await p.eval(`document.querySelector('.subbar nav a[data-sec="resources"]').classList.contains("on")`)));
await p.eval(`document.getElementById("swap").click()`); await b.sleep(300);
ok("compare: swap exchanges A and B", (await p.eval(`document.getElementById("sel-a").value`)) === "aflpp" && (await p.eval(`document.getElementById("sel-b").value`)) === "klee-fixed-6w");
ok("compare: a pair of different tracks gets a line that says so", (await p.eval(`document.getElementById("cmp-out").textContent`)).includes("A and B differ in track (A fixed, B open)"));
await p.eval(`(function(){var s=document.getElementById("sel-b");s.value="aflpp";s.dispatchEvent(new Event("change"))})()`); await b.sleep(300);
ok("compare: choosing the same tool twice asks for two different tools", (await p.eval(`document.getElementById("cmp-out").textContent`)).includes("Choose two different tools"));
await p.close();
p = await open("compare.html#symtuner-6w_vs_agolic-klee-deepseek");
ok("compare: a hash token selects the pair", (await p.eval(`document.getElementById("sel-a").value`)) === "symtuner-6w" && (await p.eval(`document.getElementById("sel-b").value`)) === "agolic-klee-deepseek");
ok("compare: the pair shares 9 programs", (await p.eval(`document.querySelector(".cmp-intro").textContent`)).includes("Both ran on nine programs"));
await p.close();

// ---- a program page --------------------------------------------------------------------------------------------
p = await open("programs/krep.html");
ok("program: no script error", p.logs.filter((l) => /^(error|EXCEPTION)/.test(l)).length === 0, p.logs.join("|"));
ok("program: the map is drawn", await p.eval(`!!document.querySelector("#mapbox canvas")`));
ok("program: the chart opens with every current line (12 lines, seven colours)", (await p.eval(`document.querySelectorAll("#chart path.ln").length`)) === 12);
await p.eval(`document.querySelector("#curves").scrollIntoView()`); await b.sleep(300);
const r = JSON.parse(await p.eval(`(function(){var r=document.querySelector("#chart .ov").getBoundingClientRect();return JSON.stringify({x:r.left,y:r.top,w:r.width,h:r.height})})()`));
await p.move(r.x + r.w * 0.4, r.y + r.h * 0.5); await b.sleep(300);
ok("program: the tooltip lists every line at the crosshair", (await p.eval(`document.querySelectorAll("#chart .tip .tr").length`)) === 12);
await p.shot(join(out, "i-hover.png"));
ok("program: nothing limits the lines: all 12 are on, no row is blocked, and the header says Showing 12 of 12", (await p.eval(`document.querySelectorAll('#legend .legend-view:not([hidden]) input.lgcb:checked').length`)) === 12 && (await p.eval(`document.querySelectorAll('#legend .legend-view:not([hidden]) input.lgcb[aria-disabled="true"]').length`)) === 0 && (await p.eval(`document.querySelector('#legend .legend-view:not([hidden]) [data-lg-head]').textContent`)) === "Showing 12 of 12");
ok("program: the legend rows have room to be pressed (24 px at least)", await p.eval(`[...document.querySelectorAll('#legend .legend-view:not([hidden]) label.lgrow')].every(function(r){return r.getBoundingClientRect().height>=24})`));
ok("program: a tool without a curve has no row in the legend", await p.eval(`!document.querySelector('.legend-view:not([hidden]) details.lg-na') && document.querySelectorAll('.legend-view:not([hidden]) .lgrow.na').length === 0`));
await p.eval(`document.querySelector('#legend label.lgrow').dispatchEvent(new MouseEvent("mouseover", {bubbles: true}))`); await b.sleep(150);
ok("program: a hovered legend row emphasises its line and dims the others", (await p.eval(`document.querySelectorAll("#chart path.ln.dim").length`)) >= 6 && (await p.eval(`document.querySelectorAll("#chart path.ln.hot").length`)) === 1);
await p.eval(`document.querySelector('#legend label.lgrow').dispatchEvent(new MouseEvent("mouseout", {bubbles: true}))`); await b.sleep(150);
ok("program: leaving the row restores the lines", (await p.eval(`document.querySelectorAll("#chart .dim").length`)) === 0);
await p.eval(`document.getElementById("chart").focus()`); await press(p, "End", "End", 35); await b.sleep(150);
ok("program: the chart is a slider that reads out the lines", (await p.eval(`document.getElementById("chart").getAttribute("role")`)) === "slider" && (await p.eval(`document.getElementById("chart").getAttribute("aria-valuetext")`)).startsWith("Campaign time 6:00"));
await press(p, "ArrowLeft", "ArrowLeft", 37); await b.sleep(150);
ok("program: the arrow keys move the reading", (await p.eval(`document.getElementById("chart").getAttribute("aria-valuetext")`)).startsWith("Campaign time 5:45"));
ok("program: every drawn line has an end label", (await p.eval(`document.querySelectorAll("#chart text.endlab").length`)) === (await p.eval(`document.querySelectorAll("#chart path.ln").length`)));
await p.eval(`document.querySelector('#legend input[data-sys="aflpp"]').click()`); await b.sleep(300);
ok("program: switching a line off removes it from the chart", (await p.eval(`document.querySelectorAll("#chart path.ln").length`)) === 11 && (await p.eval(`document.querySelector('#legend input[data-sys="klee-uniform-6w"]').getAttribute("aria-disabled")`)) === null);
ok("program: a family chip shows its state (some on is mixed)", await p.eval(`[...document.querySelectorAll("#famchips .chip")].some(function(c){return c.getAttribute("aria-pressed")==="mixed"||c.getAttribute("aria-pressed")==="true"})`));
await p.eval(`document.querySelector('#famchips [data-fam="symbolic"]').click()`); await b.sleep(300);
ok("program: a family chip toggles its lines", (await p.eval(`document.querySelectorAll("#chart path.ln").length`)) !== 11);
await p.eval(`document.querySelector('input[name=cview][value=ablation]').click()`); await b.sleep(400);
ok("program: an end label is broken into lines and never cut short (no ellipsis)", await p.eval(`(function(){var t=[...document.querySelectorAll("#chart text.endlab")];return t.length>3 && t.every(function(e){return !/…/.test(e.textContent)}) && t.some(function(e){return e.querySelectorAll("tspan").length>1})})()`));
ok("program: the legend header says how many lines are shown of how many, and nothing more", await p.eval(`(function(){var v=document.querySelector('.legend-view[data-view="ablation"]');return /^Showing \\d+ of \\d+$/.test(v.querySelector("[data-lg-head]").textContent) && !v.querySelector(".lg-key")})()`));
await p.eval(`document.querySelector('input[name=cview][value=main]').click()`); await b.sleep(300);
await p.eval(`document.querySelector('input[name=trange][value="2h"]').click()`); await b.sleep(400);
ok("program: the time range 0 to 2 h shows a shorter axis that ends at 2 h", await p.eval(`(function(){var t=[...document.querySelectorAll("#chart .ax text")].map(function(e){return e.textContent});return t.indexOf("2 h")>=0 && t.indexOf("3 h")<0})()`));
await p.eval(`document.querySelector('input[name=trange][value=full]').click()`); await b.sleep(300);
await p.eval(`document.querySelector('input[name=cview][value=ablation]').click()`); await b.sleep(400);
ok("program: the ablation view shows its own legend", (await p.eval(`document.querySelector('.legend-view[data-view="ablation"]').hidden`)) === false && (await p.eval(`document.querySelectorAll('.legend-view[data-view="ablation"] input.lgcb').length`)) >= 5);
await p.eval(`document.querySelector('input[name=cview][value=seeding]').click()`); await b.sleep(400);
ok("program: the seeding view shows its own legend", (await p.eval(`document.querySelector('.legend-view[data-view="seeding"]').hidden`)) === false && (await p.eval(`document.querySelectorAll('.legend-view[data-view="seeding"] input.lgcb').length`)) >= 1);
await p.eval(`document.querySelector('input[name=cview][value=main]').click(); document.getElementById("tab-table").click()`); await b.sleep(400);
ok("program: the table tab lists 25 checkpoints", (await p.eval(`document.querySelectorAll("#panel-table tbody tr").length`)) === 25);
await p.eval(`document.getElementById("tab-chart").click()`); await b.sleep(300);
await p.eval(`document.querySelector('#final button[data-grp="ablation"]').click()`); await b.sleep(200);
ok("program: a group of the final table expands", (await p.eval(`document.querySelectorAll('#final tr[data-g="ablation"]:not(.grp):not([hidden])').length`)) === 10);
await p.eval(`document.querySelector('#final button.sort[data-k="med"]').click()`); await b.sleep(200);
const meds = JSON.parse(await p.eval(`JSON.stringify([...document.querySelectorAll('#final tr[data-g="main"]:not(.grp)')].map(function(r){return Number(r.getAttribute("data-med"))}))`));
ok("program: sorting the final table orders each group", meds.every((v, i) => i === 0 || meds[i - 1] >= v), meds.slice(0, 4).join(","));
await p.eval(`(function(){var s=document.getElementById("psel");s.value="gzip";s.dispatchEvent(new Event("change"))})()`); await b.sleep(400);
ok("program: choosing another program in the list does not load it by itself", (await p.eval("location.pathname")).endsWith("/programs/krep.html") && (await p.eval(`document.getElementById("pgo").hidden`)) === false);
await p.eval(`document.getElementById("pgo").click()`); await b.sleep(900);
ok("program: the Open button goes to the other program page", (await p.eval("location.pathname")).endsWith("/programs/gzip.html"));
await p.close();

// ---- the map at a narrow width ---------------------------------------------------------------------------------
p = await open("programs/krep.html", { w: 390, h: 844, mobile: true });
ok("phone: the map offers a tool selector instead of the radio list", (await p.eval(`getComputedStyle(document.querySelector(".bm-select-wrap")).display`)) === "block" && (await p.eval(`getComputedStyle(document.querySelector(".bm-radios")).display`)) === "none");
await p.eval(`(function(){var s=document.querySelector(".bm-select-wrap select");s.value=s.options[2].value;s.dispatchEvent(new Event("change"))})()`); await b.sleep(400);
ok("phone: the cells are at least 6 px, so they can be pointed at", Number(await p.eval(`document.querySelector("#mapbox").getAttribute("data-cell")`)) >= 6);
ok("phone: the map legend of one tool is a grid of two columns", (await p.eval(`getComputedStyle(document.querySelector(".bm-legend")).gridTemplateColumns.split(" ").length`)) === 2);
ok("phone: the top bar scrolls away and only the section bar sticks", (await p.eval(`getComputedStyle(document.querySelector(".topbar")).position`)) === "static" && (await p.eval(`getComputedStyle(document.querySelector(".subbar")).position`)) === "sticky");
ok("phone: every page of the navigation is reachable without a sideways swipe", await p.eval(`(function(){var n=document.querySelector(".nav");return n.scrollWidth<=n.clientWidth+1 && [...n.querySelectorAll("a")].every(function(a){var r=a.getBoundingClientRect();return r.right<=window.innerWidth})})()`));
ok("phone: choosing a tool in the selector changes the map summary", (await p.eval(`document.querySelector(".bm-summary").textContent`)).includes("Only this tool") === false && (await p.eval(`document.querySelector(".bm-select-wrap select").selectedIndex`)) === 2);
await p.eval(`(function(){var s=document.querySelector(".bm-select-wrap select");s.value="-1";s.dispatchEvent(new Event("change"))})()`); await b.sleep(300);
ok("phone: the map legend of all tools is two rows of three (none and five classes at most)", await p.eval(`(function(){var l=document.querySelector(".bm-legend");return getComputedStyle(l).gridTemplateColumns.split(" ").length===3 && l.children.length<=6})()`));
await p.close();
p = await open("programs/krep.html", { w: 800, h: 800 });
ok("tablet: at 800 px the map also uses the selector", (await p.eval(`getComputedStyle(document.querySelector(".bm-select-wrap")).display`)) === "block");
await p.close();

// ---- tables as records on a phone -----------------------------------------------------------------------------
p = await open("programs/krep.html", { w: 390, h: 844, mobile: true });
ok("phone: the final table keeps three columns (tool, median, share) and is short (at most 960 px)", await p.eval(`(function(){var t=document.querySelector("#final table");var vis=[...t.tHead.rows[0].cells].filter(function(c){return getComputedStyle(c).display!=="none"});return vis.length===3 && t.getBoundingClientRect().width<=window.innerWidth && document.querySelector("#final").getBoundingClientRect().height<=960})()`));
await p.close();
p = await open("tools.html", { w: 390, h: 844, mobile: true });
ok("phone: the Tools table shows the answer beside the name, in records", await p.eval(`(function(){var t=document.querySelector("#tools-wrap table");return getComputedStyle(t).display==="block" && !!t.querySelector('td[data-label="Track"]') && t.getBoundingClientRect().width<=window.innerWidth})()`));
await p.close();
p = await open("contribute.html", { w: 390, h: 844, mobile: true });
ok("phone: the table of places to report a problem is a list of records inside the page", await p.eval(`(function(){var t=document.querySelector("#report ~ .tbl-wrap table");return getComputedStyle(t).display==="block" && t.getBoundingClientRect().width<=window.innerWidth})()`));
await p.close();

// ---- the phone width -------------------------------------------------------------------------------------------
for (const page of ["results.html", "tools.html", "compare.html", "method.html", "contribute.html", "programs/xorriso.html", "programs/krep.html", "404.html"]) {
  p = await open(page, { w: 390, h: 844, mobile: true });
  const m = JSON.parse(await p.eval(`JSON.stringify({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, gutter: (function(){var e=document.querySelector("main");var s=getComputedStyle(e);return parseFloat(s.paddingLeft)})()})`));
  ok(`phone: ${page} has no horizontal page scroll and a 16 px gutter`, m.sw <= m.cw && m.gutter === 16, JSON.stringify(m));
  await p.close();
}

// ---- the map, Terms, Tools, sorting, section links and the chart -----------------------------------------------------
// The live region is written 30 ms after a change (so that the same text is announced again); a tab that is not in front runs such a timer late, so the checks wait for it.
async function liveText(p, test, ms = 3000) {
  let t = "";
  for (let waited = 0; waited < ms; waited += 100) { t = await p.eval(`document.getElementById("live").textContent`); if (test(t)) return t; await b.sleep(100); }
  return t;
}
// Section links keep the browser's own navigation: the address is set, Back returns, and the focus moves to the heading of the section without scrolling.
p = await open("programs/krep.html");
await p.eval(`document.querySelector('.subbar nav a[data-sec="final"]').focus()`);
await p.cmd("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
await p.cmd("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
await b.sleep(600);
const secLink = JSON.parse(await p.eval(`JSON.stringify({ hash: location.hash, inside: !!document.activeElement.closest("#final"), tag: document.activeElement.tagName, y: Math.round(document.getElementById("h-final").getBoundingClientRect().top), cur: document.querySelector('.subbar nav a[data-sec="final"]').getAttribute("aria-current") })`));
ok("section links: Enter on 'Final coverage' sets #final, puts the focus inside that section (its heading), leaves its heading under the bars and marks the link current", secLink.hash === "#final" && secLink.inside && secLink.tag === "H2" && secLink.y > 40 && secLink.y < 200 && secLink.cur === "location", JSON.stringify(secLink));
await p.eval(`history.back()`); await b.sleep(500);
ok("section links: Back returns to where the visitor was", (await p.eval(`location.hash`)) === "" && (await p.eval(`window.scrollY`)) < 200, await p.eval(`location.hash + " " + window.scrollY`));
// Terms is a popover: Esc closes it and returns the focus to its summary, a click outside closes it, moving the focus out closes it; opening moves nothing.
const termsBefore = JSON.parse(await p.eval(`JSON.stringify({ h: document.documentElement.scrollHeight, y: Math.round(document.querySelector(".kv").getBoundingClientRect().top) })`));
await p.eval(`document.querySelector(".terms > summary").click()`); await b.sleep(150);
const termsOpen = JSON.parse(await p.eval(`JSON.stringify({ open: document.querySelector(".terms").open, h: document.documentElement.scrollHeight, y: Math.round(document.querySelector(".kv").getBoundingClientRect().top), pos: getComputedStyle(document.querySelector(".terms-dl")).position, inside: document.querySelector(".terms-dl").getBoundingClientRect().right <= document.documentElement.clientWidth && document.documentElement.scrollWidth <= document.documentElement.clientWidth })`));
ok("Terms: opening it moves nothing on the page (it is positioned out of the flow) and the list stays inside the window (on a program page the summary is at the right end of the title)", termsOpen.open && termsOpen.pos === "absolute" && termsOpen.inside && termsOpen.h === termsBefore.h && termsOpen.y === termsBefore.y, JSON.stringify({ termsBefore, termsOpen }));
await p.key("Escape"); await b.sleep(150);
ok("Terms: Esc closes it and returns the focus to its summary", (await p.eval(`!document.querySelector(".terms").open && document.activeElement === document.querySelector(".terms > summary")`)) === true);
await p.eval(`document.querySelector(".terms > summary").click()`); await b.sleep(100);
await p.click(30, 450); await b.sleep(150);      // the empty margin left of the page
ok("Terms: a click outside it closes it", (await p.eval(`document.querySelector(".terms").open`)) === false);
await p.eval(`document.querySelector(".terms > summary").click(); document.querySelector(".terms > summary").focus()`); await b.sleep(100);
await p.cmd("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }); await p.cmd("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }); await b.sleep(100);
await p.eval(`document.querySelector(".kv").scrollIntoView(); (document.querySelector("#psel")||document.body).focus()`); await b.sleep(100);
ok("Terms: moving the focus out of it closes it", (await p.eval(`document.querySelector(".terms").open`)) === false);
// The chart's tooltip is dismissed by Esc wherever the focus is.
{
  const ov = JSON.parse(await p.eval(`document.querySelector("#chart").scrollIntoView({ block: "center" }); JSON.stringify(document.querySelector("#chart .ov").getBoundingClientRect())`));
  await b.sleep(300);
  const o2 = JSON.parse(await p.eval(`JSON.stringify(document.querySelector("#chart .ov").getBoundingClientRect())`));
  await p.move(o2.x + o2.width / 2, o2.y + o2.height / 2); await b.sleep(200);
  const on = await p.eval(`document.querySelector("#chart .tip").classList.contains("on")`);
  await p.eval(`document.activeElement && document.activeElement.blur()`);
  await p.key("Escape"); await b.sleep(200);
  ok("chart: Esc dismisses the tooltip without moving the pointer", on && (await p.eval(`document.querySelector("#chart .tip").classList.contains("on")`)) === false);
}
// The map says what changed in the live region of the page.
await p.eval(`[...document.querySelectorAll(".bm-tool input")].find(function (r) { return !r.checked && r.value !== "-1"; }).click()`);
const live1 = await liveText(p, (t) => /reaches/.test(t));
ok("map: choosing a tool writes its summary to the live region of the page", /reaches [\d,]+ of [\d,]+ branches/.test(live1), live1);
await p.eval(`document.querySelector(".bm-chip").click()`);
const live2 = await liveText(p, (t) => /^Highlighting/.test(t));
ok("map: choosing a legend chip says what is highlighted", /^Highlighting .+: [\d,]+ branches$/.test(live2), live2);
await p.eval(`document.querySelector(".bm-chip").click()`);
ok("map: choosing it again says the highlight is cleared", (await liveText(p, (t) => t === "Highlight cleared")) === "Highlight cleared");
// Esc dismisses the tooltip wherever the focus is.
const mapRect = JSON.parse(await p.eval(`document.querySelector(".bm-stage").scrollIntoView({block:"center"}); JSON.stringify(document.querySelector(".bm-stage").getBoundingClientRect())`));
await b.sleep(200);
await p.move(mapRect.x + 3, mapRect.y + 3); await b.sleep(150);
const tipOn = await p.eval(`!document.querySelector(".bm-tip").hidden`);
await p.key("Escape"); await b.sleep(150);
ok("map: Esc dismisses the tooltip without moving the pointer", tipOn && (await p.eval(`document.querySelector(".bm-tip").hidden`)) === true);
ok("map: the three table views have captions, headings are h3 under the h2 of the section, and the legend items are not list items", await p.eval(`(function(){var d=document.querySelector(".bm-tables"); d.open=true; return new Promise(function(r){setTimeout(function(){ r(d.querySelectorAll("caption").length===3 && d.querySelectorAll("h3").length===3 && !d.querySelector("h4") && [...document.querySelectorAll(".bm-legend > li")].every(function(l){return l.getAttribute("role")==="presentation"})) },100)})})()`));
await p.close();

// The sort buttons: the live message reads the heading as it is on screen, with spaces; the name of the button says "track".
p = await open("results.html");
await p.cmd("Accessibility.enable");
await p.eval(`document.querySelector('#g-main button.sort[data-k="c0"]').click()`);
const msg = await liveText(p, (t) => /^Sorted by/.test(t));
ok("sort: the live message reads 'Sorted by Agolic KLEE GPT-5.5 open track, descending'", msg === "Sorted by Agolic KLEE GPT-5.5 open track, descending", msg);
{
  const { nodes } = await p.cmd("Accessibility.getFullAXTree");
  const btn = nodes.find((n) => n.role && n.role.value === "button" && n.name && /^Agolic KLEE GPT-5\.5\s*,?\s*version [^ ]+ open/.test(n.name.value));
  ok("sort: the accessible name of the button is the heading with the version read out and 'track', without the glyph", !!btn && /^Agolic KLEE GPT-5\.5\s*,?\s*version 1\.0\.1\+2407fd07 open track$/.test(btn.name.value) && !/[↕↑↓]/.test(btn.name.value), btn ? btn.name.value : "no button named like the heading");
}
await p.close();

// Theme: a change of the system setting to the one the page has repaints nothing; a change to the other repaints the map once.
for (const [scheme, to, expect] of [["light", "dark", 1], ["light", "light", 0]]) {
  p = await b.newPage();
  await p.viewport(1440, 900, 1, false); await p.media({ scheme });
  await p.goto(base + "programs/krep.html", 1800);
  await p.eval(`window.__rep = 0; new MutationObserver(function (m) { __rep += m.length; }).observe(document.querySelector(".bm"), { attributes: true, attributeFilter: ["data-paint-ms"] })`);
  await p.media({ scheme: to });
  await b.sleep(500);
  const n = await p.eval(`window.__rep`);
  ok(`theme: a change of the system theme from ${scheme} to ${to} repaints the map ${expect} time${expect === 1 ? "" : "s"}`, n === expect, `repaints ${n}`);
  await p.close();
}

// The map's bitmap: one canvas, at most 8 million pixels even at a pixel ratio of 3 on a phone (xorriso is the tallest map).
p = await b.newPage();
await p.viewport(390, 844, 3, true);
await p.goto(base + "programs/xorriso.html", 2200);
const cv = JSON.parse(await p.eval(`JSON.stringify([...document.querySelectorAll(".bm-stage canvas")].map(function (c) { return { w: c.width, h: c.height, px: c.width * c.height, css: c.clientWidth }; }))`));
ok("map: xorriso at 390 px and a pixel ratio of 3 has one canvas of at most 8 million pixels, drawn at its CSS size", cv.length === 1 && cv[0].px <= 8e6 && cv[0].css > 200, JSON.stringify(cv));
await p.close();

// A phone held sideways shows the whole chart: it is at most 70 percent of the window high, axis and end labels together.
p = await b.newPage();
await p.viewport(844, 390, 2, true);
await p.goto(base + "programs/woff2.html", 2200);
await p.eval(`document.querySelector("#chart").scrollIntoView({ block: "start" }); window.scrollBy(0, -30)`); await b.sleep(300);
const ch = JSON.parse(await p.eval(`JSON.stringify((function () { var h = document.querySelector("#chart"), r = h.getBoundingClientRect(), ax = [...h.querySelectorAll(".ax text")].map(function (t) { return t.getBoundingClientRect().bottom; }); return { h: Math.round(r.height), bottom: Math.round(r.bottom), vh: innerHeight, axis: Math.round(Math.max.apply(null, ax)), labels: h.querySelectorAll(".endlab").length }; })())`));
ok("chart: at 844 by 390 the chart is at most 70 percent of the window high and its time axis and end labels are in view together", ch.h <= 0.7 * ch.vh + 1 && ch.bottom <= ch.vh && ch.axis <= ch.vh && ch.labels >= 5, JSON.stringify(ch));
await p.close();

// Touch on the map (a phone): a swipe that starts on it scrolls its frame and then the page; a pinch zooms; a tap within a few pixels of a cell pins that cell.
p = await b.newPage();
await p.viewport(390, 844, 2, true);
await p.cmd("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
await p.goto(base + "programs/xorriso.html", 2200);
const fh = JSON.parse(await p.eval(`JSON.stringify({ h: Math.round(document.querySelector(".bm-frame").getBoundingClientRect().height), cap: Math.min(560, 0.6 * innerHeight), ta: getComputedStyle(document.querySelector(".bm-stage")).touchAction })`));
ok("map: on a phone its frame is at most 60 percent of the window high and the map allows panning and pinch zoom", fh.h <= fh.cap + 1 && (fh.ta === "manipulation" || (/pan-x/.test(fh.ta) && /pan-y/.test(fh.ta) && /pinch-zoom/.test(fh.ta))), JSON.stringify(fh));      // manipulation is those three
await p.eval(`document.querySelector(".bm-frame").scrollIntoView({ block: "start" })`); await b.sleep(300);
const mapFrame = JSON.parse(await p.eval(`JSON.stringify(document.querySelector(".bm-frame").getBoundingClientRect())`));
await p.eval(`(function () { var f = document.querySelector(".bm-frame"); f.scrollTop = f.scrollHeight; })()`); await b.sleep(300);
const y0 = await p.eval(`window.scrollY`);
let y1 = y0;
for (let attempt = 0; attempt < 3 && y1 <= y0 + 50; attempt++) {      // a synthesized swipe is sometimes taken by the frame's own overscroll first; the page must follow within three
  await p.cmd("Input.synthesizeScrollGesture", { x: mapFrame.x + 100, y: mapFrame.y + mapFrame.height / 2, yDistance: -200, gestureSourceType: "touch", speed: 600 });
  await b.sleep(700);
  y1 = await p.eval(`window.scrollY`);
}
ok("map: a swipe that starts on the map scrolls the page once the frame has reached its end", y1 > y0 + 50, `${y0} -> ${y1}`);
await p.eval(`document.querySelector(".bm-frame").scrollTop = 0; document.querySelector(".bm-frame").scrollIntoView({ block: "center" })`); await b.sleep(300);
const mapFrame2 = JSON.parse(await p.eval(`JSON.stringify(document.querySelector(".bm-frame").getBoundingClientRect())`));
await p.cmd("Input.synthesizePinchGesture", { x: mapFrame2.x + mapFrame2.width / 2, y: Math.min(Math.max(mapFrame2.y + 100, 100), 700), scaleFactor: 2, gestureSourceType: "touch" });
await b.sleep(600);
ok("map: a pinch over the map zooms the page (visualViewport.scale changes)", (await p.eval(`visualViewport.scale`)) > 1.2, await p.eval(`visualViewport.scale`));
await p.close();
p = await b.newPage();
await p.viewport(390, 844, 2, true);
await p.cmd("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
await p.goto(base + "programs/krep.html", 2200);
await p.eval(`document.querySelector(".bm-frame").scrollIntoView({ block: "start" }); document.querySelector(".bm-stage").focus()`); await b.sleep(300);
await p.key("PageDown"); await b.sleep(150);
const pinCell = JSON.parse(await p.eval(`JSON.stringify((function () { var c = document.querySelector(".bm-cursor"), s = document.querySelector(".bm-stage").getBoundingClientRect(), m = /translate\\((-?[\\d.]+)px, ?(-?[\\d.]+)px\\)/.exec(c.style.transform); return { x: s.x + parseFloat(m[1]) + 3.5, y: s.y + parseFloat(m[2]) + 1.5, tr: c.style.transform }; })())`));
await p.key("Escape"); await b.sleep(100);
async function tap(x, y) {
  await p.cmd("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await p.cmd("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await b.sleep(250);
  return JSON.parse(await p.eval(`JSON.stringify({ pinned: !document.querySelector(".bm-cursor").hidden, tr: document.querySelector(".bm-cursor").style.transform })`));
}
const inCell = await tap(pinCell.x, pinCell.y + 2);
await tap(pinCell.x, pinCell.y + 2);
const nearBy = await tap(pinCell.x, pinCell.y - 2);
ok("map: a tap 2 px outside a cell (in the band between two files) pins the same cell as a tap in it", inCell.pinned && nearBy.pinned && inCell.tr === pinCell.tr && nearBy.tr === inCell.tr, JSON.stringify({ cell: pinCell.tr, inCell, nearBy }));
await p.close();

// Tools: the name of a tool is an ordinary link to its row (it opens the row and does not close it again); only the button toggles.
p = await open("tools.html");
const nm = JSON.parse(await p.eval(`JSON.stringify({ btn: document.querySelector("tr.trow .rowbtn").getAttribute("aria-label"), name: document.querySelector("tr.trow a.pname").textContent })`));
ok("tools: the button of a row is named 'Results of <tool>'", nm.btn === "Results of " + nm.name, JSON.stringify(nm));
await p.eval(`document.querySelector("tr.trow a.pname").click()`); await b.sleep(400);
const o1 = await p.eval(`document.querySelector("tr.trow .rowbtn").getAttribute("aria-expanded")`);
await p.eval(`location.hash = ""; document.querySelector("tr.trow a.pname").click()`); await b.sleep(400);
const o2 = await p.eval(`document.querySelector("tr.trow .rowbtn").getAttribute("aria-expanded")`);
ok("tools: the name link opens the row and following it again does not close it", o1 === "true" && o2 === "true", o1 + " " + o2);
await p.eval(`document.querySelector("tr.trow .rowbtn").click()`); await b.sleep(200);
ok("tools: the button closes the row", (await p.eval(`document.querySelector("tr.trow .rowbtn").getAttribute("aria-expanded")`)) === "false");
await p.close();

// ---- skyline key, chart head, refused chip, Compare, map table, prose pages, palette, Terms on every page, range unit ------------------------
{
  // Results: the range unit fits 1,232 px for every group and unit (also from the address #main-spread); the glyph of a sort button is inside its head
  let q = await open("results.html#main-spread", { w: 1280, h: 900 });
  const widths = [];
  for (const g of ["main", "ablation", "seeding", "control"]) for (const u of ["pct", "n", "spread"]) {
    await q.eval(`document.querySelector('input[name=rgroup][value=${g}]').click(); document.querySelector('input[name=unit][value=${u}]').click()`); await b.sleep(80);
    const r = JSON.parse(await q.eval(`JSON.stringify({ sw: document.documentElement.scrollWidth, iw: innerWidth })`));
    if (r.sw !== r.iw) widths.push(`${g}/${u}: ${r.sw}`);
  }
  ok("results: every group and unit fits the window at 1280 px, the range unit included (the address #main-spread opens without a sideways scroll)", widths.length === 0, widths.join(" | "));
  await q.close();
  q = await open("results.html#main-spread", { w: 1280, h: 900 });
  ok("results: the address #main-spread shows the range unit, two lines, no brackets, and reads value, runs, range", await q.eval(`(function(){var td=document.querySelector('#g-main td.cell[data-lo]');var rg=td.querySelector(".rg");var sr=[...td.querySelectorAll(".sr")].map(function(e){return e.textContent});return document.documentElement.scrollWidth<=innerWidth && /^[\\d,]+–[\\d,]+$/.test(rg.textContent) && rg.getAttribute("aria-hidden")==="true" && /^, \\d runs?$/.test(sr[0]) && /^, range [\\d,]+ to [\\d,]+$/.test(sr[1])})()`));
  await q.close();

  // a program page: one legend with class names for the eye and the ear, the word Unreached, the stacked skyline
  q = await open("programs/krep.html");
  ok("program: once the map is drawn the key under the skyline is hidden from assistive technology, so one key names the classes, and both say Unreached", await q.eval(`(function(){var sk=document.querySelector("[data-sky-lg]");var chips=[...document.querySelectorAll(".bm-legend .bm-chip-k")].map(function(e){return e.textContent});return sk.getAttribute("aria-hidden")==="true" && /Unreached/.test(sk.textContent) && chips[0]==="Unreached" && document.querySelectorAll('.sky-lg:not([aria-hidden="true"]), .bm-legend').length===1})()`));
  ok("program: the skyline has no line that explains it (the key names the classes)", await q.eval(`!document.querySelector(".sky .tkey")`));
  // the map table view shows every row of the short tables (the last row, "All 12", included) and caps only the file table
  await q.eval(`document.querySelector(".bm-tables > summary").click()`); await b.sleep(300);
  ok("program: the map's Table view shows every row of its short tables, 'All 12' included, and caps only the table of files", await q.eval(`(function(){var t=[...document.querySelectorAll(".bm-scroll")];var by=t[0],h=t[1],f=t[2];function full(e){return e.scrollHeight<=e.clientHeight+1}return full(by)&&full(h)&&/All 12|^12/.test(h.querySelector("tbody tr:last-child").textContent)&&f.classList.contains("bm-scroll-cap")&&by.querySelectorAll("tbody tr").length===12})()`));
  ok("program: the list of tools says 'Reached by this tool only' and writes a zero lighter", await q.eval(`(function(){var h=document.querySelector(".bm-tools-head").textContent;var z=document.querySelector(".bm-tool-u.is-zero");return /Reached by this tool only/.test(h)&&!!z&&getComputedStyle(z).color!==getComputedStyle(document.querySelector(".bm-tool-u:not(.is-zero)")).color})()`));
  // the chart: the head has two rows and nothing moves when the group changes; a refused family chip says why in the status line
  const y0 = await q.eval(`Math.round(document.querySelector("#chart").getBoundingClientRect().top + scrollY)`);
  await q.eval(`document.querySelector('input[name=cview][value=ablation]').click()`); await b.sleep(300);
  const y1 = await q.eval(`Math.round(document.querySelector("#chart").getBoundingClientRect().top + scrollY)`);
  await q.eval(`document.querySelector('input[name=cview][value=main]').click()`); await b.sleep(300);
  ok("program: switching the group moves the chart by 2 px at most", Math.abs(y1 - y0) <= 2, `${y0} ${y1}`);
  ok("program: the legend scrolls with an edge (a legend taller than its box shows a gradient)", await q.eval(`getComputedStyle(document.querySelector("#legend")).backgroundImage.includes("gradient")`));
  await q.close();
  q = await open("programs/jq.html");
  ok("program: on jq every line is on and the status line reads 'Showing 4 of 4'", await q.eval(`(function(){var v=document.querySelector('.legend-view[data-view="main"]');return v.querySelector("[data-lg-head]").textContent==="Showing 4 of 4" && v.querySelectorAll("input.lgcb:checked").length===4})()`));
  await q.close();
  // the chart head on a phone is short
  q = await open("programs/krep.html", { w: 390, h: 844, mobile: true });
  const th = await q.eval(`Math.round(document.querySelector("#curves .card-head").getBoundingClientRect().height)`);
  ok("program: the chart head on a phone is 200 px high at most", th <= 200, String(th));
  await q.close();

  // Compare: the same tool twice hides the links to sections that are not there; a pair on different tracks has one heading over the merged cell; p beside U
  q = await open("compare.html");
  await q.eval(`var a=document.querySelector("#sel-a"),b2=document.querySelector("#sel-b");b2.value=a.value;b2.dispatchEvent(new Event("change",{bubbles:true}))`); await b.sleep(300);
  ok("compare: the same tool twice hides the links to the sections that are not drawn", await q.eval(`document.querySelector('.subbar nav[aria-label="On this page"]').hidden===true && /Choose two different tools/.test(document.querySelector("#cmp-out").textContent)`));
  await q.eval(`location.hash = "#aflpp_vs_agolic-klee-gpt55"`); await b.sleep(400);
  ok("compare: tools on different tracks have one merged heading 'Comparison' and no A12, U or p headings", await q.eval(`(function(){var th=[...document.querySelectorAll("#medians thead th")].map(function(e){return e.textContent.trim()});return th.indexOf("Comparison")>=0 && th.indexOf("A12")<0 && th.indexOf("U")<0 && th.indexOf("p")<0 && document.querySelector('.subbar nav[aria-label="On this page"]').hidden===false})()`));
  await q.eval(`location.hash = "#klee-fixed-1w_vs_klee-fixed-6w"`); await b.sleep(400);
  ok("compare: a pair that differs in cores says so in one line, and nothing is said about counts published earlier", await q.eval(`/^A and B differ in cores \\(A one, B six\\)\\.$/.test(document.querySelector(".cmp-warn").textContent) && !/published earlier/.test(document.querySelector("#cmp-out").textContent)`));
  await q.close();

  // Terms: on the pages of tables, grouped under sub-labels; the search finds definitions, the licence and the cost
  for (const pg of ["results.html", "tools.html"]) {
    q = await open(pg);
    await q.eval(`document.querySelector(".terms > summary").click()`); await b.sleep(200);
    ok(`${pg}: Terms opens under its sub-labels`, await q.eval(`(function(){var d=document.querySelector(".terms");var g=[...d.querySelectorAll(".tg")].map(function(e){return e.getAttribute("data-g")});return d.open && g.length>=2 && g[0]==="Runs" && d.querySelector("dl").getBoundingClientRect().right<=innerWidth})()`));
    await q.close();
  }
  q = await open("results.html");
  await q.eval(`document.querySelector("[data-open-palette]").click()`); await b.sleep(200);
  const found = {};
  for (const w of ["data", "privacy", "cost", "gcov", "glossary", "sanitiser"]) {
    await q.eval(`(function(){var i=document.getElementById("pal-in");i.value=${JSON.stringify(w)};i.dispatchEvent(new Event("input",{bubbles:true}))})()`); await b.sleep(80);
    found[w] = await q.eval(`document.querySelectorAll("#pal-list a").length`);
  }
  ok("search: data, privacy, cost, gcov, glossary and sanitiser each return a result", Object.values(found).every((n) => n > 0), JSON.stringify(found));
  await q.eval(`(function(){var i=document.getElementById("pal-in");i.value="zzzzqq";i.dispatchEvent(new Event("input",{bubbles:true}))})()`); await b.sleep(80);
  ok("search: nothing found says where definitions are", (await q.eval(`document.querySelector("#pal-list .none").textContent`)).includes("Definitions are in Terms on the pages of tables"));
  await q.close();
  // the address #terms opens the Terms of a page
  q = await open("results.html#terms");
  ok("terms: the address #terms opens the Terms of the page", await q.eval(`document.querySelector(".terms").open === true`));
  await q.close();

  // Method and Contribute: one prose size, one column measure, a 26 px section heading
  const prose = {};
  for (const pg of ["method.html", "contribute.html"]) {
    q = await open(pg);
    prose[pg] = JSON.parse(await q.eval(`JSON.stringify((function(){var a=document.querySelector(".prose");var h=document.querySelector(".prose h2");var li=document.querySelector(".prose p, .prose dd");var w=[...document.querySelectorAll(".prose > *, .prose .defs, .prose .tbl-wrap")].map(function(e){return Math.round(e.getBoundingClientRect().width)});return {p:getComputedStyle(li).fontSize, h2:h?getComputedStyle(h).fontSize:"", max:Math.max.apply(null,w), art:Math.round(a.getBoundingClientRect().width)}})())`));
    await q.close();
  }
  ok("prose pages: Method and Contribute use one prose size (18 px serif) and one measure of 38 rem (608 px) at most, and a section heading of 26 px", prose["method.html"].p === "18px" && prose["method.html"].p === prose["contribute.html"].p && prose["contribute.html"].h2 === "26px" && prose["method.html"].max <= 609 && prose["contribute.html"].max <= 609, JSON.stringify(prose));
}

await b.close();
server.close();
console.log(failed ? `${failed} checks failed` : "all checks passed");
process.exit(failed ? 1 : 0);
