#!/usr/bin/env node
// scripts/gift-qr.mjs
// -----------------------------------------------------------------------------
// THE GIFT CARD'S QR CODE: one fixed address, https://flourishmoney.app/gift/redeem, drawn once into
// public/gift/redeem-qr.svg. No QR library and no outside QR service: the card loads nothing from elsewhere, and the
// code never goes in it (the QR only opens the redeem page; the code is printed beside it).
//
// A small encoder for exactly this job: byte mode, error correction level M, versions 1 to 3 (one block each), the
// lowest-penalty mask of the eight. The construction follows ISO/IEC 18004 as Project Nayuki's reference encoder lays
// it out. tests/giftQr.browser.test.cjs reads the drawn code back with the browser's own barcode reader, so the
// address it opens is checked, not assumed.
//
//   node scripts/gift-qr.mjs            write public/gift/redeem-qr.svg
//   node scripts/gift-qr.mjs --check    exit 1 if the committed file is not what this draws
// -----------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REDEEM_URL = "https://flourishmoney.app/gift/redeem";
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const OUT = path.join(HERE, "..", "public", "gift", "redeem-qr.svg");

// Level M, one block: [version, data codewords, error correction codewords].
const VERSIONS_M = [[1, 16, 10], [2, 28, 16], [3, 44, 26]];
const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22] };

function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z & 0xff;
}
function rsDivisor(degree) {
  const r = new Array(degree).fill(0); r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < r.length; j++) { r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
    root = gfMul(root, 0x02);
  }
  return r;
}
function rsRemainder(data, divisor) {
  const r = divisor.map(() => 0);
  for (const b of data) {
    const f = b ^ r.shift(); r.push(0);
    divisor.forEach((c, i) => { r[i] ^= gfMul(c, f); });
  }
  return r;
}

/** The QR modules for text: a square array of booleans (true is dark). */
export function qrMatrix(text) {
  const bytes = [...Buffer.from(String(text), "utf8")];
  const pick = VERSIONS_M.find(([, data]) => 4 + 8 + bytes.length * 8 <= data * 8);
  if (!pick) throw new Error("too long for this small encoder");
  const [ver, dataLen, ecLen] = pick;
  // Data: byte mode 0100, an 8-bit count, the bytes, a terminator, then the pad bytes.
  const bits = [];
  const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(4, 4); put(bytes.length, 8); bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, dataLen * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let p = 0xec; data.length < dataLen; p ^= 0xec ^ 0x11) data.push(p);
  const codewords = [...data, ...rsRemainder(data, rsDivisor(ecLen))];

  const size = ver * 4 + 17;
  const mod = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
    }
  }
  const al = ALIGN[ver];
  for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const formatBits = (mask) => {
    const d = (0 << 3) | mask;              // level M is 00
    let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return ((d << 10) | rem) ^ 0x5412;
  };
  const drawFormat = (mask) => {
    const b = formatBits(mask), bit = (i) => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);                 // the dark module
  };
  drawFormat(0);                            // reserves the format areas
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - v : v;
      if (!fn[y][x] && k < codewords.length * 8) { mod[y][x] = ((codewords[k >>> 3] >>> (7 - (k & 7))) & 1) === 1; k++; }
    }
  }
  const MASKS = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const applied = (m) => mod.map((row, y) => row.map((d, x) => (fn[y][x] ? d : d !== MASKS[m](x, y))));
  // The penalty rules of the standard, enough to choose among the eight: runs, 2x2 blocks, finder look-alikes, balance.
  const penalty = (g) => {
    let p = 0;
    const lines = [...g, ...g[0].map((_, x) => g.map((r) => r[x]))];
    for (const line of lines) {
      let run = 1;
      for (let i = 1; i <= line.length; i++) {
        if (i < line.length && line[i] === line[i - 1]) run++;
        else { if (run >= 5) p += 3 + (run - 5); run = 1; }
      }
      const s = line.map((d) => (d ? "1" : "0")).join("");
      p += 40 * ((s.match(/(?=10111010000)/g) || []).length + (s.match(/(?=00001011101)/g) || []).length);
    }
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
      const c = g[y][x]; if (c === g[y][x + 1] && c === g[y + 1][x] && c === g[y + 1][x + 1]) p += 3;
    }
    const dark = g.flat().filter(Boolean).length;
    p += 10 * Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size));
    return p;
  };
  let best = null;
  for (let m = 0; m < 8; m++) {
    drawFormat(m);
    const g = applied(m), score = penalty(g);
    if (!best || score < best.score) best = { m, score, g };
  }
  drawFormat(best.m);
  return applied(best.m);
}

/** The SVG: one path, the brand ink on white, a 4-module quiet zone, scaled by the page. */
export function qrSvg(text, { ink = "#1A2035" } = {}) {
  const g = qrMatrix(text);
  const n = g.length, q = 4, w = n + 2 * q;
  let d = "";
  g.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += `M${x + q} ${y + q}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${w}" shape-rendering="crispEdges" role="img" aria-label="QR code: ${text.replace(/^https:\/\//, "")}"><rect width="${w}" height="${w}" fill="#FFFFFF"/><path fill="${ink}" d="${d}"/></svg>\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const svg = qrSvg(REDEEM_URL);
  if (process.argv.includes("--check")) {
    const have = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
    if (have !== svg) { console.error("  ✗ public/gift/redeem-qr.svg is not what scripts/gift-qr.mjs draws"); process.exit(1); }
    console.log("  ✓ public/gift/redeem-qr.svg is current");
  } else {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, svg);
    console.log(`  ✓ wrote ${path.relative(process.cwd(), OUT)} (${qrMatrix(REDEEM_URL).length} modules)`);
  }
}
