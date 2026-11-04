// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The Agent Software Testing authors
// Layout and state checks in headless Chrome against a built site served over loopback:
//   phones (360 and 390 px): no page overflows sideways, every table that becomes a list of records fits its frame, the count of every
//     sanitiser error kind is inside the cell, the values of the Compare Resources table can be pointed at;
//   forced colours (Windows high contrast, emulated): the selected row of the branch map and the other chosen states use system colours;
//   no script: the controls that need a script are not offered, and the column labels they hold stay as plain text;
//   accessible names: a Results row header is the program name alone (nothing follows it on screen);
//   skip link: present on every page, and on a page served for an unknown address (which sets a <base>) it moves the focus to the content;
//   large text (root font 130, 150 and 200 percent at 320 px), narrow screens (240 and 280 px), touch targets under a coarse pointer, the swatches of the map key
//     in forced colours on every program, the focus rings of the bar (a pixel scan), the page for an unknown address at depth (no failing request), Compare without scripts;
//   sticky heads (the table of an open row of Tools, the family bands of Results), frames with no script and in a short window, the focus not obscured at 320 by 256 and 568 by 320 px,
//     the Terms popover from 360 to 1400 px, the range unit at 1280, 1440 and 1920 px and a table forced wide, the bar from 320 to 390 px, the first column of Results on a phone and the
//     edge of a frame that scrolls, touch targets at 768 and 1024 px, the theme-color, forced colours (chips, Compare), a script that fails, the page for
//     an unknown address below a folder of another name and with base_url (a build of its own: set PYTHON to the interpreter).
//   the site as configured in site.json (build.py, set PYTHON) with its page for an unknown address at depth, with its Tools link checked; a table frame, the legend and an open Terms list are tab stops only while they scroll; the longest legend and the chart tooltip (320 to 390 px); Compare Resources with a long pair of
//     names (720 to 1100 px); Final coverage from 720 to 1100 px; the file names under the skyline; the blank space under the branch map; the family chips and their scroll edge; the focus ring of
//     the chosen segment; text spacing in the heads of Results; the targets of the 404 page; the program page without scripts and its sparklines and group rows.
//   node scripts/layout.mjs [--dist dist] [--port 9470] [--sweep]
// --sweep also checks that no page overflows sideways at 280, 320, 719, 720, 820, 1100, 1440, 1920 and 2560 px. Prints PASS or FAIL per check; exit status 1 on a failure.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { launch } from "./cdp.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const arg = (name, dflt) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : dflt; };
const dist = resolve(root, arg("dist", "dist"));
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".csv": "text/csv", ".svg": "image/svg+xml", ".png": "image/png" };
// A missing address gets 404.html with status 404, as a static host serves it, so the page that sets a <base> can be tested at depth.
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "results.html";
  let f = join(dist, p), status = 200;
  if (!f.startsWith(dist) || !existsSync(f) || !statSync(f).isFile()) {
    status = 404;
    f = /\.(css|js|json|csv|svg|png|woff2)$/.test(p) ? "" : join(dist, "404.html");
    if (!f) { res.writeHead(404); res.end("not found"); return; }
  }
  res.writeHead(status, { "content-type": TYPES[extname(f)] || "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;
const b = await launch({ port: Number(arg("port", 9470)) });
let failed = 0;
const ok = (name, cond, extra = "") => { if (!cond) failed++; console.log(cond ? "PASS" : "FAIL", name, extra); };
const pages = ["index", "results", "all-versions", "tools", "releases", "compare", "method", "contribute", "404"].concat(readdirSync(dist).filter((f) => /^tool-.*\.html$/.test(f)).sort().map((f) => f.replace(/\.html$/, ""))).concat(
  readdirSync(join(dist, "programs")).filter((f) => f.endsWith(".html")).sort().map((f) => "programs/" + f.replace(/\.html$/, "")));

async function open(path, { w = 1440, h = 900, scheme = "light", forced = "", nojs = false, fontPct = 100, touch = false } = {}) {
  const p = await b.newPage();
  await p.viewport(w, h, touch ? 2 : 1, w < 700);
  await p.media({ scheme, forced });
  if (nojs) await p.cmd("Emulation.setScriptExecutionDisabled", { value: true });
  if (touch) await p.cmd("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });      // a touch screen: (pointer: coarse)
  // a visitor's text-size setting scales the root font; setting it on <html> does the same for every rem
  const size = fontPct === 100 ? "" : `;document.addEventListener("DOMContentLoaded",function(){document.documentElement.style.fontSize="${fontPct}%"})`;
  if (size) await p.cmd("Page.addScriptToEvaluateOnNewDocument", { source: size.slice(1) });
  await p.goto(base + path, 1500);
  return p;
}

// ---- phones ----------------------------------------------------------------------------------------------------
const WIDTHS = process.argv.includes("--sweep") ? [280, 320, 360, 390, 719, 720, 820, 1100, 1440, 1920, 2560] : [360, 390];
const probe = `JSON.stringify((function () {
  var de = document.documentElement, out = { page: de.scrollWidth - de.clientWidth, wraps: [], kinds: [], recs: 0 };
  document.querySelectorAll(".tbl-wrap").forEach(function (wr) {
    var t = wr.querySelector("table"), isRecs = t && t.classList.contains("recs") && getComputedStyle(t).display === "block";
    if (isRecs) { out.recs++; if (wr.scrollWidth > wr.clientWidth + 1) out.wraps.push((wr.getAttribute("aria-label") || wr.previousElementSibling && wr.previousElementSibling.textContent || "?").slice(0, 50) + " " + wr.scrollWidth + ">" + wr.clientWidth); }
  });
  document.querySelectorAll(".kinds li").forEach(function (li) {
    var wr = li.closest(".tbl-wrap").getBoundingClientRect(), c = li.querySelector(".cnt").getBoundingClientRect(), k = li.querySelector(".kind").getBoundingClientRect();
    if (c.right > wr.right - 1 || c.left < wr.left || k.right > c.left + 1 || li.querySelector(".kind").scrollWidth > li.querySelector(".kind").clientWidth + 1) out.kinds.push(li.textContent.trim().slice(0, 40));
  });
  return out;
})())`;
// Every page at every width is most of the waiting, so six pages load at a time, each in its own tab.
async function eachPage(names, task, at = 6) {
  const queue = [...names];
  await Promise.all(Array.from({ length: at }, async () => {
    for (let name = queue.shift(); name !== undefined; name = queue.shift()) await task(name);
  }));
}
for (const w of WIDTHS) {
  const bad = [];
  let recs = 0, kindsSeen = 0;
  await eachPage(pages, async (name) => {
    const p = await open(name + ".html", { w, h: 844 });
    const m = JSON.parse(await p.eval(probe));
    recs += m.recs;
    kindsSeen += await p.eval(`document.querySelectorAll(".kinds li").length`);
    if (m.page > 0) bad.push(`${name}: page overflows by ${m.page}px`);
    if (w < 720 || process.argv.includes("--sweep")) {
      m.wraps.forEach((x) => bad.push(`${name}: record table wider than its frame: ${x}`));
      m.kinds.forEach((x) => bad.push(`${name}: sanitiser kind clipped or covering its count: ${x}`));
    }
    await p.close();
  });
  ok(`phone ${w}: no page overflows sideways, every list of records fits its frame, every error kind and its count are inside the cell`, bad.length === 0, bad.slice(0, 6).join(" | "));
  if (w < 720) ok(`phone ${w}: the checks saw record tables and sanitiser rows (${recs} tables, ${kindsSeen} kinds)`, recs > 40 && kindsSeen > 40);
}

for (const w of [360, 390]) {
  const p = await open("compare.html", { w, h: 844 });
  const r = JSON.parse(await p.eval(`JSON.stringify((function () {
    var t = document.querySelector("#resources table"), cells = [...t.querySelectorAll("tbody td")], hits = 0, labelled = 0, rows = t.querySelectorAll("tbody tr").length;
    cells.forEach(function (td) {
      td.scrollIntoView({ block: "center" });
      var r = td.getBoundingClientRect(), el = document.elementFromPoint(r.left + r.width - 4, r.top + r.height / 2);
      if (el && td.contains(el)) hits++;
      if (/^Tool [AB]$/.test(td.getAttribute("data-label") || "")) labelled++;
    });
    return { rec: t.classList.contains("recs"), display: getComputedStyle(t).display, cells: cells.length, hits: hits, labelled: labelled, rows: rows, headBlock: getComputedStyle(t.tBodies[0].rows[0].cells[0]).position };
  })())`));
  ok(`phone ${w}: Compare Resources is a list of records and every value can be pointed at`, r.rec && r.display === "block" && r.cells === 2 * r.rows && r.hits === r.cells && r.labelled === r.cells && r.headBlock !== "sticky", JSON.stringify(r));
  await p.close();
}

// ---- forced colours --------------------------------------------------------------------------------------------
for (const scheme of ["light", "dark"]) {
  const p = await open("programs/krep.html", { w: 1440, h: 900, scheme, forced: "active" });
  const sys = JSON.parse(await p.eval(`JSON.stringify((function () {
    var d = document.createElement("div"); d.style.cssText = "background-color:Highlight;color:HighlightText"; document.body.appendChild(d);
    var s = getComputedStyle(d), r = { bg: s.backgroundColor, fg: s.color, forced: matchMedia("(forced-colors: active)").matches }; d.remove(); return r;
  })())`));
  ok(`forced colours (${scheme}): the emulation is on`, sys.forced && sys.bg !== sys.fg, JSON.stringify(sys));
  const state = `JSON.stringify((function () {
    var on = document.querySelector(".bm-tool.is-on"); if (!on) return null;
    var s = getComputedStyle(on), kids = [...on.querySelectorAll("*")].filter(function (e) { return !e.children.length && e.textContent.trim(); });
    return { bg: s.backgroundColor, fg: s.color, kids: kids.map(function (e) { return getComputedStyle(e).color; }), n: kids.length };
  })())`;
  let r = JSON.parse(await p.eval(state));
  ok(`forced colours (${scheme}): the selected row of the branch map is Highlight with HighlightText, text included`, r && r.bg === sys.bg && r.fg === sys.fg && r.n >= 2 && r.kids.every((c) => c === sys.fg), JSON.stringify(r));
  await p.eval(`document.querySelectorAll(".bm-tool input")[2].click()`); await b.sleep(400);
  r = JSON.parse(await p.eval(state));
  ok(`forced colours (${scheme}): a chosen tool row keeps the same colours`, r && r.bg === sys.bg && r.kids.every((c) => c === sys.fg), JSON.stringify(r));
  const seg = JSON.parse(await p.eval(`JSON.stringify((function () {
    var s = getComputedStyle(document.querySelector('input[name="cview"]:checked + span')), t = getComputedStyle(document.querySelector('#tab-chart'));
    return { seg: s.backgroundColor, tab: t.backgroundColor };
  })())`));
  ok(`forced colours (${scheme}): the chosen segment and the chosen tab are Highlight`, seg.seg === sys.bg && seg.tab === sys.bg, JSON.stringify(seg));
  await p.eval(`document.querySelector('#legend input.lgcb:checked').click()`); await b.sleep(300);
  const off = await p.eval(`(function(){var k=document.querySelector("#legend .lgrow.off .keyswatch");var s=getComputedStyle(k);return s.outlineStyle+" "+s.outlineWidth})()`);
  ok(`forced colours (${scheme}): a legend row that is switched off is still drawn as an empty slot (outline, not a shadow)`, /^solid 1px/.test(off), off);
  await p.close();
}

// ---- no script -------------------------------------------------------------------------------------------------
for (const [name, what] of [["results.html", "Results"], ["tools.html", "Tools"], ["programs/krep.html", "a program page"]]) {
  const p = await open(name, { nojs: true });
  const r = JSON.parse(await p.eval(`JSON.stringify((function () {
    var sorts = [...document.querySelectorAll("button.sort")], th = [...document.querySelectorAll("th[aria-sort]")];
    return {
      sorts: sorts.length, shown: sorts.filter(function (e) { return getComputedStyle(e).display !== "none"; }).length,
      heads: th.length, plain: th.filter(function (e) { var s = e.querySelector(".th-static"); return s && getComputedStyle(s).display !== "none" && s.textContent.trim(); }).length,
      boxes: document.querySelectorAll(".lgcb").length, boxesShown: [...document.querySelectorAll(".lgcb")].filter(function (e) { return getComputedStyle(e).display !== "none"; }).length,
      keys: [...document.querySelectorAll(".lgrow .keyswatch")].filter(function (e) { return getComputedStyle(e).display !== "none"; }).length,
      groups: document.querySelectorAll("button[data-grp]").length,
      groupsShown: [...document.querySelectorAll("button[data-grp]")].filter(function (e) { return getComputedStyle(e).display !== "none"; }).length,
      groupLabels: [...document.querySelectorAll(".grp-static")].filter(function (e) { return getComputedStyle(e).display !== "none" && e.textContent.trim(); }).length,
      main: document.getElementById("main").classList.contains("no-js")
    };
  })())`));
  ok(`no script (${what}): the page keeps no-js, no sort button, group button or legend checkbox is shown, every sortable column and group row keeps its label`,
    r.main && r.shown === 0 && r.plain === r.heads && r.boxesShown === 0 && (r.boxes === 0 || r.keys >= r.boxes) && r.groupsShown === 0 && r.groupLabels === r.groups, JSON.stringify(r));
  await p.close();
}
{
  const p = await open("compare.html", { nojs: true });
  const r = JSON.parse(await p.eval(`JSON.stringify({ pick: getComputedStyle(document.querySelector(".pick")).display, tables: document.querySelectorAll("#cmp-out table").length, swap: getComputedStyle(document.getElementById("swap")).display })`));
  ok("no script (Compare): the two selects and the swap button are not offered, the default pair is on the page", r.pick === "none" && r.swap === "none" && r.tables >= 3, JSON.stringify(r));
  await p.close();
}
for (const name of ["index.html", "results.html", "tools.html", "compare.html", "programs/krep.html"]) {
  const p = await open(name);
  const r = JSON.parse(await p.eval(`JSON.stringify({ noJs: document.getElementById("main").classList.contains("no-js"),
    sorts: [...document.querySelectorAll("button.sort")].filter(function (e) { return getComputedStyle(e).display === "none"; }).length,
    statics: [...document.querySelectorAll(".th-static")].filter(function (e) { return getComputedStyle(e).display !== "none"; }).length,
    pick: document.querySelector(".pick") ? getComputedStyle(document.querySelector(".pick")).display : "-" })`));
  ok(`with scripts (${name}): the class is gone, the sort buttons and the selects are there and the plain labels are not`, !r.noJs && r.sorts === 0 && r.statics === 0 && r.pick !== "none", JSON.stringify(r));
  await p.close();
}

// ---- accessible names ------------------------------------------------------------------------------------------
{
  const p = await open("results.html");
  await p.cmd("DOM.enable"); await p.cmd("Accessibility.enable");
  const doc = await p.cmd("DOM.getDocument", { depth: 0 });
  const { nodeIds } = await p.cmd("DOM.querySelectorAll", { nodeId: doc.root.nodeId, selector: "#g-main tbody tr th" });
  const names = [];
  for (const nodeId of nodeIds) {
    const { nodes } = await p.cmd("Accessibility.getPartialAXTree", { nodeId, fetchRelatives: false });
    names.push((nodes[0].name && nodes[0].name.value) || "");
  }
  const shown = await p.eval(`[...document.querySelectorAll("#g-main tbody tr th a.pname")].map(function (a) { return a.textContent.trim(); }).join("|")`);
  ok("accessible name: a Results row header is the program name alone", names.length === 18 && names.every((n) => !/[›>]/.test(n)) && names.map((n) => n.trim()).join("|") === shown, names.slice(0, 3).join("|"));
  const chevron = await p.eval(`getComputedStyle(document.querySelector("#g-main tbody tr th a.pname"), "::after").content`);
  ok("accessible name: nothing is drawn after a program name (no chevron, no arrow)", chevron === "none" || chevron === "normal" || chevron === "", chevron);
  await p.close();
}

// ---- skip link ---------------------------------------------------------------------------------------------------
for (const name of pages.filter((x) => x === "404" || x === "index" || x === "tools" || x === "programs/krep")) {
  const p = await open(name + ".html");
  const r = JSON.parse(await p.eval(`JSON.stringify((function () {
    var a = document.querySelector("a.skip"), first = document.querySelector("a[href]");
    return { has: !!a, href: a && a.getAttribute("href"), first: first === a, offscreen: a && a.getBoundingClientRect().bottom < 0 };
  })())`));
  ok(`skip link: ${name} has one, it comes first and is off screen until focused`, r.has && r.href === "#main" && r.first && r.offscreen, JSON.stringify(r));
  await p.close();
}
{
  const p = await open("programs/nope.html");
  const r = JSON.parse(await p.eval(`JSON.stringify({ base: !!document.querySelector("base"), path: location.pathname, tools: document.querySelector('.nav a[href$="tools.html"]').href })`));
  ok("skip link: the page for an unknown address below the root points <base> at the root", r.base && r.tools === base + "tools.html", JSON.stringify(r));
  await p.eval(`document.querySelector("a.skip").focus()`);
  await p.eval(`document.querySelector("a.skip").click()`); await b.sleep(300);
  const after = JSON.parse(await p.eval(`JSON.stringify({ path: location.pathname, hash: location.hash, active: document.activeElement && document.activeElement.id })`));
  ok("skip link: on that page it moves the focus to the content and does not leave the page", after.path.endsWith("/programs/nope.html") && after.active === "main", JSON.stringify(after));
  await p.close();
}

// ---- keyboard ----------------------------------------------------------------------------------------------------
// The site has no keyboard help and no single-key shortcut; the search opens with Ctrl K and the key ? does nothing.
for (const name of ["index.html", "results.html", "tools.html", "programs/krep.html", "compare.html", "method.html", "contribute.html"]) {
  const p = await open(name);
  const none = await p.eval(`!document.querySelector(".foot .kb, main kbd, #kb-help, #kb-toggle, [data-open-help]")`);
  await p.cmd("Input.dispatchKeyEvent", { type: "keyDown", key: "?", text: "?" }); await p.cmd("Input.dispatchKeyEvent", { type: "keyUp", key: "?" }); await b.sleep(150);
  const byKey = await p.eval(`document.querySelectorAll("dialog[open]").length`);
  await p.cmd("Input.dispatchKeyEvent", { type: "keyDown", key: "k", code: "KeyK", windowsVirtualKeyCode: 75, modifiers: 2 }); await p.cmd("Input.dispatchKeyEvent", { type: "keyUp", key: "k", code: "KeyK", windowsVirtualKeyCode: 75, modifiers: 2 }); await b.sleep(200);
  const search = await p.eval(`document.getElementById("pal").open`);
  ok(`keyboard: ${name} has no keyboard help, the key ? opens nothing and Ctrl K opens the search`, none && byKey === 0 && search === true, JSON.stringify({ none, byKey, search }));
  await p.close();
}


// ---- large text, touch targets, forced-colour swatches, focus rings, deep 404, narrow screens -----------------------------------
// Large text: no page overflows sideways at 320 px with the root font at 130, 150 and 200 percent (a visitor's text-size setting; written as the
// font size of <html>, which every rem follows).
for (const name of ["index.html", "results.html", "tools.html", "compare.html", "programs/krep.html"]) {
  const bad = [];
  for (const pct of [130, 150, 200]) {
    const p = await open(name, { w: 320, h: 800, fontPct: pct });
    const over = await p.eval(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
    if (over > 0) bad.push(`${pct}%: ${over}px`);
    await p.close();
  }
  ok(`large text: ${name} does not overflow sideways at 320 px with the root font at 130, 150 and 200 percent`, bad.length === 0, bad.join(" | "));
}
{
  // The group control of Tools wraps (or scrolls with its edge) at 390 px: every option is in view or the frame has the scroll edge.
  const p = await open("tools.html", { w: 390, h: 844 });
  const r = JSON.parse(await p.eval(`JSON.stringify((function () {
    var seg = document.querySelector('[aria-labelledby="lbl-t"]'), sr = seg.getBoundingClientRect(), labels = [...seg.querySelectorAll("label")], out = 0;
    labels.forEach(function (l) { var b = l.getBoundingClientRect(); if (b.right > sr.right + 1 || b.left < sr.left - 1) out++; });
    return { n: labels.length, outside: out, wraps: seg.scrollWidth <= seg.clientWidth + 1, fade: seg.classList.contains("fade-x") };
  })())`));
  ok("controls: at 390 px every option of the Tools group control is visible (it wraps) and the control has the scroll edge for a label that is wider than the line", r.n === 5 && r.outside === 0 && r.wraps && r.fade, JSON.stringify(r));
  await p.close();
}
for (const w of [240, 280]) {
  const bad = [];
  for (const name of ["index.html", "results.html", "tools.html", "compare.html", "programs/krep.html", "method.html", "contribute.html", "404.html"]) {
    const p = await open(name, { w, h: 700 });
    const over = await p.eval(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
    if (over > 0) bad.push(`${name}: ${over}px`);
    await p.close();
  }
  ok(`narrow: no page overflows sideways at ${w} px (the group and unit switches wrap, the foot stacks, the chart tooltip never outgrows the chart)`, bad.length === 0, bad.join(" | "));
}

// Column heads of Results are not clipped with the root font at 200 percent (a head that is wider than its column wraps; none overflows it).
for (const w of [1440, 390]) {
  const p = await open("results.html", { w, h: 900, fontPct: 200 });
  const bad = [];
  for (const g of ["main", "ablation", "control"]) {
    await p.eval(`document.querySelector('input[name=rgroup][value=${g}]').click()`); await b.sleep(200);
    const r = JSON.parse(await p.eval(`JSON.stringify((function () {
      var out = [];
      document.querySelectorAll("#g-${g} thead th.cell").forEach(function (th) {
        var t = th.getBoundingClientRect();
        th.querySelectorAll(".th-top, .th-sub, .th-trk, button.sort").forEach(function (e) {
          var r = e.getBoundingClientRect(); if (!r.width) return;      // the plain twin of the label is not shown
          if (e.scrollWidth > e.clientWidth + 1 || r.right > t.right + 1 || r.left < t.left - 1) out.push(e.textContent.trim().slice(0, 24));
        });
      });
      return out;
    })())`));
    r.forEach((x) => bad.push(g + ": " + x));
  }
  ok(`large text: no column head of Results is clipped at ${w} px with the root font at 200 percent`, bad.length === 0, bad.slice(0, 4).join(" | "));
  await p.close();
}
// More contrast (the system setting): the faint ink takes the next darker step.
{
  const p = await open("results.html");
  await p.cmd("Emulation.setEmulatedMedia", { features: [{ name: "prefers-contrast", value: "more" }] });
  await b.sleep(150);
  const r = JSON.parse(await p.eval(`JSON.stringify({ i2: getComputedStyle(document.documentElement).getPropertyValue("--ink-2").trim(), i3: getComputedStyle(document.documentElement).getPropertyValue("--ink-3").trim(), line: getComputedStyle(document.documentElement).getPropertyValue("--line").trim(), ctl: getComputedStyle(document.documentElement).getPropertyValue("--ctl-line").trim() })`));
  ok("more contrast: --ink-3 takes the value of --ink-2 and the light rules that of the control line", r.i3 === r.i2 && r.line === r.ctl && r.i2 !== "", JSON.stringify(r));
  await p.close();
}

// Touch targets at 390 px under a coarse pointer: nothing a visitor taps is under 24 px, and what the plan lists is at least 40 px.
const TARGETS = `JSON.stringify((function () {
  var sel = 'a[href], button, select, summary, input:not([type=hidden]), [role=tab]', small = [], listed = [];
  document.querySelectorAll(sel).forEach(function (e) {
    var cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden") return;
    if (e.closest("dialog:not([open])") || e.classList.contains("skip") || e.classList.contains("sr")) return;
    var r = e.getBoundingClientRect();
    if (e.tagName === "INPUT" && cs.opacity === "0") { var l = e.closest("label"); if (l) r = l.getBoundingClientRect(); }
    if (!r.width || !r.height || r.left > innerWidth + 400) return;
    var inline = e.tagName === "A" && cs.display === "inline" && e.closest("p, li, dd, dt, td, .sub, .lede, .key-line, .foot") && !e.classList.contains("pname");
    if (inline) return;
    var name = e.tagName.toLowerCase() + "." + String(e.className).split(" ")[0] + ' "' + (e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 20) + '"';
    var m = Math.min(r.width, r.height);
    if (m < 24) small.push(name + " " + Math.round(r.width) + "x" + Math.round(r.height));
    var need = e.matches("button.sort, .grp button, .rowbtn, .terms > summary, .bm-tables > summary, .subbar nav a, .subbar .pn .btn, a.pname, .bm-skip, .subbar select, .pick select, .lgrow, .tool-btn, .tool-x, .reset, .namebox, .strip-pager .btn");
    if (need && m < 39.5) listed.push(name + " " + Math.round(r.width) + "x" + Math.round(r.height));
  });
  return { small: small.slice(0, 8), listed: listed.slice(0, 8) };
})())`;
for (const name of ["index.html", "results.html", "tools.html", "compare.html", "programs/krep.html", "contribute.html"]) {
  const p = await open(name, { w: 390, h: 844, touch: true });
  const r = JSON.parse(await p.eval(TARGETS));
  ok(`touch: ${name} at 390 px has no control under 24 px and the sort buttons, group rows, section links, Terms summaries, row buttons and program names are at least 40 px`,
    r.small.length === 0 && r.listed.length === 0, JSON.stringify(r));
  await p.close();
}
{
  const p = await open("programs/krep.html", { w: 390, h: 844, touch: true });
  const r = JSON.parse(await p.eval(`JSON.stringify({ coarse: matchMedia("(pointer: coarse)").matches, bar: document.querySelectorAll(".topbar kbd").length,
    selects: [...document.querySelectorAll("select")].filter(function (s) { return getComputedStyle(s).display !== "none"; }).map(function (s) { return getComputedStyle(s).fontSize; }) })`));
  ok("touch: the bar has no keyboard hint and every select uses 16 px type", r.coarse && r.bar === 0 && r.selects.length >= 2 && r.selects.every((f) => f === "16px"), JSON.stringify(r));
  await p.close();
}

// Forced colours: the swatches of the branch map's key and of the skyline's key are visible on every program (a border in the text colour, the colour kept).
{
  const bad = [];
  for (const scheme of ["light", "dark"]) for (const name of pages.filter((x) => x.startsWith("programs/"))) {
    const p = await open(name + ".html", { scheme, forced: "active" });
    const r = JSON.parse(await p.eval(`JSON.stringify((function () {
      var d = document.createElement("div"); d.style.cssText = "background-color:Canvas"; document.body.appendChild(d); var canvas = getComputedStyle(d).backgroundColor; d.remove();
      function ok(e) { var s = getComputedStyle(e); return s.borderTopStyle === "solid" && parseFloat(s.borderTopWidth) >= 1 && s.forcedColorAdjust === "none" && s.backgroundColor !== canvas && s.backgroundColor !== "rgba(0, 0, 0, 0)"; }
      var a = [...document.querySelectorAll(".bm-chip-sw")], k = [...document.querySelectorAll(".sky-lg .sw")];
      return { chips: a.length, chipsOk: a.filter(ok).length, sky: k.length, skyOk: k.filter(ok).length };
    })())`));
    if (!(r.chips >= 5 && r.chipsOk === r.chips && r.sky >= 5 && r.skyOk === r.sky)) bad.push(`${scheme} ${name}: ${JSON.stringify(r)}`);
    await p.close();
  }
  ok("forced colours: the swatches of the map key and of the skyline key keep their colour and a border on all 18 programs, light and dark", bad.length === 0, bad.slice(0, 3).join(" | "));
}

// Focus rings: the ring of a bar link is drawn on all four sides (a pixel scan of a screenshot).
{
  const { decodePng, ringSides } = await import("./pixels.mjs");
  const rgbOf = (s) => { const m = /rgba?\((\d+), (\d+), (\d+)/.exec(s); return [+m[1], +m[2], +m[3]]; };
  for (const scheme of ["light", "dark"]) {
    const p = await open("tools.html", { scheme });
    const bad = [];
    for (const sel of ['.nav a[aria-current]', '.nav a[href$="compare.html"]', ".brand"]) {
      await p.eval(`(function(){var e=document.querySelector(${JSON.stringify(sel)}); e.blur(); e.focus({ focusVisible: true });})()`); await b.sleep(150);
      const info = JSON.parse(await p.eval(`(function(){var e=document.querySelector(${JSON.stringify(sel)}), r=e.getBoundingClientRect(), s=getComputedStyle(e); return JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height,oc:s.outlineColor,fv:e.matches(":focus-visible")})})()`));
      const { data } = await p.cmd("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 1440, height: 120, scale: 1 } });
      const sides = ringSides(decodePng(Buffer.from(data, "base64")), { x: info.x, y: info.y, w: info.w, h: info.h }, rgbOf(info.oc));
      if (!info.fv || !Object.values(sides).every((v) => v > 0.8)) bad.push(`${sel}: ${JSON.stringify(sides)}`);
    }
    ok(`focus ring (${scheme}): the ring of the bar links and of the brand shows on the top, bottom, left and right`, bad.length === 0, bad.join(" | "));
    await p.close();
  }
}

// The page for an unknown address: no failing request besides the page itself, at any depth (scripts have it add its style sheet and scripts after <base>).
for (const path of ["nope.html", "programs/nope.html", "programs/a/b/c.html", "assets/x/y.html"]) {
  const p = await b.newPage();
  await p.viewport(1000, 700, 1, false);
  await p.cmd("Network.enable");
  const failed = [];
  p.on("Network.responseReceived", (e) => { if (e.response.status >= 400) failed.push(e.response.status + " " + e.response.url.replace(base, "/")); });
  await p.goto(base + path, 1500);
  const styled = await p.eval(`getComputedStyle(document.querySelector("main")).display === "block" && !!document.querySelector(".topbar") && getComputedStyle(document.querySelector(".topbar")).position !== "static"`);
  ok(`404: ${path} asks for nothing that fails except the page itself, and is styled`, failed.length === 1 && styled, failed.join(" | "));
  await p.close();
}
// Compare without scripts names both tools in words.
{
  const p = await open("compare.html", { nojs: true });
  const t = await p.eval(`document.querySelector(".cmp-key").textContent.replace(/\\s+/g, " ")`);
  ok("no script (Compare): the page says which tool is A and which is B in words", /A: KLEE fixed options, 6 cores/.test(t) && /B: SymTuner, 6 cores/.test(t), t);
  await p.close();
}


// ---- sticky heads, frames, the Terms popover, the range unit, the bar, the matrix on a phone, the edge that says there is more, touch at tablet widths,
// the theme-color, a failed script, the page for an unknown address ----------------------------------------------------------------------------------------------

// The head of the table in an open row of Tools is the head of a table of its own: it never takes the offset of the head that sticks to the window around it, and the first
// link of its first row is not covered by it.
for (const w of [1280, 1440, 1920]) {
  const p = await open("tools.html", { w, h: 900 });
  const r = JSON.parse(await p.eval(`JSON.stringify((function () {
    document.querySelectorAll(".rowbtn").forEach(function (b) { b.click(); });
    var bad = 0, covered = 0, n = 0;
    document.querySelectorAll("tr.detail .tbl").forEach(function (t) {
      n++;
      if (t.querySelector("thead th").getBoundingClientRect().top - t.getBoundingClientRect().top > 1) bad++;
      var a = t.querySelector("tbody tr a"); a.scrollIntoView({ block: "center" });
      var r = a.getBoundingClientRect(), el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!(el === a || a.contains(el))) covered++;
    });
    return { n: n, bad: bad, covered: covered };
  })())`));
  ok(`sticky head: at ${w} px the head of the table in each of the ${r.n} open rows of Tools sits on its own table, and the first link of its first row is not covered`, r.n === 28 && r.bad === 0 && r.covered === 0, JSON.stringify(r));
  await p.close();
}
// The second row of the head of Results (the tool names) sticks right under the family bands, at 1440 px under the bar, and at 1024 px inside the frame.
{
  const p = await open("results.html", { w: 1440, h: 900 });
  const r = await p.eval(`(function () {
    window.scrollTo(0, document.querySelector("#g-main .tbl-wrap").getBoundingClientRect().top + scrollY + 400);      // 400 px into the table, which is below the strip
    return new Promise(function (res) { setTimeout(function () {
      var band = document.querySelector("#g-main thead th.band"), tool = document.querySelector("#g-main thead tr + tr th"), b = band.getBoundingClientRect(), t = tool.getBoundingClientRect();
      var bar = document.querySelector(".topbar").getBoundingClientRect(), eb = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      res({ bandTop: Math.round(b.top), bar: Math.round(bar.bottom), toolTop: Math.round(t.top), bandH: Math.round(b.height), bandOnTop: eb === band || band.contains(eb), pad: getComputedStyle(document.documentElement).scrollPaddingTop, barH: Math.round(bar.bottom), headH: document.querySelector("#g-main thead").offsetHeight });
    }, 200); });
  })()`);
  ok("sticky head: scrolled at 1440 px the family bands stay in view under the bar and the tool names stick right under them (a focused row also stays clear of both)",
    Math.abs(r.bandTop - r.bar) <= 1 && Math.abs(r.toolTop - (r.bandTop + r.bandH)) <= 1 && r.bandOnTop && parseFloat(r.pad) >= r.barH + r.headH, JSON.stringify(r));
  await p.close();
  const q = await open("results.html", { w: 1024, h: 700 });
  const r2 = await q.eval(`(function () {
    var fr = document.querySelector("#g-main .tbl-wrap"); fr.scrollTop = 400;
    return new Promise(function (res) { setTimeout(function () {
      var band = document.querySelector("#g-main thead th.band"), tool = document.querySelector("#g-main thead tr + tr th"), f = fr.getBoundingClientRect(), b = band.getBoundingClientRect(), t = tool.getBoundingClientRect();
      res({ frameTop: Math.round(f.top), bandTop: Math.round(b.top), toolTop: Math.round(t.top), bandH: Math.round(b.height) });
    }, 200); });
  })()`);
  ok("sticky head: at 1024 px the bands stick at the top of the frame and the tool names under them", Math.abs(r2.bandTop - r2.frameTop) <= 3 && Math.abs(r2.toolTop - (r2.bandTop + r2.bandH)) <= 1, JSON.stringify(r2));
  await q.close();
}
// No script, a short window, record layout: no frame that scrolls inside the page.
{
  const p = await open("tools.html", { w: 390, h: 844, nojs: true });
  const r = JSON.parse(await p.eval(`JSON.stringify((function () { var f = document.getElementById("tools-wrap"); return { max: getComputedStyle(f).maxHeight, inner: f.scrollHeight - f.clientHeight, page: document.documentElement.scrollHeight, frame: f.scrollHeight }; })())`));
  ok("no script (Tools, 390 px): the frame has no maximum height, so the whole table scrolls with the page and the last row is reached by the page", r.max === "none" && r.inner <= 1 && r.page >= r.frame && r.page <= r.frame * 1.05, JSON.stringify(r));
  await p.close();
  const q = await open("tools.html", { w: 390, h: 844 });
  const r2 = JSON.parse(await q.eval(`JSON.stringify((function () { var f = document.getElementById("tools-wrap"); return { max: getComputedStyle(f).maxHeight, inner: f.scrollHeight - f.clientHeight }; })())`));
  ok("record layout (Tools, 390 px): the list of records has no frame of its own that scrolls up and down", r2.max === "none" && r2.inner <= 1, JSON.stringify(r2));
  await q.close();
}
for (const [w, h] of [[320, 256], [568, 320], [844, 390]]) {
  const p = await open("results.html", { w, h });
  const r = JSON.parse(await p.eval(`JSON.stringify((function () {
    var links = [...document.querySelectorAll("#g-main tbody th a.pname")], covered = [];
    links.forEach(function (a) { a.focus(); var r = a.getBoundingClientRect(), el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); if (!(el === a || a.contains(el))) covered.push(a.textContent); });
    return { n: links.length, covered: covered };
  })())`));
  ok(`focus not obscured: at ${w} by ${h} px every one of the 18 program links of Results is the element at its own place when it has the focus`, r.n === 18 && r.covered.length === 0, JSON.stringify(r));
  if (w === 844) {
    const q = JSON.parse(await p.eval(`JSON.stringify((function () {
      var fr = document.querySelector("#g-main .tbl-wrap"); window.scrollTo(0, fr.getBoundingClientRect().top + scrollY);
      var rows = [...document.querySelectorAll("#g-main tbody tr")].filter(function (tr) { var r = tr.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }).length;
      return { rows: rows, headSticks: getComputedStyle(document.querySelector("#g-main thead th")).top };
    })())`));
    ok("short window: with the table at the top of a window 390 px high (a phone held sideways) 5 or more rows of Results are in view, because the head scrolls away", q.rows >= 5 && q.headSticks === "auto", JSON.stringify(q));
  }
  await p.close();
}

// The Terms popover stays inside the window and inside the text column of the page, at every width from 360 to 1400 px, and at 390 px it ends inside the window.
for (const name of ["results.html", "tools.html", "compare.html", "programs/krep.html"]) {
  const p = await open(name, { w: 1400, h: 900 });
  const bad = [];
  for (let w = 360; w <= 1400; w += 20) {
    await p.viewport(w, 900, 1, w < 700); await b.sleep(50);
    const r = await p.eval(`(function () {
      var d = document.querySelector("#terms"); d.open = false; d.open = true;
      return new Promise(function (res) { setTimeout(function () {
        var dl = d.querySelector(".terms-dl").getBoundingClientRect(), m = document.getElementById("main"), mr = m.getBoundingClientRect(), pad = parseFloat(getComputedStyle(m).paddingLeft);
        res({ left: Math.round(dl.left), right: Math.round(dl.right), iw: innerWidth, ml: Math.round(mr.left + pad), mr: Math.round(mr.right - pad), over: document.documentElement.scrollWidth - document.documentElement.clientWidth });
        d.open = false;
      }, 100); });
    })()`);
    if (r.left < 0 || r.right > r.iw || r.left < r.ml - 1 || r.right > r.mr + 1 || r.over > 0) bad.push(w + ": " + JSON.stringify(r));
  }
  ok(`Terms: on ${name} the popover is inside the window and the text column at 360 to 1400 px in steps of 20, and the page does not overflow`, bad.length === 0, bad.slice(0, 3).join(" | "));
  await p.close();
}
{
  const p = await open("results.html", { w: 390, h: 844, touch: true });
  const r = await p.eval(`(function () {
    var d = document.querySelector("#terms"); d.querySelector("summary").click();
    return new Promise(function (res) { setTimeout(function () {
      var dl = d.querySelector(".terms-dl").getBoundingClientRect(); res({ bottom: Math.round(dl.bottom), ih: innerHeight, top: Math.round(dl.top) });
      document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    }, 300); });
  })()`);
  ok("Terms: on a phone (390 by 844) the open popover ends inside the window", r.bottom <= r.ih && r.top >= 0, JSON.stringify(r));
  ok("Terms: a press on the page outside it closes it (a tap on a part that is not a control may send no click on iOS)", await p.eval(`!document.querySelector("#terms").open`));
  await p.close();
  const q = await open("results.html", { w: 1440, h: 900 });
  const r2 = await q.eval(`(function () {
    var d = document.querySelector("#terms"); d.open = true;
    return new Promise(function (res) { setTimeout(function () { var dl = d.querySelector(".terms-dl").getBoundingClientRect(), m = document.getElementById("main").getBoundingClientRect(); res({ right: Math.round(dl.right), column: Math.round(m.right - 24) }); }, 150); });
  })()`);
  ok("Terms: on Results at 1440 px the popover does not pass the right edge of the text column", r2.right <= r2.column + 1, JSON.stringify(r2));
  await q.close();
}

// The range unit: no group and unit of Results is wider than the window at 1280, 1440 and 1920 px, and a table that is wider than its frame scrolls inside the frame.
for (const w of [1280, 1440, 1920]) {
  const p = await open("results.html", { w, h: 900 });
  const bad = [];
  for (const g of ["main", "ablation", "seeding", "control"]) for (const u of ["pct", "n", "spread"]) {
    await p.eval(`document.querySelector('input[name=rgroup][value=${g}]').click(); document.querySelector('input[name=unit][value=${u}]').click();`); await b.sleep(100);
    const over = await p.eval(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
    if (over !== 0) bad.push(`${g}/${u}: ${over}px`);
  }
  ok(`range unit: at ${w} px no group of Results is wider than the window in percent, count or median with range`, bad.length === 0, bad.join(" | "));
  await p.eval(`document.querySelector('input[name=rgroup][value=main]').click(); document.querySelector('input[name=unit][value=pct]').click(); document.querySelector("#g-main .tbl").style.minWidth = "1600px";`); await b.sleep(400);
  const r = JSON.parse(await p.eval(`JSON.stringify({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth, wide: document.querySelector("#g-main .tbl-wrap").classList.contains("is-wide"), overflowX: getComputedStyle(document.querySelector("#g-main .tbl-wrap")).overflowX })`));
  ok(`range unit: at ${w} px a table forced to 1,600 px scrolls inside its frame and the page does not scroll sideways`, r.over === 0 && r.wide && r.overflowX === "auto", JSON.stringify(r));
  await p.close();
}

// The bar on a phone: the brand and the search share one row and the five links another, from 320 to 390 px.
{
  const bad = [];
  for (const w of [320, 340, 360, 375, 390]) {
    const p = await open("results.html", { w, h: 800 });
    const r = JSON.parse(await p.eval(`JSON.stringify({ bar: Math.round(document.querySelector(".topbar").getBoundingClientRect().height), navRows: new Set([...document.querySelectorAll(".nav a")].map(function (a) { return Math.round(a.getBoundingClientRect().top); })).size,
      over: document.documentElement.scrollWidth - document.documentElement.clientWidth })`));
    r.sites = await p.eval(`(function () { var s = document.querySelector(".sites a").getBoundingClientRect(), n = document.querySelector(".nav a").getBoundingClientRect(), b = document.querySelector(".brand").getBoundingClientRect(); return s.bottom <= n.top && Math.abs((s.top + s.bottom) / 2 - (b.top + b.bottom) / 2) < 12 && s.right <= innerWidth; })()`);      // the link to the other site stands beside the brand, above the pages
    if (r.bar > 110 || r.navRows !== 1 || r.over > 0 || !r.sites) bad.push(`${w}: ${JSON.stringify(r)}`);
    await p.close();
  }
  ok("top bar: at 320 to 390 px it is 110 px high or less, with the five links on one row and the link to the other site beside the name", bad.length === 0, bad.join(" | "));
}

// The first column of Results on a phone is narrow, so that 2.5 or more tool columns show beside it, and a focused head is not under it; a frame that scrolls sideways has its edge, over the head too.
{
  const p = await open("results.html", { w: 390, h: 844, touch: true });
  const r = await p.eval(`(function () {
    var fr = document.querySelector("#g-main .tbl-wrap").getBoundingClientRect(), st = document.querySelector("#g-main thead th.sticky").getBoundingClientRect();
    var cols = [...document.querySelectorAll("#g-main thead tr + tr th.cell")].map(function (th) { var r = th.getBoundingClientRect(); return Math.max(0, Math.min(r.right, fr.right) - Math.max(r.left, st.right)) / r.width; });
    var btns = [...document.querySelectorAll("#g-main thead tr + tr th.cell button.sort")], btn = btns[5]; btn.focus();
    return new Promise(function (res) { setTimeout(function () {
      var rr = btn.getBoundingClientRect(), s2 = document.querySelector("#g-main thead th.sticky").getBoundingClientRect(), f2 = document.querySelector("#g-main .tbl-wrap").getBoundingClientRect();
      res({ sticky: Math.round(st.width), visible: Math.round(cols.reduce(function (a, c) { return a + c; }, 0) * 100) / 100, focusedClear: rr.left >= s2.right - 0.5 && rr.right <= f2.right + 0.5 });
    }, 300); });
  })()`);
  ok("phone matrix: at 390 px the first column of Results is under 130 px, 2.5 or more tool columns show beside it, and a focused sort button is clear of it", r.sticky < 130 && r.visible >= 2.5 && r.focusedClear, JSON.stringify(r));
  await p.close();
  const bad = [];
  for (const [name, w] of [["results.html", 768], ["results.html", 1024], ["tools.html", 768], ["tools.html", 1024]]) {
    const q = await open(name, { w, h: 900 });
    const c = await q.eval(`(function () { var c = document.querySelector(".tbl-cue"), fr = c.firstElementChild; return { scrolls: fr.scrollWidth > fr.clientWidth, more: c.getAttribute("data-more"), after: getComputedStyle(c, "::after").opacity }; })()`);
    if (!(c.scrolls && /r/.test(c.more || "") && c.after === "1")) bad.push(`${name} ${w}: ${JSON.stringify(c)}`);
    await q.close();
  }
  ok("scroll edge: at 768 and 1024 px the frames of Results and Tools that scroll sideways show the edge on the side that has more", bad.length === 0, bad.join(" | "));
}

// Touch at tablet widths (768 and 1024 px): the selects, the legend rows, the rows of the search and the link past the map are 40 px; nothing a visitor taps is under 24 px.
for (const w of [768, 1024]) {
  const p = await open("programs/krep.html", { w, h: 900, touch: true });
  const r = JSON.parse(await p.eval(`JSON.stringify((function () {
    function m(sel) { var e = [...document.querySelectorAll(sel)].filter(function (x) { return x.offsetParent; }); return e.length ? Math.min.apply(null, e.map(function (x) { var r = x.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height)); })) : null; }
    return { select: m(".subbar select"), legend: m(".lgrow:not(.na)") };
  })())`));
  await p.eval(`document.querySelector("[data-open-palette]").click()`); await b.sleep(300);
  const rows = await p.eval(`Math.min.apply(null, [...document.querySelectorAll(".pal li.i a")].map(function (a) { return Math.round(a.getBoundingClientRect().height); }))`);
  ok(`touch at ${w} px: the program list, the legend rows and the rows of the search are 40 px or more`, r.select >= 40 && r.legend >= 40 && rows >= 40, JSON.stringify({ ...r, rows }));
  await p.close();
}
{
  const p = await open("programs/krep.html", { w: 390, h: 844, touch: true });
  const r = await p.eval(`(function () { var e = document.querySelector(".bm-skip"), r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })()`);
  ok("touch: the link past the map, which a phone shows, is 40 px high", r.h >= 40 && r.w >= 40, JSON.stringify(r));
  await p.close();
}

// The theme follows the system: the theme-color of the page is the light colour in the light scheme and the dark one in the dark scheme.
{
  const eff = (p) => p.eval(`(function () { var ms = [...document.querySelectorAll('meta[name="theme-color"]')], hit = ms.find(function (m) { return !m.media || matchMedia(m.media).matches; }); return hit && hit.content; })()`);
  const p = await open("results.html", { w: 1440, h: 900, scheme: "light" });
  const light = await eff(p);
  await p.close();
  const q = await open("results.html", { w: 1440, h: 900, scheme: "dark" });
  const dark = await eff(q);
  const bg = await q.eval(`getComputedStyle(document.body).backgroundColor`);
  await q.close();
  ok("theme-color: the browser's frame takes the light colour in the light scheme and the dark one in the dark scheme, and the page is dark in the dark scheme", light === "#ffffff" && dark === "#0e1625" && bg === "rgb(14, 22, 37)", JSON.stringify({ light, dark, bg }));
}

// Forced colours: the count in a chosen chip and the bars of Compare are drawn in system colours; names: the Programs links of Tools say what the number counts.
{
  const p = await open("programs/krep.html", { w: 1440, h: 900, forced: "active" });
  const r = JSON.parse(await p.eval(`JSON.stringify((function () { var c = document.querySelector('.chip[aria-pressed="true"]'), s = c.querySelector("small"); return { chip: getComputedStyle(c).color, small: getComputedStyle(s).color }; })())`));
  ok("forced colours: the count inside a chosen chip has the colour of the chip's text", r.chip === r.small, JSON.stringify(r));
  await p.close();
  const q = await open("compare.html", { w: 1440, h: 900, forced: "active" });
  const c = JSON.parse(await q.eval(`JSON.stringify((function () {
    var d = document.createElement("div"); d.style.cssText = "background-color:Canvas"; document.body.appendChild(d); var canvas = getComputedStyle(d).backgroundColor; d.remove();
    function bg(sel) { var e = document.querySelector(sel); return e ? getComputedStyle(e).backgroundColor : null; }
    return { canvas: canvas, a: bg(".a-fill"), b: bg(".b-fill"), swA: bg(".ab.a"), swB: bg(".ab.b") };
  })())`));
  ok("forced colours: the bars and swatches of Compare are not drawn in the page colour, and A and B differ", [c.a, c.b, c.swA, c.swB].every((x) => x && x !== c.canvas) && c.a !== c.b, JSON.stringify(c));
  await q.close();
  const t = await open("tools.html");
  const info = JSON.parse(await t.eval(`JSON.stringify({ links: [...document.querySelectorAll("a.plink")].map(function (a) { return [a.textContent.trim(), a.getAttribute("aria-label")]; }), rows: document.querySelectorAll("tr.trow").length })`));
  const names = info.links;
  ok("names: every Programs link of Tools says what its number counts, and the name starts with the number on screen", names.length === info.rows && names.every(([n, l]) => l && l.startsWith(n + " program")), JSON.stringify(names.slice(0, 2)));
  await t.close();
}

// A script that does not load does not blank the rest of a program page: without the chart script the map still draws and the plate of the chart says so.
{
  const p = await b.newPage();
  await p.viewport(1440, 900, 1, false);
  await p.cmd("Network.enable");
  await p.cmd("Network.setBlockedURLs", { urls: ["*/charts.*.js"] });
  await p.goto(base + "programs/krep.html", 1800);
  const r = JSON.parse(await p.eval(`JSON.stringify({ map: !!document.querySelector("#mapbox canvas"), note: document.getElementById("chart").textContent.trim(), tab: (document.getElementById("panel-table").textContent || "").trim() })`));
  ok("one failed script: with the chart script blocked the branch map still draws and the plate of the chart says it did not load", r.map && /^The chart did not load\. Reload the page\.$/.test(r.note), JSON.stringify(r));
  await p.cmd("Network.setBlockedURLs", { urls: ["*/app.*.js"] });
  await p.goto(base + "programs/krep.html", 1800);
  const r2 = JSON.parse(await p.eval(`JSON.stringify({ map: !!document.querySelector("#mapbox canvas"), chart: !!document.querySelector("#chart svg") })`));
  ok("one failed script: with the shared script blocked the chart and the map still draw", r2.map && r2.chart, JSON.stringify(r2));
  await p.close();
}

// The page for an unknown address at depths that the site's own folders do not give: it is styled, asks for nothing that fails but the page itself, and holds no control that needs a
// script. With base_url in site.json (a build of its own) it is an ordinary page at any depth: links, scripts and icons resolve.
for (const path of ["a/b/c/nosuch.html", "program/gzip.html", "results/index.html"]) {
  const p = await b.newPage();
  await p.viewport(390, 800, 1, true);
  await p.cmd("Network.enable");
  const failed = [];
  p.on("Network.responseReceived", (e) => { if (e.response.status >= 400) failed.push(e.response.status + " " + e.response.url.replace(base, "/")); });
  await p.goto(base + path, 1500);
  const r = JSON.parse(await p.eval(`JSON.stringify({ styled: getComputedStyle(document.querySelector(".topbar")).display !== "inline" && getComputedStyle(document.body).display === "flex", h1: Math.round(parseFloat(getComputedStyle(document.querySelector(".page-head h1")).fontSize)), mark: document.querySelectorAll(".mark-lg").length, search: getComputedStyle(document.querySelector(".btn-search")).display })`));
  ok(`404 at an unknown depth: ${path} is styled (its heading is set in the page's title size, with no mark above it), no script-only control is shown and nothing fails but the page itself`, failed.length === 1 && r.styled && r.h1 >= 30 && r.mark === 0 && r.search === "none", failed.join(" | ") + " " + JSON.stringify(r));
  await p.close();
}
{
  // The site as configured in site.json (base_url /, as GitHub Pages serves a site on its own domain) is built with build.py and served under
  // that prefix only; a missing address below it gets 404.html with status 404. The page for an unknown address must be an ordinary page at any depth: styled, with a <base>
  // at the root, a Tools link that resolves to the root's tools.html, a working search, and nothing failing but the page itself.
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const tmp = mkdtempSync(join(tmpdir(), "cr-base-"));
  const PREFIX = "/";
  let built = true, why = "";
  try { execFileSync(process.env.PYTHON || "python3", [join(root, "build.py"), "--config", join(root, "site.json"), "--out", join(tmp, "dist")], { stdio: "pipe" }); } catch (e) { built = false; why = String(e.stderr || e.message).slice(0, 300); }
  ok("404 with base_url: the configured site builds (set PYTHON to Python 3.12 or later)", built, why);
  if (built) {
    const bdist = join(tmp, "dist");
    const srv = createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (!p.startsWith(PREFIX)) { res.writeHead(404); res.end("not this project"); return; }
      p = p.slice(PREFIX.length - 1); if (p.endsWith("/")) p += "results.html";
      let f = join(bdist, p), status = 200;
      // Pages is case-sensitive, as a Mac's file system is not: every part of the path must be spelled as the folder lists it
      let cur = bdist, spelled = f.startsWith(bdist);
      for (const part of p.split("/").filter(Boolean)) { if (!spelled) break; try { spelled = readdirSync(cur).includes(part); } catch { spelled = false; } cur = join(cur, part); }
      if (!spelled || !existsSync(f) || !statSync(f).isFile()) { status = 404; f = /\.(css|js|json|svg|png|woff2)$/.test(p) ? "" : join(bdist, "404.html"); if (!f) { res.writeHead(404); res.end("nf"); return; } }
      res.writeHead(status, { "content-type": TYPES[extname(f)] || "application/octet-stream" }); res.end(readFileSync(f));
    });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    const origin = `http://127.0.0.1:${srv.address().port}`, bb = origin + PREFIX;
    for (const path of ["a/b/nosuch.html", "a/b/c/d/nosuch.html", "Programs/gzip.html", "tools/", "x/programs/y.html", "nosuch.html", "nosuch"]) {
      for (const w of [1440, 390]) {
        const p = await b.newPage();
        await p.viewport(w, 800, 1, w < 700);
        await p.cmd("Network.enable");
        const failed = [];
        p.on("Network.responseReceived", (e) => { if (e.response.status >= 400) failed.push(e.response.status + " " + e.response.url.replace(origin, "")); });
        await p.goto(bb + path, 1500);
        const r = JSON.parse(await p.eval(`JSON.stringify({ base: document.querySelector("base") && document.querySelector("base").href, tools: document.querySelector('.nav a[href$="tools.html"]').href, results: document.querySelector('.nav a[href$="results.html"]').href,
          search: getComputedStyle(document.querySelector(".btn-search")).display, h1: Math.round(parseFloat(getComputedStyle(document.querySelector(".page-head h1")).fontSize)), mark: document.querySelectorAll(".mark-lg").length, over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          styled: getComputedStyle(document.querySelector(".topbar")).display !== "inline" && getComputedStyle(document.body).display === "flex" })`));
        ok(`404 with base_url: ${path} at ${w} px has its base at the root, its Tools link on ${PREFIX}tools.html, the search, a style sheet, no overflow, and fails nothing but the page itself`,
          failed.length === 1 && r.base === bb && r.tools === bb + "tools.html" && r.results === bb + "results.html" && r.search !== "none" && r.h1 >= 30 && r.mark === 0 && r.over <= 0 && r.styled && p.logs.length === 0,
          failed.join(" | ") + " " + JSON.stringify(r) + " " + p.logs.join(" | "));
        await p.close();
      }
    }
    srv.close();
  }
}

// ---- scrolling boxes, the legend, Compare, the branch map card, chips, focus rings, text spacing and the page for an unknown address ---------------------------------------------------------------------------------------------------------------------------
// A box that scrolls is a tab stop only while it scrolls: on every page, at 1440 and 390 px, a frame, the legend or an open Terms list that does not scroll has
// no tabindex, and one that scrolls has it (and a frame its role and name).
for (const [name, w] of [["results.html", 1440], ["results.html", 390], ["tools.html", 1440], ["tools.html", 390], ["compare.html", 1440], ["compare.html", 390], ["programs/krep.html", 1440], ["programs/krep.html", 390], ["programs/xorriso.html", 390], ["contribute.html", 390]]) {
  const p = await open(name, { w, h: 900 });
  await b.sleep(300);
  const r = JSON.parse(await p.eval(`JSON.stringify((function () {
    var bad = [], n = 0, stops = 0;
    document.querySelectorAll(".tbl-wrap, #legend").forEach(function (el) {
      if (!el.offsetWidth && !el.offsetHeight) return;
      n++;
      var scrolls = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1, has = el.getAttribute("tabindex") === "0";
      if (has) stops++;
      if (scrolls !== has) bad.push((el.id || el.getAttribute("aria-label") || el.className).slice(0, 40) + " scrolls=" + scrolls + " tabindex=" + has);
      if (has && el.getAttribute("role") !== "region") bad.push("no role on " + (el.getAttribute("aria-label") || el.id));
      if (!has && el.getAttribute("role") === "region") bad.push("role on a box that does not scroll: " + (el.getAttribute("aria-label") || el.id));
    });
    return { n: n, stops: stops, bad: bad };
  })())`));
  ok(`scrollers: ${name} at ${w} px keeps the tab stop of a table frame or the legend only while it scrolls (${r.stops} of ${r.n})`, r.n > 0 && r.bad.length === 0, r.bad.slice(0, 3).join(" | "));
  await p.close();
}
for (const [w, scheme] of [[1440, "light"], [390, "dark"]]) {
  const p = await open("results.html", { w, h: 800, scheme });
  await p.eval(`document.querySelector("details.terms > summary").click()`); await b.sleep(400);
  const r = JSON.parse(await p.eval(`JSON.stringify((function () {
    var dl = document.querySelector(".terms-dl"); return { scrolls: dl.scrollHeight > dl.clientHeight + 1, tab: dl.getAttribute("tabindex"), label: dl.getAttribute("aria-label"), links: dl.querySelectorAll("a").length };
  })())`));
  ok(`Terms: the open list on Results at ${w} px (${r.links} links) is a named tab stop exactly when it scrolls`, r.scrolls ? r.tab === "0" && r.label === "Terms" : r.tab === null, JSON.stringify(r));
  await p.close();
}
{
  // the longest legend (WOFF2, 12 rows) fits its box at 1024, 1100 and 1440 px
  const bad = [];
  for (const w of [1024, 1100, 1440]) {
    const p = await open("programs/woff2.html", { w, h: 900 });
    await b.sleep(400);
    const r = JSON.parse(await p.eval(`JSON.stringify((function () { var l = document.getElementById("legend"); return { sh: l.scrollHeight, ch: l.clientHeight, tab: l.getAttribute("tabindex") }; })())`));
    if (r.sh > r.ch + 1 || r.tab !== null) bad.push(w + ": " + JSON.stringify(r));
    await p.close();
  }
  ok("legend: the 12 rows of WOFF2 fit the box at 1024, 1100 and 1440 px, with no scroll and no tab stop", bad.length === 0, bad.join(" | "));
}
{
  // the chart tooltip stays inside the page at 320, 360 and 390 px (WOFF2 and gawk)
  const bad = [];
  for (const name of ["woff2", "gawk"]) for (const w of [320, 360, 390]) {
    const p = await open(`programs/${name}.html`, { w, h: 800 });
    await b.sleep(500);
    await p.eval(`document.getElementById("chart").scrollIntoView({ block: "center" })`); await b.sleep(200);
    const box = JSON.parse(await p.eval(`JSON.stringify((function () { var r = document.querySelector("#chart .ov").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })())`));
    await p.click(box.x, box.y); await b.sleep(300);
    const r = JSON.parse(await p.eval(`JSON.stringify((function () { var t = document.querySelector("#chart .tip"), r = t.getBoundingClientRect(); return { on: t.classList.contains("on"), right: Math.round(r.right), left: Math.round(r.left), over: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })())`));
    if (!r.on || r.over > 0 || r.right > w || r.left < 0) bad.push(`${name} ${w}: ${JSON.stringify(r)}`);
    await p.close();
  }
  ok("tooltip: the chart tooltip is open and inside the window, with no sideways scroll, at 320, 360 and 390 px", bad.length === 0, bad.join(" | "));
}
{
  // Compare, Resources, with the longest pair of names: A and B are both in the frame, side by side, with no sideways scroll, from 720 px
  const bad = [];
  for (const w of [720, 768, 820, 1024, 1100]) {
    const p = await open("compare.html#agolic-klee-gpt55-harness-entry-only_vs_symtuner-6w-rerun-seeded-tests-only", { w, h: 900 });
    await b.sleep(500);
    const r = JSON.parse(await p.eval(`JSON.stringify((function () {
      var wr = document.querySelector("#resources .tbl-wrap"), f = wr.getBoundingClientRect(), cells = [...document.querySelectorAll('#resources td[data-label]')], out = 0;
      cells.forEach(function (c) { var k = c.getBoundingClientRect(); if (k.left < f.left - 1 || k.right > f.right + 1) out++; });
      return { sw: wr.scrollWidth, cw: wr.clientWidth, cells: cells.length, rows: document.querySelectorAll("#resources tbody tr").length, outside: out, a: document.getElementById("cmp-out").getAttribute("data-a") };
    })())`));
    if (r.sw > r.cw + 1 || r.outside || r.rows < 1 || r.cells < 2 * r.rows || r.a !== "agolic-klee-gpt55-harness-entry-only") bad.push(w + ": " + JSON.stringify(r));      // two values (A and B) in each row of the table
    await p.close();
  }
  ok("compare: with a long pair of tools the values of A and B are side by side in the Resources table from 720 to 1100 px, with no sideways scroll", bad.length === 0, bad.join(" | "));
}
{
  // Final coverage fits its frame from 720 px (the range and the small curve leave between 720 and 1023 px)
  const bad = [];
  for (const w of [720, 768, 820, 900, 959, 960, 1023, 1024, 1100]) {
    const p = await open("programs/gawk.html", { w, h: 900 });
    await b.sleep(400);
    const r = JSON.parse(await p.eval(`JSON.stringify((function () {
      var wr = document.querySelector("#final .tbl-wrap"), t = wr.querySelector("table"), first = t.querySelector("tbody tr:not(.grp) th").getBoundingClientRect(), row = t.querySelector("tbody tr:not(.grp)").getBoundingClientRect();
      return { sw: wr.scrollWidth, cw: wr.clientWidth, name: Math.round(first.width), rowh: Math.round(row.height) };
    })())`));
    if (r.sw > r.cw + 1 || r.name < 150 || r.rowh > 100) bad.push(w + ": " + JSON.stringify(r));
    await p.close();
  }
  ok("final coverage: at 720 to 1100 px the table fits its frame, the tool name has 150 px or more and a row is under 100 px high", bad.length === 0, bad.join(" | "));
}
{
  // the names of the files under the skyline are shown only where they are 12 px or more
  const bad = [];
  for (const [w, shown] of [[768, false], [1024, false], [1100, true], [1280, true]]) {
    const p = await open("programs/xorriso.html", { w, h: 900 });
    await b.sleep(300);
    const r = JSON.parse(await p.eval(`JSON.stringify((function () {
      var tx = document.querySelector(".sky-svg text"), svg = document.querySelector(".sky-svg"), scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
      return { display: getComputedStyle(tx).display, px: 11 * scale };
    })())`));
    if ((r.display !== "none") !== shown || (shown && r.px < 11.9)) bad.push(w + ": " + JSON.stringify(r));
    await p.close();
  }
  ok("skyline: the file names under it are hidden below 1100 px and are 12 px or more where they are shown", bad.length === 0, bad.join(" | "));
}
{
  // the card of the branch map has no large blank band under it at 768, 1024 and 1100 px (the reserve is measured per band of widths)
  const bad = [];
  for (const name of ["gawk", "woff2", "bc", "oggenc"]) for (const w of [768, 1024, 1100, 1440]) {
    const p = await open(`programs/${name}.html`, { w, h: 900 });
    await b.sleep(1800);
    const r = JSON.parse(await p.eval(`JSON.stringify((function () {
      var box = document.getElementById("mapbox"), card = box.closest(".card"), cb = card.getBoundingClientRect(), last = 0;
      card.querySelectorAll("*").forEach(function (e) { var r = e.getBoundingClientRect(); if (r.height && r.width && r.bottom <= cb.bottom + 0.5 && e.children.length === 0) last = Math.max(last, r.bottom); });
      return { empty: Math.round(cb.bottom - last), height: Math.round(cb.height) };
    })())`));
    // One reserve for a band of widths cannot follow the steps of the cell size inside the band, so 1024 and 1100 px keep some blank space
    if (r.empty > (w === 1024 || w === 1100 ? 200 : 90)) bad.push(`${name} ${w}: ${JSON.stringify(r)}`);
    await p.close();
  }
  ok("map card: under the last element of the card of the branch map there are at most 90 px of blank space at 768 and 1440 px and 200 px at 1024 and 1100 px", bad.length === 0, bad.join(" | "));
}
{
  // the family chips are one row that scrolls at 360 and 390 px, and the scroll edge (the cue of a table frame) is drawn on the side that has more, and not on the side that has none
  const bad = [];
  for (const name of ["confetti", "woff2"]) for (const w of [360, 390]) {
    const p = await open(`programs/${name}.html`, { w, h: 800 });
    await b.sleep(500);
    const probe = `JSON.stringify((function () {
      var c = document.getElementById("famchips"), cue = c.parentNode, a = getComputedStyle(cue, "::after"), bf = getComputedStyle(cue, "::before");
      return { scrolls: c.scrollWidth > c.clientWidth + 1, cue: cue.classList.contains("tbl-cue"), more: cue.getAttribute("data-more"), right: a.opacity, left: bf.opacity, x: c.scrollLeft };
    })())`;
    const s0 = JSON.parse(await p.eval(probe));
    await p.eval(`(function () { var c = document.getElementById("famchips"); c.scrollLeft = c.scrollWidth; })()`); await b.sleep(300);
    const s1 = JSON.parse(await p.eval(probe));
    if (!(s0.scrolls && s0.cue && s0.more === "r" && s0.right === "1" && s0.left === "0" && s1.more === "l" && s1.right === "0" && s1.left === "1")) bad.push(`${name} ${w}: ${JSON.stringify([s0, s1])}`);
    await p.close();
  }
  ok("chips: the family chips are a row that scrolls at 360 and 390 px, with the scroll edge on the side that has more", bad.length === 0, bad.join(" | "));
}
{
  // the focus ring of the chosen segment is at least 3:1 against its fill, in both schemes
  const bad = [];
  for (const scheme of ["light", "dark"]) {
    const p = await open("results.html", { scheme });
    await p.eval(`(function(){var i=document.querySelector('input[name=unit]:checked'); i.focus({ focusVisible: true }); })()`); await b.sleep(200);
    const r = JSON.parse(await p.eval(`JSON.stringify((function () {
      var i = document.querySelector('input[name=unit]:checked'), s = getComputedStyle(i.nextElementSibling);
      function rgb(x) { var m = /rgba?\\((\\d+), (\\d+), (\\d+)/.exec(x); return [+m[1], +m[2], +m[3]]; }
      function lum(c) { var a = c.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; }
      var o = lum(rgb(s.outlineColor)), f = lum(rgb(s.backgroundColor));
      return { focus: i.matches(":focus-visible"), ring: s.outlineColor, fill: s.backgroundColor, ratio: (Math.max(o, f) + 0.05) / (Math.min(o, f) + 0.05) };
    })())`));
    if (!r.focus || r.ratio < 3) bad.push(scheme + ": " + JSON.stringify(r));
    await p.close();
  }
  ok("focus ring: the ring of the chosen segment is at least 3:1 against its fill in light and dark", bad.length === 0, bad.join(" | "));
}
{
  // with the spacing of WCAG 1.4.12 no column head of Results loses text at 1440 px
  const p = await open("results.html", { w: 1440, h: 900 });
  await p.eval(`(function(){var s=document.createElement("style");s.textContent="*{line-height:1.5!important;letter-spacing:0.12em!important;word-spacing:0.16em!important}p{margin-bottom:2em!important}";document.head.appendChild(s);})()`);
  await b.sleep(400);
  const r = JSON.parse(await p.eval(`JSON.stringify((function () {
    var bad = [];
    document.querySelectorAll("#g-main thead th.cell").forEach(function (th) {
      var t = th.getBoundingClientRect();
      th.querySelectorAll("button.sort, .th-top, .th-sub, .th-trk").forEach(function (e) {
        var r = e.getBoundingClientRect(); if (!r.width) return;
        if (r.right > t.right + 1 || r.left < t.left - 1 || e.scrollWidth > e.clientWidth + 1) bad.push(th.textContent.trim().slice(0, 24) + " " + Math.round(r.right - t.right));
      });
    });
    return bad;
  })())`));
  ok("text spacing: with the spacing of WCAG 1.4.12 no column head of Results is wider than its cell at 1440 px", r.length === 0, r.slice(0, 4).join(" | "));
  await p.close();
}
{
  // the links of the page for an unknown address (the four pages and one for each program) are targets of 24 px or more
  const bad = [], nprog = readdirSync(join(dist, "programs")).filter((f) => f.endsWith(".html")).length;
  for (const w of [1440, 390]) {
    const p = await open("404.html", { w, h: 800 });
    const r = JSON.parse(await p.eval(`JSON.stringify([...document.querySelectorAll(".plain-list a, .link-cols a")].map(function (a) { var r = a.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }))`));
    if (r.length !== 4 + nprog || r.some(([x, y]) => x < 24 || y < 24)) bad.push(w + ": " + JSON.stringify(r));
    await p.close();
  }
  ok("404: the links of the list on the page for an unknown address are targets of 24 px or more at 1440 and 390 px", bad.length === 0, bad.join(" | "));
}
{
  // a program page without scripts has no control that does nothing; the sparklines of Final coverage are hidden from assistive technology, and a group is a row group header
  const p = await open("programs/krep.html", { nojs: true });
  const r = JSON.parse(await p.eval(`JSON.stringify((function () {
    var c = document.getElementById("chart"), n = document.querySelector(".chart-nojs"), h = document.getElementById("chart-help");
    return { role: c.getAttribute("role"), tab: c.getAttribute("tabindex"), now: c.getAttribute("aria-valuenow"), label: c.getAttribute("aria-label"), note: getComputedStyle(n).display, text: n.textContent.trim(), help: getComputedStyle(h).display };
  })())`));
  ok("no script (program): the chart host is not a slider and has no tab stop, and the notice is a visible paragraph", r.role === null && r.tab === null && r.now === null && r.label === null && r.note === "block" && /^The chart needs JavaScript/.test(r.text) && r.help === "none", JSON.stringify(r));
  await p.close();
  const q = await open("programs/krep.html");
  await b.sleep(600);
  const s = JSON.parse(await q.eval(`JSON.stringify((function () {
    var sp = [...document.querySelectorAll("#final .spark")], g = [...document.querySelectorAll("#final tr.grp > *")];
    return { sparks: sp.length, hidden: sp.filter(function (x) { return x.getAttribute("aria-hidden") === "true" && !x.getAttribute("aria-label"); }).length, groups: g.length, headers: g.filter(function (x) { return x.tagName === "TH" && x.getAttribute("scope") === "rowgroup"; }).length,
      slider: document.getElementById("chart").getAttribute("role"), tab: document.getElementById("chart").getAttribute("tabindex"), max: document.getElementById("chart").getAttribute("aria-valuemax") };
  })())`));
  ok("program: the sparklines of Final coverage are hidden from assistive technology, the group rows are row group headers, and the drawn chart is a slider", s.sparks >= 12 && s.hidden === s.sparks && s.groups >= 2 && s.headers === s.groups && s.slider === "slider" && s.tab === "0" && Number(s.max) > 0, JSON.stringify(s));
  await q.close();
}

await b.close();
server.close();
console.log(failed ? `${failed} checks failed` : "all checks passed");
process.exit(failed ? 1 : 0);
