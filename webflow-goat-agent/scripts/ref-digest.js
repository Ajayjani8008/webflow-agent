// ref-digest.js — read a reference render WITHOUT putting the image in context.
//
// Why this exists: opening a PNG costs 5k-66k tokens (measured on real reference renders:
// 1920x900 hero = 66,328 · 355x323 product = 46,314 · 1920x117 header = 14,603). Six image views
// in one session cost 229,373 tokens — 73% of an entire two-section build. The pack previously
// claimed "~1-2k tokens" per image, which is wrong by 20-60x, and every image rule was calibrated
// on that wrong number.
//
// Rule 1 (RENDER IS GROUND TRUTH) exists because flat values hide things: per-character gradients,
// backdrop blur, layered shadows, opacity stacks, element overlaps, true text wrap points. That rule
// needs those FACTS — not a picture. This emits them as ~40 lines of text (a few hundred tokens),
// so Rule 1 is satisfied at 1/100th the cost and an image view becomes a last-resort diagnostic.
//
// Usage: node ref-digest.js <image.png> [--grid=6x4] [--min-cluster=400] [--json]
//
// Reports:
//   backdrop        the dominant border colour + how much of the frame it covers
//   alpha           transparent / soft-edge pixel share (0 transparent on a node export = white canvas)
//   ink clusters    non-backdrop regions: bbox, coverage, mean colour, colour spread
//   GRADIENT        per cluster, a monotonic colour ramp along x or y with both endpoint colours
//                   — this is what catches a per-character gradient headline that JSON reports as solid
//   TEXT            line count, line pitch, per-line x-extent (= the true wrap points) and ink colour
//   SOFT EDGE       share of boundary pixels at intermediate luminance → blur / glow / shadow present
//   OVERLAP         clusters whose bounding boxes intersect → layered composition, not a flat row
const fs = require('fs'); const path = require('path');
let PNG; try { PNG = require('pngjs').PNG } catch (e) {
  try { PNG = require(path.join(__dirname, '..', 'node_modules', 'pngjs')).PNG }
  catch (e2) { PNG = require(path.join(require('os').homedir(), 'node_modules', 'pngjs')).PNG }
}
const argv = process.argv.slice(2);
const pos = argv.filter(a => !a.startsWith('--'));
const flag = (n, d) => { const f = argv.find(x => x === `--${n}` || x.startsWith(`--${n}=`)); return f === undefined ? d : (f.includes('=') ? f.split('=').slice(1).join('=') : true); };
const file = pos[0];
if (!file || !fs.existsSync(file)) { console.error('usage: node ref-digest.js <image.png> [--grid=6x4] [--min-cluster=400] [--json]'); process.exit(2) }
const JSONOUT = !!flag('json', false);
const MINC = +flag('min-cluster', 400);
const p = PNG.sync.read(fs.readFileSync(file));
const W = p.width, H = p.height;
const at = (x, y) => { const i = ((y * W + x) << 2); return [p.data[i], p.data[i + 1], p.data[i + 2], p.data[i + 3]] };
const lum = c => c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
const hex = c => '#' + c.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
const near = (a, b, t) => Math.abs(a[0] - b[0]) <= t && Math.abs(a[1] - b[1]) <= t && Math.abs(a[2] - b[2]) <= t;

// ---------- backdrop from the border ring ----------
const tally = new Map();
const addRing = (x, y) => { const c = at(x, y); const k = c[3] < 8 ? 'T' : c.slice(0, 3).join(','); tally.set(k, (tally.get(k) || 0) + 1) };
for (let x = 0; x < W; x++) { addRing(x, 0); addRing(x, H - 1) }
for (let y = 0; y < H; y++) { addRing(0, y); addRing(W - 1, y) }
let bkey = null, bn = 0; for (const [k, v] of tally) if (v > bn) { bn = v; bkey = k }
const backdrop = bkey === 'T' ? null : bkey.split(',').map(Number);
const ringShare = bn / (2 * (W + H));

// ---------- alpha + backdrop coverage ----------
let transparent = 0, soft = 0, bgpx = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const c = at(x, y);
  if (c[3] < 8) transparent++; else if (c[3] < 248) soft++;
  if (backdrop && c[3] > 8 && near(c, backdrop, 6)) bgpx++;
}

