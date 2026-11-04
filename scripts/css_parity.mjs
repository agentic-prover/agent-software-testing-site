// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The Agent Software Testing authors
// Do two builds of the site give every element of every page the same computed style? The default build (style sheet split, files minified) against one made with
//   python build.py --no-minify --no-split --out DIR
// Every page is opened at four widths in both colour schemes, and in forced colours (and with every disclosure open, which shows the rules of the Terms); for every element, and for the
// ::before and ::after of the elements that have them, a line of the properties that decide how it looks and where it sits is written, and the two builds are compared line by line.
//   node scripts/css_parity.mjs REFERENCE_DIST [--dist dist] [--port 9490] [--quick]
// --quick opens the pages at 390 and 1440 px in the light scheme, and at 1440 px in forced colours. Prints the first differences; exit status 1 when there is one.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { launch } from "./cdp.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const arg = (name, dflt) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : dflt; };
const refDir = resolve(process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "");
const dist = resolve(root, arg("dist", "dist"));
const quick = process.argv.includes("--quick");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
function serve(dir) {
  const server = createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const f = join(dir, p);
    if (!f.startsWith(dir) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" });
    res.end(readFileSync(f));
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r({ server, base: `http://127.0.0.1:${server.address().port}/` })));
}
const A = await serve(refDir), B = await serve(dist);
const b = await launch({ port: Number(arg("port", 9490)) });
const pages = ["index", "results", "all-versions", "tools", "releases", "compare", "method", "contribute", "404"].concat(readdirSync(dist).filter((f) => /^tool-.*\.html$/.test(f)).sort().map((f) => f.replace(/\.html$/, ""))).concat(readdirSync(join(dist, "programs")).filter((f) => f.endsWith(".html")).sort().map((f) => "programs/" + f.replace(/\.html$/, "")));
// [width, height, scheme, forced colours]: the last two are Windows high contrast, where the rules of the forced-colours sheets decide
const modes = quick ? [[390, 844, "light", ""], [1440, 900, "light", ""], [1440, 900, "light", "active"]]
  : [[390, 844, "light", ""], [390, 844, "dark", ""], [768, 900, "light", ""], [1024, 800, "light", ""], [1440, 900, "light", ""], [1440, 900, "dark", ""], [1440, 900, "light", "active"], [390, 844, "dark", "active"]];

const PROPS = ["display", "position", "top", "right", "bottom", "left", "width", "height", "min-width", "max-width", "min-height", "max-height", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding-top", "padding-right", "padding-bottom", "padding-left", "border-top-width", "border-right-width", "border-bottom-width", "border-left-width", "border-top-style", "border-bottom-style",
  "border-left-style", "border-right-style", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color", "border-top-left-radius", "color", "background-color", "background-image",
  "background-size", "background-position", "background-attachment", "font-family", "font-size", "font-weight", "font-style", "font-feature-settings", "line-height", "letter-spacing", "text-transform",
  "text-align", "text-decoration-line", "text-decoration-thickness", "text-underline-offset", "text-overflow", "white-space", "overflow-x", "overflow-y", "overflow-wrap", "opacity", "z-index", "visibility",
  "flex-grow", "flex-shrink", "flex-basis", "flex-direction", "flex-wrap", "align-items", "align-self", "justify-content", "gap", "row-gap", "column-gap", "grid-template-columns", "grid-column-start",
  "grid-column-end", "vertical-align", "float", "clear", "transform", "box-shadow", "outline-style", "outline-width", "outline-offset", "cursor", "pointer-events", "fill", "stroke", "stroke-width",
  "stroke-dasharray", "stroke-linecap", "fill-opacity", "stroke-opacity", "list-style-type", "box-sizing", "clip", "clip-path", "scroll-padding-top", "scroll-padding-left", "container-type", "content",
  "forced-color-adjust", "transition-duration", "animation-name", "touch-action", "appearance", "accent-color", "color-scheme", "text-wrap", "word-break", "tab-size", "object-fit", "contain",
  "will-change", "scrollbar-width", "counter-increment", "resize", "user-select"];
const COLLECT = `(function (props) {
  var out = [];
  function line(e, pseudo) {
    var cs = getComputedStyle(e, pseudo), s = [];
    if (pseudo) { var c = cs.getPropertyValue("content"); if (c === "none" || c === "normal") return null; }
    for (var i = 0; i < props.length; i++) s.push(cs.getPropertyValue(props[i]));
    var r = pseudo ? null : e.getBoundingClientRect();
    return (pseudo || "") + "|" + s.join(";") + (r ? "|" + Math.round(r.left) + "," + Math.round(r.top) + "," + Math.round(r.width) + "," + Math.round(r.height) : "");
  }
  function path(e) { var p = []; while (e && e.nodeType === 1 && p.length < 4) { p.push(e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\\s+/).slice(0, 2).join(".") : "")); e = e.parentElement; } return p.join(" < "); }
  document.querySelectorAll("body *").forEach(function (e) {
    if (e.closest("script, style, noscript")) return;
    var tag = e.tagName.toLowerCase(); if (tag === "script" || tag === "style" || tag === "noscript") return;
    var l = line(e, null); out.push([path(e), l]);
    ["::before", "::after"].forEach(function (ps) { var q = line(e, ps); if (q) out.push([path(e) + ps, q]); });
  });
  return out;
})(${JSON.stringify(PROPS)})`;

async function snapshot(base, path, w, h, scheme, forced) {
  const p = await b.newPage();
  await p.viewport(w, h, 1, w < 700);
  await p.media({ scheme, forced });
  await p.goto(base + path + ".html", 1100);
  await p.eval(`document.querySelectorAll("details").forEach(function (d) { d.open = true; })`);
  // the reveal of the branch map on the front page is still playing for part of a slow load: both builds are read with every animation at its end (scripts/home.mjs checks the animation itself)
  await p.eval(`document.getAnimations().forEach(function (a) { try { a.finish(); } catch (e) { /* an animation that cannot finish has none to wait for */ } })`);
  await new Promise((r) => setTimeout(r, 200));
  const rows = await p.eval(COLLECT);
  await p.close();
  return rows;
}

let failed = 0, compared = 0;
for (const name of pages) for (const [w, h, scheme, forced] of modes) {
  const ra = await snapshot(A.base, name, w, h, scheme, forced), rb = await snapshot(B.base, name, w, h, scheme, forced);
  compared++;
  const diffs = [];
  if (ra.length !== rb.length) diffs.push(`element count ${ra.length} against ${rb.length}`);
  for (let i = 0; i < Math.min(ra.length, rb.length) && diffs.length < 4; i++) {
    if (ra[i][1] !== rb[i][1]) {
      const pa = ra[i][1].split("|"), pb = rb[i][1].split("|");
      const va = (pa[1] || "").split(";"), vb = (pb[1] || "").split(";");
      const which = va.map((x, k) => (x !== vb[k] ? `${PROPS[k]}: ${x} -> ${vb[k]}` : null)).filter(Boolean).slice(0, 4);
      diffs.push(`${ra[i][0]}  ${which.join(" | ") || (pa[2] + " -> " + pb[2])}`);
    }
  }
  if (diffs.length) { failed++; console.log(`DIFF ${name} ${w}x${h} ${scheme}${forced ? " forced-colors" : ""}:\n   ` + diffs.join("\n   ")); }
}
console.log(failed ? `${failed} of ${compared} page views differ` : `all ${compared} page views have the same computed style in both builds`);
await b.close();
A.server.close(); B.server.close();
process.exit(failed ? 1 : 0);
