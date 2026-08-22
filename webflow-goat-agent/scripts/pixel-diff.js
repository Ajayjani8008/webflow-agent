#!/usr/bin/env node
// pixel-diff.js — quantified visual compare for pixel-verify. STRICT / fail-closed (v1.9.0).
//
// Three independent ways to fail, because a single global % hides real defects:
//   1. global match  < 99%                      → FAIL  (overall drift)
//   2. height delta  > 2% after width-normalize → FAIL  (was only a note pre-1.9.0: a section 200px too
//                                                        tall PASSed because the diff cropped it away)
//   3. any 12x12 cell > 25% mismatched          → FAIL  (one broken component inside a large section stays
//                                                        under the 3% global budget and used to PASS)
//
// Usage: node pixel-diff.js <reference.png> <built.png> [out-diff.png] [--json] [--min=99] [--cell=25] [--height=2]
// Prints an EVIDENCE block meant to be pasted verbatim into the pixel-verify report.
// Exit: 0 = PASS, 1 = FAIL, 2 = usage/IO error.
// Deps: pngjs, pixelmatch (pinned in ../package.json).

const fs = require('fs');
const path = require('path');

function req(name) {
  const roots = [process.cwd(), path.join(__dirname, '..'), require('os').homedir(), __dirname];
  for (const r of roots) {
    try { return require(require.resolve(name, { paths: [path.join(r, 'node_modules'), r] })); } catch (e) {}
  }
  console.error(`Missing dep "${name}". Run: npm install  (in ~/docs/memory/webflow)`);
  process.exit(2);
}

const { PNG } = req('pngjs');
const pixelmatch = (m => m.default || m)(req('pixelmatch'));

const args = process.argv.slice(2);
const flags = args.filter(a => a.startsWith('--'));
const [refPath, builtPath, outPath] = args.filter(a => !a.startsWith('--'));
const flagVal = (name, dflt) => {
  const f = flags.find(x => x.startsWith(`--${name}=`));
  return f ? parseFloat(f.split('=')[1]) : dflt;
};
const MIN_MATCH = flagVal('min', 99);        // global %
const CELL_MAX = flagVal('cell', 25);        // % of one grid cell allowed to differ
const HEIGHT_MAX = flagVal('height', 2);     // % height delta allowed
const asJson = flags.includes('--json');

if (!refPath || !builtPath) {
  console.error('Usage: node pixel-diff.js <reference.png> <built.png> [out-diff.png] [--json] [--min=99] [--cell=25] [--height=2]');
  process.exit(2);
}

const load = p => { try { return PNG.sync.read(fs.readFileSync(p)); } catch (e) { console.error(`cannot read ${p}: ${e.message}`); process.exit(2); } };

// area-average (box filter) downscale — preserves text weight far better than nearest-neighbour,
// so type-heavy sections are not penalised for resampling noise.
function resize(img, w) {
  const h = Math.max(1, Math.round(img.height * (w / img.width)));
  const out = new PNG({ width: w, height: h });
  const xr = img.width / w, yr = img.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * yr), y1 = Math.max(y0 + 1, Math.floor((y + 1) * yr));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * xr), x1 = Math.max(x0 + 1, Math.floor((x + 1) * xr));
      let r = 0, g = 0, b = 0, al = 0, n = 0;
      for (let sy = y0; sy < y1 && sy < img.height; sy++) {
        for (let sx = x0; sx < x1 && sx < img.width; sx++) {
          const si = (sy * img.width + sx) * 4;
          r += img.data[si]; g += img.data[si + 1]; b += img.data[si + 2]; al += img.data[si + 3]; n++;
        }
      }
      const di = (y * w + x) * 4;
      out.data[di] = r / n; out.data[di + 1] = g / n; out.data[di + 2] = b / n; out.data[di + 3] = al / n;
    }
  }
  return out;
}

let a = load(refPath), b = load(builtPath);
const orig = { ref: `${a.width}x${a.height}`, built: `${b.width}x${b.height}` };
const w = Math.min(a.width, b.width);
if (a.width !== w) a = resize(a, w);
if (b.width !== w) b = resize(b, w);

const hRef = a.height, hBuilt = b.height;
const h = Math.min(hRef, hBuilt);
const hDeltaPct = hRef ? (Math.abs(hRef - hBuilt) / hRef) * 100 : 0;

const crop = img => { const c = new PNG({ width: w, height: h }); PNG.bitblt(img, c, 0, 0, w, h, 0, 0); return c; };
a = crop(a); b = crop(b);