// ---------- ink mask + clusters (grid-coarse union-find, cheap) ----------
const isInk = (x, y) => { const c = at(x, y); if (c[3] < 8) return false; return backdrop ? !near(c, backdrop, 10) : lum(c) < 245 };
const CELL = 4;                                      // coarse grid keeps this O(n) and fast on 1920x900
const gw = Math.ceil(W / CELL), gh = Math.ceil(H / CELL);
const occ = new Uint8Array(gw * gh);
for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
  let n = 0;
  for (let y = gy * CELL; y < Math.min(H, gy * CELL + CELL); y++)
    for (let x = gx * CELL; x < Math.min(W, gx * CELL + CELL); x++) if (isInk(x, y)) n++;
  if (n >= 2) occ[gy * gw + gx] = 1;
}
const lab = new Int32Array(gw * gh).fill(-1);
const clusters = [];
for (let i = 0; i < occ.length; i++) {
  if (!occ[i] || lab[i] !== -1) continue;
  const id = clusters.length; const stack = [i]; lab[i] = id;
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, cells = 0;
  while (stack.length) {
    const k = stack.pop(); const gx = k % gw, gy = (k - gx) / gw; cells++;
    if (gx < minX) minX = gx; if (gx > maxX) maxX = gx; if (gy < minY) minY = gy; if (gy > maxY) maxY = gy;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const nx = gx + dx, ny = gy + dy; if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
      const nk = ny * gw + nx; if (occ[nk] && lab[nk] === -1) { lab[nk] = id; stack.push(nk) }
    }
  }
  clusters.push({ id, x: minX * CELL, y: minY * CELL, w: (maxX - minX + 1) * CELL, h: (maxY - minY + 1) * CELL, cells });
}
// Merge clusters that belong to the same text line: words separate into their own clusters because
// spaces break connectivity, which hides the one thing Rule 1 wants most — the true wrap points.
// Two clusters join when their vertical bands overlap materially and the horizontal gap is small.
function mergeTextRuns(list) {
  const out = list.slice();
  let joined = true;
  while (joined) {
    joined = false;
    for (let i = 0; i < out.length && !joined; i++) for (let j = i + 1; j < out.length; j++) {
      const a = out[i], b = out[j];
      const ov = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      const minH = Math.min(a.h, b.h);
      if (ov < minH * 0.6) continue;                                  // not the same line
      if (Math.abs(a.h - b.h) > Math.max(6, minH * 0.5)) continue;    // very different type sizes
      const gap = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w);
      if (gap > Math.max(12, minH * 1.2)) continue;                   // too far apart to be one line
      const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y);
      out[i] = { id: Math.min(a.id, b.id), x: x0, y: y0, merged: (a.merged || 1) + (b.merged || 1),
        w: Math.max(a.x + a.w, b.x + b.w) - x0, h: Math.max(a.y + a.h, b.y + b.h) - y0,
        cells: a.cells + b.cells };
      out.splice(j, 1); joined = true; break;
    }
  }
  return out;
}
// Then stack single lines of the same block (same left edge, even vertical pitch) so multi-line
// headlines report as ONE text block with per-line extents.
function stackLines(list) {
  const out = list.slice();
  let joined = true;
  while (joined) {
    joined = false;
    for (let i = 0; i < out.length && !joined; i++) for (let j = i + 1; j < out.length; j++) {
      const a = out[i], b = out[j];
      const [top, bot] = a.y <= b.y ? [a, b] : [b, a];
      const vgap = bot.y - (top.y + top.h);
      if (vgap < -2 || vgap > Math.max(10, top.h * 1.1)) continue;     // not the next line down
      if (Math.abs(a.x - b.x) > Math.max(8, Math.min(a.w, b.w) * 0.12)) continue;  // not left-aligned
      if (Math.abs(a.h - b.h) > Math.max(6, Math.min(a.h, b.h) * 0.5)) continue;
      const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y);
      out[i] = { id: Math.min(a.id, b.id), x: x0, y: y0, merged: (a.merged || 1) + (b.merged || 1),
        w: Math.max(a.x + a.w, b.x + b.w) - x0, h: Math.max(a.y + a.h, b.y + b.h) - y0,
        cells: a.cells + b.cells };
      out.splice(j, 1); joined = true; break;
    }
  }
  return out;
}
let merged = stackLines(mergeTextRuns(clusters.filter(c => c.w * c.h >= MINC / 4)));
merged.sort((a, b) => (b.w * b.h) - (a.w * a.h));
const kept = merged.filter(c => c.w * c.h >= MINC).slice(0, 12);

