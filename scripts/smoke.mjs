// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The Agent Software Testing authors
// The browser smoke test: what a visitor does, in headless Chrome against a built site served over loopback. Ten checks, about a minute.
//   node scripts/smoke.mjs [--dist dist] [--port 9500] [--limit 240]
// Every page loads without a script error or a failed request; the theme switch changes the colours and is remembered; Results sorts by name and by number; Compare
// shows another pair and swaps; Ctrl+K finds a program and goes to it; the branch map of a program page is drawn; the front page map finishes drawing (and is whole at
// once under reduced motion); with scripts off the tables are there and no dead control is offered; no page is wider than a phone.
// Prints PASS or FAIL per check; exit status 1 on a failure. The whole run stops itself after --limit seconds.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { launch } from "./cdp.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const arg = (name, dflt) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : dflt; };
const dist = resolve(root, arg("dist", "dist"));
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
const missing = [];      // every address the browser asked for and the site could not give
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let f = join(dist, p === "/" ? "index.html" : p);
  if (!f.startsWith(dist) || !existsSync(f) || !statSync(f).isFile()) { missing.push(p); res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;
let b = null, failed = 0;
const done = (code) => { try { server.close(); } catch {} Promise.resolve(b && b.close()).finally(() => process.exit(code)); };
// the whole run has a time limit of its own: a hung browser must not hold the caller
setTimeout(() => { console.log("FAIL the run did not finish in", arg("limit", 240), "seconds"); done(1); }, Number(arg("limit", 240)) * 1000).unref();
b = await launch({ port: Number(arg("port", 9500)) });
const ok = (name, cond, extra = "") => { if (!cond) failed++; console.log(cond ? "PASS" : "FAIL", name, extra); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pageFiles = [];
const walk = (d, pre = "") => readdirSync(d, { withFileTypes: true }).forEach((e) => e.isDirectory() ? (e.name !== "assets" && e.name !== "data" && walk(join(d, e.name), pre + e.name + "/")) : e.name.endsWith(".html") && pageFiles.push(pre + e.name));
walk(dist);

async function open(path, { w = 1280, h = 900, reduced = "", nojs = false, wait = 500 } = {}) {
  const p = await b.newPage();
  await p.viewport(w, h, 1, w < 700);
  await p.media({ reduced });
  if (nojs) await p.cmd("Emulation.setScriptExecutionDisabled", { value: true });
  await p.goto(base + path, wait);
  return p;
}
const bg = (p) => p.eval(`getComputedStyle(document.body).backgroundColor`);
const css = `[...document.querySelectorAll('.gpanel')].find(function(x){return !x.hidden})`;

// 1. every page loads cleanly
{
  const bad = [];
  for (const f of pageFiles) {
    const p = await open(f, { wait: 350 });
    const errors = p.logs.filter((l) => /^(EXCEPTION|error)/.test(l));
    if (errors.length) bad.push(f + ": " + errors[0].slice(0, 120));
    await p.close();
  }
  ok(`all ${pageFiles.length} pages load with no script error`, bad.length === 0, bad.slice(0, 3).join(" | "));
  ok("the browser never asked for a file the site does not have", missing.length === 0, missing.slice(0, 5).join(" "));
}

// 2. the theme switch changes the colours and is remembered
{
  let p = await open("results.html");
  const light = await bg(p);
  await p.eval(`document.querySelector("[data-theme-toggle]").click()`);
  await sleep(300);
  const dark = await bg(p), attr = await p.eval(`document.documentElement.getAttribute("data-theme")`);
  await p.goto(base + "compare.html", 600);      // another page, opened later
  const later = await bg(p);
  await p.eval(`document.querySelector("[data-theme-toggle]").click()`);
  await sleep(300);
  const back = await bg(p);
  ok("the theme switch turns the page dark, and the choice is kept on the next page", attr === "dark" && dark !== light && later === dark, `${light} -> ${dark}, next page ${later}`);
  ok("the switch turns it light again", back === light, back);
  await p.close();
}

// 3. Results sorts by name and by number
{
  const p = await open("results.html");
  const names = () => p.eval(`[...${css}.querySelectorAll("tbody tr[data-i]")].map(function(r){return r.getAttribute("data-name")})`);
  const col = () => p.eval(`[...${css}.querySelectorAll("tbody tr[data-i]")].map(function(r){var c=r.querySelector('[data-c="c0"]'); return c && c.getAttribute("data-pct") !== "" ? Number(c.getAttribute("data-pct")) : null})`);
  const click = (k) => p.eval(`${css}.querySelector('button.sort[data-k="${k}"]').click()`);
  await click("name"); await sleep(250);
  const asc = await names();
  await click("name"); await sleep(250);
  const desc = await names();
  const sortedAsc = [...asc].sort((x, y) => x.localeCompare(y));
  ok("clicking Program sorts the rows by name, and again the other way", JSON.stringify(asc) === JSON.stringify(sortedAsc) && JSON.stringify(desc) === JSON.stringify([...sortedAsc].reverse()), asc.slice(0, 3).join(",") + " / " + desc.slice(0, 3).join(","));
  await click("c0"); await sleep(250);
  const first = (await col()).filter((v) => v !== null);
  await click("c0"); await sleep(250);
  const second = (await col()).filter((v) => v !== null);
  const mono = (a, dir) => a.every((v, i) => i === 0 || (dir > 0 ? a[i - 1] <= v : a[i - 1] >= v));
  ok("clicking a tool's column sorts by its numbers (as numbers), and again the other way", first.length > 3 && ((mono(first, 1) && mono(second, -1)) || (mono(first, -1) && mono(second, 1))) && JSON.stringify(first) !== JSON.stringify(second), first.slice(0, 6).join(",") + " / " + second.slice(0, 6).join(","));
  const nums = () => p.eval(`[...${css}.querySelectorAll("tbody tr[data-i]")].map(function(r){return Number(r.getAttribute("data-total"))})`);
  await click("total"); await sleep(250);
  const t1 = await nums();
  await click("total"); await sleep(250);
  const t2 = await nums();
  ok("clicking Total branches sorts by size as numbers (1,922 before 20,356), and again the other way", (mono(t1, 1) && mono(t2, -1)) || (mono(t1, -1) && mono(t2, 1)), t1.slice(0, 5).join(",") + " / " + t2.slice(0, 5).join(","));
  await p.close();
}

// 4. Compare shows another pair and swaps
{
  const p = await open("compare.html");
  const state = () => p.eval(`({a: document.getElementById("sel-a").value, b: document.getElementById("sel-b").value, out: document.getElementById("cmp-out").innerHTML, rows: document.querySelectorAll("#cmp-out tbody tr").length})`);
  const s0 = await state();
  const other = await p.eval(`[...document.getElementById("sel-b").options].map(function(o){return o.value}).filter(function(v){return v !== ${JSON.stringify(s0.a)} && v !== ${JSON.stringify(s0.b)}})[0]`);
  await p.eval(`(function(){var s=document.getElementById("sel-b"); s.value=${JSON.stringify(other)}; s.dispatchEvent(new Event("change",{bubbles:true}))})()`);
  await sleep(500);
  const s1 = await state();
  ok("choosing another tool in Compare shows another comparison", s1.b === other && s1.out !== s0.out && s1.rows > 0 && s1.out.length > 500, `${s0.b} -> ${s1.b}`);
  await p.eval(`document.getElementById("swap").click()`);
  await sleep(500);
  const s2 = await state();
  ok("Swap exchanges A and B", s2.a === s1.b && s2.b === s1.a, `${s2.a} / ${s2.b}`);
  await p.close();
}

// 5. Ctrl+K finds a program and goes to it
{
  const p = await open("results.html");
  await p.key("k", { modifiers: 2, code: "KeyK" });
  await sleep(300);
  const opened = await p.eval(`document.getElementById("pal").open`);
  await p.cmd("Input.insertText", { text: "krep" });
  await sleep(300);
  const listed = await p.eval(`[...document.querySelectorAll("#pal-list a")].map(function(a){return a.getAttribute("href")})`);
  await p.key("Enter");
  await sleep(900);
  const where = await p.eval(`location.pathname`);
  ok("Ctrl+K opens the finder, typing a program lists it, Enter goes to its page", opened && listed.some((h) => /programs\/krep\.html/.test(h)) && /programs\/krep\.html$/.test(where), `${opened} ${listed.slice(0, 2)} ${where}`);
  await p.close();
}

// 6. a program page draws its branch map
{
  const p = await open("programs/krep.html", { wait: 1500 });
  const px = await p.eval(`(function(){var c=document.querySelector("#mapbox canvas"); if(!c) return -1; var d=c.getContext("2d").getImageData(0,0,c.width,c.height).data, n=0; for(var i=3;i<d.length;i+=4) if(d[i]>0) n++; return n})()`);
  ok("the branch map of a program page is drawn", px > 1000, `${px} coloured pixels`);
  await p.close();
}

// 7. the front page map finishes drawing; under reduced motion it is whole at once
{
  const settled = `({moving: [...document.querySelectorAll(".hm-f")].filter(function(e){return getComputedStyle(e).animationName !== "none"}).length, running: document.getAnimations().filter(function(a){return a.playState === "running"}).length, svg: [...document.querySelectorAll("#hm-stage .hm-svg")].filter(function(s){return s.getBoundingClientRect().width>0}).length, paths: document.querySelectorAll("#hm-stage .hm-svg path").length})`;
  let p = await open("index.html", { wait: 4000 });
  const a = await p.eval(settled);
  await p.close();
  p = await open("index.html", { reduced: "reduce", wait: 300 });
  const r = await p.eval(settled);
  ok("the front page map finishes drawing and nothing keeps running", a.moving > 0 && a.running === 0 && a.svg >= 1 && a.paths > 0, JSON.stringify(a));
  ok("with reduced motion the map is whole at once, with no animation", r.moving === 0 && r.running === 0 && r.svg >= 1 && r.paths === a.paths, JSON.stringify(r));
  await p.close();
}

// 8. with scripts off, the tables are there and no control that needs a script is offered
{
  const p = await open("results.html", { nojs: true });
  const s = await p.eval(`({rows: document.querySelectorAll("tbody tr[data-i]").length, numbers: document.querySelectorAll("td[data-med]").length, visibleSort: [...document.querySelectorAll("button.sort, .js-only")].filter(function(e){return e.getBoundingClientRect().width>0 && getComputedStyle(e).visibility !== "hidden"}).length})`);
  ok("without scripts Results still holds the rows and numbers and offers no sort buttons", s.rows >= 10 && s.numbers > 50 && s.visibleSort === 0, JSON.stringify(s));
  await p.close();
}

// 9. no page is wider than a phone
{
  const wide = [];
  for (const f of ["index.html", "results.html", "tools.html", "compare.html", "method.html", "releases.html", "programs/krep.html", "programs/bc.html", "404.html"]) {
    const p = await open(f, { w: 390, h: 800, wait: 700 });
    const over = await p.eval(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
    if (over > 1) wide.push(f + " +" + over);
    await p.close();
  }
  ok("no page scrolls sideways on a 390 px phone", wide.length === 0, wide.join(" "));
}
console.log(failed ? `${failed} checks failed` : "all checks passed");
done(failed ? 1 : 0);