const diff = new PNG({ width: w, height: h });
// threshold 0.12 absorbs antialiasing + font hinting; includeAA skips AA-only pixels
const mismatched = pixelmatch(a.data, b.data, diff.data, w, h, { threshold: 0.12, includeAA: false });
const pct = 100 - (mismatched / (w * h)) * 100;

// per-cell concentration on a 12x12 grid
const G = 12, cellW = Math.ceil(w / G), cellH = Math.ceil(h / G);
const cells = Array.from({ length: G * G }, () => 0);
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (diff.data[i] === 255 && diff.data[i + 1] === 0) cells[Math.floor(y / cellH) * G + Math.floor(x / cellW)]++;
  }
}
const cellArea = (gx, gy) => Math.max(1, Math.min(cellW, w - gx * cellW) * Math.min(cellH, h - gy * cellH));
const describe = (gx, gy) =>
  `${['top', 'upper', 'middle', 'lower', 'bottom'][Math.min(4, Math.floor(gy / (G / 5)))]}-${['left', 'center-left', 'center', 'center-right', 'right'][Math.min(4, Math.floor(gx / (G / 5)))]}`;

const ranked = cells.map((n, i) => {
  const gy = Math.floor(i / G), gx = i % G;
  return {
    n, gx, gy, pctCell: (n / cellArea(gx, gy)) * 100,
    box: `x:${gx * cellW}-${Math.min(w, (gx + 1) * cellW)}, y:${gy * cellH}-${Math.min(h, (gy + 1) * cellH)}`,
    where: describe(gx, gy)
  };
}).filter(c => c.n > 0).sort((p, q) => q.pctCell - p.pctCell);

const hotCells = ranked.filter(c => c.pctCell > CELL_MAX);

if (outPath) { try { fs.writeFileSync(outPath, PNG.sync.write(diff)); } catch (e) { console.error(`warn: could not write ${outPath}: ${e.message}`); } }

const fails = [];
if (pct < MIN_MATCH) fails.push(`global match ${pct.toFixed(2)}% < ${MIN_MATCH}%`);
if (hDeltaPct > HEIGHT_MAX) fails.push(`height delta ${hDeltaPct.toFixed(1)}% > ${HEIGHT_MAX}% (ref ${hRef}px vs built ${hBuilt}px) — layout height mismatch, not a crop artifact`);
if (hotCells.length) fails.push(`${hotCells.length} concentrated region(s) > ${CELL_MAX}% mismatched — ${hotCells.slice(0, 3).map(c => `${c.where} ${c.pctCell.toFixed(0)}%`).join(' · ')}`);

const verdict = fails.length ? 'FAIL' : 'PASS';
const result = {
  verdict, match: +pct.toFixed(2), mismatchedPx: mismatched, comparedAt: `${w}x${h}`,
  original: orig, heightDeltaPct: +hDeltaPct.toFixed(2),
  // emitted so callers can sanity-check the REFERENCE itself: reference frames that share a height across
  // different widths are one layout cropped, not per-breakpoint frames (verify-section § reference invalid)
  refHeight: hRef, builtHeight: hBuilt,
  thresholds: { min: MIN_MATCH, cell: CELL_MAX, height: HEIGHT_MAX },
  hotCells: hotCells.slice(0, 8).map(c => ({ where: c.where, box: c.box, pct: +c.pctCell.toFixed(1), px: c.n })),
  worst: ranked.slice(0, 5).map(c => ({ where: c.where, box: c.box, pct: +c.pctCell.toFixed(1), px: c.n })),
  fails, ref: refPath, built: builtPath, diff: outPath || null
};

if (asJson) { console.log(JSON.stringify(result, null, 2)); process.exit(verdict === 'PASS' ? 0 : 1); }

console.log(`EVIDENCE pixel-diff — ${verdict}`);
console.log(`  ref:    ${refPath} (${orig.ref})`);
console.log(`  built:  ${builtPath} (${orig.built})`);
console.log(`  match:  ${pct.toFixed(2)}%  (${mismatched} of ${w * h} px differ, compared at ${w}x${h})`);
console.log(`  height: ref ${hRef}px vs built ${hBuilt}px → delta ${hDeltaPct.toFixed(1)}% (limit ${HEIGHT_MAX}%)`);
if (ranked.length) {
  console.log('  worst regions (share of that cell):');
  ranked.slice(0, 5).forEach(c => console.log(`    - ${c.where} (${c.box}): ${c.pctCell.toFixed(0)}% of cell, ${c.n}px`));
}
fails.forEach(f => console.log(`  FAIL: ${f}`));
console.log(`VERDICT: ${verdict}${verdict === 'PASS' ? ` (>=${MIN_MATCH}%, height ok, no hot region)` : ' — fix pass required on the regions above'}`);
process.exit(verdict === 'PASS' ? 0 : 1);