// ---------- per cluster: colour, gradient, text lines, soft edges ----------
for (const c of kept) {
  const x1 = Math.min(W, c.x + c.w), y1 = Math.min(H, c.y + c.h);
  let n = 0, sum = [0, 0, 0], mn = [255, 255, 255], mx = [0, 0, 0];
  const colByX = new Map(), colByY = new Map(); const rowInk = new Array(y1 - c.y).fill(0);
  const rowMinX = new Array(y1 - c.y).fill(1e9), rowMaxX = new Array(y1 - c.y).fill(-1);
  let boundary = 0, softEdge = 0;
  for (let y = c.y; y < y1; y++) for (let x = c.x; x < x1; x++) {
    if (!isInk(x, y)) continue;
    const col = at(x, y); n++;
    for (let i = 0; i < 3; i++) { sum[i] += col[i]; if (col[i] < mn[i]) mn[i] = col[i]; if (col[i] > mx[i]) mx[i] = col[i] }
    const bx = Math.floor((x - c.x) / Math.max(1, Math.floor(c.w / 8)));
    const by = Math.floor((y - c.y) / Math.max(1, Math.floor(c.h / 8)));
    if (!colByX.has(bx)) colByX.set(bx, [0, 0, 0, 0]); const ax = colByX.get(bx);
    if (!colByY.has(by)) colByY.set(by, [0, 0, 0, 0]); const ay = colByY.get(by);
    for (let i = 0; i < 3; i++) { ax[i] += col[i]; ay[i] += col[i] } ax[3]++; ay[3]++;
    const r = y - c.y; rowInk[r]++; if (x < rowMinX[r]) rowMinX[r] = x; if (x > rowMaxX[r]) rowMaxX[r] = x;
    // boundary = ink pixel with a non-ink neighbour
    if (!isInk(Math.min(W - 1, x + 1), y) || !isInk(Math.max(0, x - 1), y) || !isInk(x, Math.min(H - 1, y + 1)) || !isInk(x, Math.max(0, y - 1))) {
      boundary++; const l = lum(col), lb = backdrop ? lum(backdrop) : 255;
      const t = Math.abs(l - lb) / Math.max(1, Math.abs(lb - lum(mn))); if (t > 0.15 && t < 0.85) softEdge++;
    }
  }
  if (!n) { c.empty = true; continue }
  c.coverage = +(100 * n / (c.w * c.h)).toFixed(1);
  c.mean = hex(sum.map(v => v / n));
  c.spread = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
  c.softEdgePct = boundary ? +(100 * softEdge / boundary).toFixed(0) : 0;
  // gradient: monotonic ramp of mean luminance across bands
  const ramp = (m) => {
    const ks = [...m.keys()].sort((a, b) => a - b).filter(k => m.get(k)[3] > 8);
    if (ks.length < 4) return null;
    const cols = ks.map(k => { const a = m.get(k); return [a[0] / a[3], a[1] / a[3], a[2] / a[3]] });
    const ls = cols.map(lum);
    let up = 0, dn = 0; for (let i = 1; i < ls.length; i++) { if (ls[i] > ls[i - 1] + 0.6) up++; else if (ls[i] < ls[i - 1] - 0.6) dn++ }
    const mono = Math.max(up, dn) / (ls.length - 1);
    const range = Math.max(...ls) - Math.min(...ls);
    if (mono >= 0.75 && range >= 18) return { from: hex(cols[0]), to: hex(cols[cols.length - 1]), range: Math.round(range) };
    return null;
  };
  c.gradX = ramp(colByX); c.gradY = ramp(colByY);
  // text lines: runs of rows with ink, separated by gaps
  const lines = []; let start = -1;
  for (let r = 0; r < rowInk.length; r++) {
    const on = rowInk[r] > Math.max(1, c.w * 0.01);
    if (on && start < 0) start = r;
    if ((!on || r === rowInk.length - 1) && start >= 0) {
      const end = on ? r : r - 1;
      if (end - start >= 2) lines.push({ top: c.y + start, h: end - start + 1, x0: Math.min(...rowMinX.slice(start, end + 1).filter(v => v < 1e9)), x1: Math.max(...rowMaxX.slice(start, end + 1)) });
      start = -1;
    }
  }
  if (lines.length >= 1 && lines.length <= 14) {
    const pitches = []; for (let i = 1; i < lines.length; i++) pitches.push(lines[i].top - lines[i - 1].top);
    const avg = pitches.length ? pitches.reduce((a, b) => a + b, 0) / pitches.length : 0;
    const even = pitches.length ? pitches.every(v => Math.abs(v - avg) <= Math.max(2, avg * 0.18)) : true;
    // Report the line bands either way. An uneven pitch is NOT noise — it means this block holds more
    // than one type size (headline + body + button), which is itself worth knowing before building.
    c.text = {
      lines: lines.length, pitch: Math.round(avg), even, glyphH: lines[0].h,
      bands: lines.map(l => `y${l.top}+${l.h} x${l.x0}-${l.x1}`)
    };
  }
}

