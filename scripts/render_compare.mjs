// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The Agent Software Testing authors
// Renders comparisons with the browser-side code (the compare and compare-data scripts of a built site) and prints them
// as a JSON list of HTML strings. The tests use it to check that the default pair equals the page the build wrote.
//   node scripts/render_compare.mjs <dist> [a:b ...]      pairs of tool ids; without pairs a spread of pairs
//   node scripts/render_compare.mjs <dist> --options ID   the options of the two pickers, with ID selected
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, join } from "node:path";
import vm from "node:vm";

const dist = resolve(process.argv[2] || "dist");
// The build publishes scripts under content-hashed names (assets/compare.<hash>.js); the compare page says which.
const page = readFileSync(join(dist, "compare.html"), "utf8");
const assetOf = (stem) => { const m = new RegExp("assets/" + stem + "\\.[0-9a-f]{10}\\.js").exec(page); if (!m) throw new Error("compare.html does not refer to " + stem); return join(dist, m[0]); };
const require = createRequire(import.meta.url);
const factory = require(assetOf("compare"));
const sandbox = { window: {} };
vm.runInNewContext(readFileSync(assetOf("compare-data"), "utf8"), sandbox);
const C = sandbox.window.CRCompare;
// the address of the overlap table is in the page (data-src of the output), where compare.js reads it
const src = /id="cmp-out"[^>]*data-src="([^"]*)"/.exec(page);
if (src) C.overlap_src = src[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const api = factory({});
const M = api.Model(C);
const ids = C.systems.map((s) => s.id);
if (process.argv[3] === "--options") { console.log(JSON.stringify(api.options(M, process.argv[4]))); process.exit(0); }      // the options of the pickers, with this entry selected
let pairs = process.argv.slice(3).map((p) => p.split(":"));
if (!pairs.length) for (let i = 0; i < ids.length; i += 3) for (let j = i + 1; j < ids.length; j += 5) pairs.push([ids[i], ids[j]]);
console.log(JSON.stringify(pairs.map(([a, b]) => api.render(M, a, b).html)));
