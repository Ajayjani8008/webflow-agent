#!/usr/bin/env node
// pixel-diff.js — quantified visual compare for pixel-verify.
// Usage: node pixel-diff.js <reference.png> <built.png> [out-diff.png]
// Prints: match % (target >= 97), and the top mismatch regions (12x12 grid) so fixes can be located.
// Deps (once, at home dir like ws): npm i pngjs pixelmatch --no-save
// Cross-platform, no native deps.

const fs = require('fs');
const path = require('path');

function req(name) {
  const roots = [process.cwd(), require('os').homedir(), __dirname];
  for (const r of roots) {
    try { return require(require.resolve(name, { paths: [path.join(r, 'node_modules'), r] })); } catch (e) {}
  }
  console.error(`Missing dep "${name}". Run: npm i pngjs pixelmatch --no-save (at home dir)`);
  process.exit(2);
}

const { PNG } = req('pngjs');
const pixelmatch = (m => m.default || m)(req('pixelmatch'));

const [refPath, builtPath, outPath] = process.argv.slice(2);
if (!refPath || !builtPath) { console.error('Usage: node pixel-diff.js <reference.png> <built.png> [out-diff.png]'); process.exit(2); }

function load(p) { return PNG.sync.read(fs.readFileSync(p)); }

// nearest-neighbor resize to given width, preserving aspect
function resize(img, w) {
  const h = Math.round(img.height * (w / img.width));
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    const sy = Math.min(img.height - 1, Math.floor(y * img.height / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.floor(x * img.width / w));
      const si = (sy * img.width + sx) * 4, di = (y * w + x) * 4;
      img.data.copy(out.data, di, si, si + 4);
    }
  }
  return out;
}

let a = load(refPath), b = load(builtPath);
const w = Math.min(a.width, b.width);
if (a.width !== w) a = resize(a, w);
if (b.width !== w) b = resize(b, w);
const h = Math.min(a.height, b.height);
const hDelta = Math.abs(a.height - b.height);

const diff = new PNG({ width: w, height: h });
const crop = (img) => { const c = new PNG({ width: w, height: h }); PNG.bitblt(img, c, 0, 0, w, h, 0, 0); return c; };
a = crop(a); b = crop(b);

// threshold 0.12 absorbs antialiasing + font hinting; includeAA skips AA-only pixels
const mismatched = pixelmatch(a.data, b.data, diff.data, w, h, { threshold: 0.12, includeAA: false });
const pct = 100 - (mismatched / (w * h)) * 100;

// locate worst regions on a 12x12 grid
const G = 12, cellW = Math.ceil(w / G), cellH = Math.ceil(h / G);
const cells = Array.from({ length: G * G }, () => 0);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const i = (y * w + x) * 4;
  if (diff.data[i] === 255 && diff.data[i + 1] === 0) cells[Math.floor(y / cellH) * G + Math.floor(x / cellW)]++;
}
const worst = cells.map((n, i) => ({ n, i })).filter(c => c.n > 0).sort((p, q) => q.n - p.n).slice(0, 5)
  .map(c => {
    const gy = Math.floor(c.i / G), gx = c.i % G;
    const pos = `${['top','upper','middle','lower','bottom'][Math.min(4, Math.floor(gy / (G / 5)))]}-${['left','center-left','center','center-right','right'][Math.min(4, Math.floor(gx / (G / 5)))]}`;
    return `${pos} (x:${gx * cellW}-${(gx + 1) * cellW}, y:${gy * cellH}-${(gy + 1) * cellH}): ${c.n}px`;
  });

if (outPath) fs.writeFileSync(outPath, PNG.sync.write(diff));

console.log(`match: ${pct.toFixed(2)}%  (${mismatched} of ${w * h} px differ, compared at ${w}x${h})`);
if (hDelta > 8) console.log(`note: height differs by ${hDelta}px after width-normalize — layout height mismatch, check section padding/line-wrap`);
if (worst.length) { console.log('worst regions:'); worst.forEach(r => console.log('  - ' + r)); }
console.log(pct >= 97 ? 'VERDICT: PASS (>=97%)' : 'VERDICT: FAIL (<97%) — run fix pass on worst regions');
process.exit(pct >= 97 ? 0 : 1);