// ---------- overlaps ----------
const overlaps = [];
for (let i = 0; i < kept.length; i++) for (let j = i + 1; j < kept.length; j++) {
  const a = kept[i], b = kept[j];
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  if (ix > 4 && iy > 4) overlaps.push(`#${a.id}x#${b.id} ${ix}x${iy}px`);
}

const digest = {
  file: path.basename(file), size: `${W}x${H}`,
  backdrop: backdrop ? hex(backdrop) : 'transparent',
  backdropBorderShare: +(100 * ringShare).toFixed(0),
  backdropFrameShare: +(100 * bgpx / (W * H)).toFixed(1),
  transparentPct: +(100 * transparent / (W * H)).toFixed(1),
  softAlphaPct: +(100 * soft / (W * H)).toFixed(1),
  clusters: kept.filter(c => !c.empty).map(c => ({
    id: c.id, box: `${c.x},${c.y} ${c.w}x${c.h}`, coverage: c.coverage, mean: c.mean, spread: c.spread,
    gradient: c.gradX ? `along-x ${c.gradX.from} -> ${c.gradX.to} (Δlum ${c.gradX.range})`
      : c.gradY ? `along-y ${c.gradY.from} -> ${c.gradY.to} (Δlum ${c.gradY.range})` : null,
    text: c.text || null, softEdgePct: c.softEdgePct
  })),
  overlaps
};

if (JSONOUT) { console.log(JSON.stringify(digest, null, 1)); process.exit(0) }
console.log(`DIGEST ${digest.file}  ${digest.size}  backdrop ${digest.backdrop} (border ${digest.backdropBorderShare}%, frame ${digest.backdropFrameShare}%)`);
console.log(`  alpha: transparent ${digest.transparentPct}% · soft ${digest.softAlphaPct}%`
  + (digest.transparentPct === 0 && digest.backdrop === '#FFFFFF' ? '   <-- opaque WHITE canvas: isolated-node export, wrong backdrop for an overlay section' : ''));
for (const c of digest.clusters) {
  console.log(`  #${c.id} ${c.box}  ink ${c.coverage}%  mean ${c.mean}  spread ${c.spread}  soft-edge ${c.softEdgePct}%`);
  if (c.gradient) console.log(`      GRADIENT ${c.gradient}   <-- flat values would report a single colour`);
  if (c.text) console.log(`      TEXT ${c.text.lines} line band(s) · pitch ${c.text.pitch}px${c.text.even ? ' (even)' : ' (UNEVEN — more than one type size in this block)'} · first glyph band ${c.text.glyphH}px`
    + `
           lines: ${c.text.bands.join(' | ')}   <-- x-extents ARE the true wrap points`);
  if (c.softEdgePct >= 45) console.log(`      SOFT EDGE ${c.softEdgePct}% of boundary is intermediate — blur / glow / shadow present`);
}
if (overlaps.length) console.log('  OVERLAP ' + overlaps.join(', ') + '  <-- layered composition, not a flat row');
