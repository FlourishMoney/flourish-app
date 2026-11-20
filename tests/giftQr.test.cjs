// tests/giftQr.test.cjs
// -----------------------------------------------------------------------------
// THE GIFT CARD'S QR CODE (public/gift/redeem-qr.svg, scripts/gift-qr.mjs), read back with no QR library, so a wrong
// module anywhere fails here on the CI's Linux runner too:
//   1  the committed SVG is exactly what the encoder draws; it is a 29 x 29 code (version 3) with its three finders
//   2  both copies of the format information agree and pass their BCH check: level M, one of the eight masks
//   3  the data, unmasked and read in the standard's zigzag, passes its Reed-Solomon check and spells
//      https://flourishmoney.app/gift/redeem, and nothing else (no code, no tracking)
//   4  the card shows it at 3.3 cm, from the site itself, and the code is printed beside it, never inside it
// On a Mac, scripts/gift-e2e/qr-decode.swift also reads a rendered copy with macOS's own QR reader (the e2e run).
// -----------------------------------------------------------------------------
"use strict";
const { create } = require("./_runner.cjs");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO = path.join(__dirname, "..");

(async () => {
  const t = create();
  const Q = await import("../scripts/gift-qr.mjs");
  let check = 0;
  try { execFileSync(process.execPath, [path.join(REPO, "scripts", "gift-qr.mjs"), "--check"], { stdio: "pipe" }); } catch (e) { check = e.status; }
  t.eq(check, 0, "1a public/gift/redeem-qr.svg is exactly what scripts/gift-qr.mjs draws");
  const svg = fs.readFileSync(Q.OUT, "utf8");
  // The modules, read from the SVG itself (one "Mx yh1v1h-1z" square each, inside a 4-module quiet zone).
  const box = Number(/viewBox="0 0 (\d+) \1"/.exec(svg)[1]);
  const n = box - 8;
  const g = Array.from({ length: n }, () => new Array(n).fill(false));
  for (const m of svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) g[Number(m[2]) - 4][Number(m[1]) - 4] = true;
  t.eq(n, 29, "1b 29 x 29 modules: version 3");
  const finder = (x0, y0) => { for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) { const d = Math.max(Math.abs(x - 3), Math.abs(y - 3)); if (g[y0 + y][x0 + x] !== (d !== 2)) return false; } return true; };
  t.ok(finder(0, 0) && finder(n - 7, 0) && finder(0, n - 7), "1c the three finder patterns are where a reader looks");

  // ── 2. the format information ───────────────────────────────────────────────────────────────────
  const bit = (x, y) => (g[y][x] ? 1 : 0);
  let a = 0, b = 0;
  const A = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  A.forEach(([x, y], i) => { a |= bit(x, y) << i; });
  for (let i = 0; i < 8; i++) b |= bit(n - 1 - i, 8) << i;
  for (let i = 8; i < 15; i++) b |= bit(8, n - 15 + i) << i;
  t.eq(a, b, "2a both copies of the format information agree");
  const fmt = a ^ 0x5412;
  let rem = fmt >>> 10;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  t.eq(((fmt >>> 10) << 10 | rem), fmt, "2b …and pass their BCH check");
  const level = fmt >>> 13, mask = (fmt >>> 10) & 7;
  t.eq(level, 0, "2c error correction level M");
  t.eq(bit(8, n - 8), 1, "2d the dark module is set");

  // ── 3. the data ─────────────────────────────────────────────────────────────────────────────────
  const fn = Array.from({ length: n }, () => new Array(n).fill(false));
  const mark = (x, y) => { if (x >= 0 && y >= 0 && x < n && y < n) fn[y][x] = true; };
  for (let i = 0; i < n; i++) { mark(6, i); mark(i, 6); }
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) mark(cx + dx, cy + dy);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) mark(22 + dx, 22 + dy);
  A.forEach(([x, y]) => mark(x, y));
  for (let i = 0; i < 8; i++) mark(n - 1 - i, 8);
  for (let i = 0; i < 8; i++) mark(8, n - 1 - i);
  const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
  const bits = [];
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < n; v++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? n - 1 - v : v;
      if (!fn[y][x]) bits.push((g[y][x] !== MASKS[mask](x, y)) ? 1 : 0);
    }
  }
  const cw = []; for (let i = 0; i + 8 <= bits.length && cw.length < 70; i += 8) cw.push(bits.slice(i, i + 8).reduce((p, q) => (p << 1) | q, 0));
  t.eq(cw.length, 70, "3a 70 codewords: 44 of data and 26 of error correction (version 3, level M)");
  const mul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z & 0xff; };
  let alpha = 1; const syndromes = [];
  for (let i = 0; i < 26; i++) { let s = 0; for (const c of cw) s = mul(s, alpha) ^ c; syndromes.push(s); alpha = mul(alpha, 2); }
  t.ok(syndromes.every((s) => s === 0), "3b every Reed-Solomon syndrome is zero: no module is wrong");
  const data = cw.slice(0, 44).flatMap((c) => Array.from({ length: 8 }, (_, i) => (c >>> (7 - i)) & 1));
  const take = (k, at) => data.slice(at, at + k).reduce((p, q) => (p << 1) | q, 0);
  t.eq(take(4, 0), 4, "3c byte mode");
  const len = take(8, 4);
  const text = Buffer.from(Array.from({ length: len }, (_, i) => take(8, 12 + i * 8))).toString("utf8");
  t.eq(text, "https://flourishmoney.app/gift/redeem", "3d it opens https://flourishmoney.app/gift/redeem, and nothing else");

  // ── 4. on the card ──────────────────────────────────────────────────────────────────────────────
  const card = fs.readFileSync(path.join(REPO, "public", "gift", "card.html"), "utf8");
  const css = fs.readFileSync(path.join(REPO, "public", "gift", "card.css"), "utf8");
  t.ok(card.includes('src="/gift/redeem-qr.svg"') && !/https?:\/\/(?!flourishmoney\.app)[^"'\s]*qr/i.test(card), "4a the card loads its QR from the site itself, never an outside QR service");
  t.ok(/\.qr \{ width: 3\.3cm; height: 3\.3cm;/.test(css), "4b printed at 3.3 cm (a 25 mm pattern inside its quiet zone)");
  t.ok(card.includes('id="code"') && !svg.includes("#c=") && !/[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}/.test(svg), "4c the code is printed beside it, never inside it");
  t.summary("giftQr.test");
})().catch((e) => { console.error(e); process.exitCode = 1; });
