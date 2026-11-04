// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The Agent Software Testing authors
// Measures the height of the branch map component of every program page at the edges and the middle of five bands of widths (below 720, 720 to 999, 1000 to 1099,
// 1100 to 1279, 1280 and over) and writes content/mapheights.json.
// The build reserves that height (plus the card padding) for the map block, so the page does not move when the map is drawn. The map is taller or shorter at
// different widths, so the card has one reserve for each band (sitebuild/pages.py BANDS takes the largest height measured inside a band, so the map never outgrows its reserve).
//   node scripts/mapheights.mjs [--dist dist] [--out content/mapheights.json] [--widths 390,768,...]        then rebuild
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { launch } from "./cdp.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const arg = (name, dflt) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : dflt; };
const dist = resolve(root, arg("dist", "dist"));
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".csv": "text/csv", ".svg": "image/svg+xml", ".png": "image/png" };
const server = createServer((req, res) => {
  const f = join(dist, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!f.startsWith(dist) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;
const programs = readdirSync(join(dist, "programs")).filter((f) => f.endsWith(".html")).map((f) => f.replace(/\.html$/, "")).sort();
const b = await launch({ port: 9451 });
const out = {};
const WIDTHS = arg("widths", "390,719,720,768,999,1000,1024,1099,1100,1279,1280,1440").split(",").map(Number);
for (const w of WIDTHS) {
  for (const id of programs) {
    const p = await b.newPage();
    await p.viewport(w, 900, 1, w < 700);
    await p.media({ scheme: "light" });
    await p.goto(base + `programs/${id}.html`, 1500);
    const h = await p.eval(`(function(){var b=document.getElementById("mapbox");var k=b.firstElementChild;return Math.round(k?k.getBoundingClientRect().height:0)})()`);
    (out[id] ||= {})[w] = h;
    await p.close();
  }
}
await b.close();
server.close();
writeFileSync(resolve(root, arg("out", "content/mapheights.json")), JSON.stringify(out));
const v = (w) => Object.values(out).map((o) => o[w]);
for (const w of WIDTHS) console.log(String(w).padStart(5), "min/max", Math.min(...v(w)), Math.max(...v(w)));
