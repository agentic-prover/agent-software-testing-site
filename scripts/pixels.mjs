// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The Agent Software Testing authors
// A PNG decoder for the screenshots of the checks (8-bit, not interlaced, grey, RGB or RGBA; node's zlib, no dependencies), and a scan that
// tells on which sides of a box an outline of a given colour is drawn.
import { inflateSync } from "node:zlib";

export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let pos = 8, width = 0, height = 0, depth = 0, ctype = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString("latin1", pos + 4, pos + 8), body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; ctype = body[9]; interlace = body[12]; }
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || ![0, 2, 6].includes(ctype)) throw new Error(`unsupported PNG (depth ${depth}, colour type ${ctype}, interlace ${interlace})`);
  const bpp = ctype === 6 ? 4 : ctype === 2 ? 3 : 1, stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat)), out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), dst = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? dst[x - bpp] : 0, b = prev ? prev[x] : 0, c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = src[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      dst[x] = v & 255;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    if (bpp === 4) { rgba[i * 4] = out[i * 4]; rgba[i * 4 + 1] = out[i * 4 + 1]; rgba[i * 4 + 2] = out[i * 4 + 2]; rgba[i * 4 + 3] = out[i * 4 + 3]; }
    else if (bpp === 3) { rgba[i * 4] = out[i * 3]; rgba[i * 4 + 1] = out[i * 3 + 1]; rgba[i * 4 + 2] = out[i * 3 + 2]; rgba[i * 4 + 3] = 255; }
    else { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = out[i]; rgba[i * 4 + 3] = 255; }
  }
  return { width, height, data: rgba };
}

// Which sides of the box (x, y, w, h in screenshot pixels) carry the colour [r, g, b]: for each side the share of its pixels, in a band of `band` pixels
// that reaches `reach` pixels outside the box and `band - reach` inside it, that are within `tol` of the colour (summed difference of the channels).
export function ringSides(img, box, rgb, { band = 5, reach = 2, tol = 60 } = {}) {
  const near = (x, y) => {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return false;
    const i = (y * img.width + x) * 4;
    return Math.abs(img.data[i] - rgb[0]) + Math.abs(img.data[i + 1] - rgb[1]) + Math.abs(img.data[i + 2] - rgb[2]) <= tol;
  };
  const x0 = Math.round(box.x), y0 = Math.round(box.y), x1 = Math.round(box.x + box.w), y1 = Math.round(box.y + box.h);
  const share = (xs, ys) => { let n = 0, t = 0; for (const x of xs) for (const y of ys) { t++; if (near(x, y)) n++; } return t ? n / t : 0; };
  const rng = (a, b) => Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);
  // the share of columns (rows) in the middle of the side that have at least one pixel of the colour inside the band
  const side = (horizontal, at) => {
    const along = horizontal ? rng(x0 + 3, x1 - 3) : rng(y0 + 3, y1 - 3);
    let hit = 0;
    for (const v of along) {
      let found = false;
      for (let d = -reach; d < band - reach && !found; d++) found = horizontal ? near(v, at + d) : near(at + d, v);
      if (found) hit++;
    }
    return along.length ? hit / along.length : 0;
  };
  return { top: side(true, y0), bottom: side(true, y1 - 1), left: side(false, x0), right: side(false, x1 - 1) };
}
