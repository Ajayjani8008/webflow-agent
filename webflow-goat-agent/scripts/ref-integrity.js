// ref-integrity.js — assert a reference PNG is actually comparable to a capture, BEFORE scoring.
//
// Why this exists (all three measured on a real build, 2026-07-31):
//  1. WRONG BACKDROP. `get_screenshot` / `download_assets` on an isolated Figma node renders it on a
//     WHITE canvas — 0 transparent pixels — even when the node is a transparent overlay on a coloured
//     section. The header reference was white where the page is #FDF9EA: 83% of pixels differed, and
//     pixelmatch's tolerance still returned "99.11% PASS". A reference that is wrong in a way the gate
//     tolerates is worse than one that fails: it also passes WRONG BUILDS.
//  2. WRONG BOX. Scoring a full-width capture (1920) against a reference cropped to the inner bar
//     (1632) made pixel-diff upscale the reference 1.18x and invent a "16.1% height delta" plus six
//     right-edge hot regions on a build that was fine. Cost two verification runs and a publish.
//  3. WRONG DPR. References export at 1x, captures run at deviceScaleFactor 2. Resampling adds error
//     that is then attributed to the build.
//
// So: never score until the pair is provably comparable. This is a gate, not a warning.
//
// Usage:
//   node ref-integrity.js check <ref.png> <capture.png> [--bg=#RRGGBB] [--json]
//   node ref-integrity.js crop  <parentFrame.png> <out.png> <x> <y> <w> <h> [--scale=1]
//   node ref-integrity.js compose <node.png> <out.png> <frameW> <frameH> <x> <y> --bg=#RRGGBB [--drop-canvas]
//
// check   → exit 0 comparable · 1 NOT comparable (with the reason and the fix) · 2 IO error
// crop    → the CORRECT way to build a section reference: cut it out of the parent-frame render, so the
//           real backdrop and neighbouring content come with it. Prefer this over composing.
// compose → fallback when only an isolated node export exists. --drop-canvas replaces the node
//           export's uniform border-touching canvas colour with --bg (the page's real section
//           background) via a flood fill from the edges, so interior white artwork is preserved.
const fs = require('fs'); const path = require('path');
let PNG; try { PNG = require('pngjs').PNG } catch (e) {
  try { PNG = require(path.join(__dirname, '..', 'node_modules', 'pngjs')).PNG }
  catch (e2) { PNG = require(path.join(require('os').homedir(), 'node_modules', 'pngjs')).PNG }
}
const argv = process.argv.slice(2);
const pos = argv.filter(a => !a.startsWith('--'));
const flag = (n, d) => { const f = argv.find(x => x === `--${n}` || x.startsWith(`--${n}=`)); return f === undefined ? d : (f.includes('=') ? f.split('=').slice(1).join('=') : true); };
const mode = pos[0];
const JSONOUT = !!flag('json', false);
const read = p => PNG.sync.read(fs.readFileSync(p));
const hex = s => { const m = String(s || '').match(/^#?([0-9a-f]{6})$/i); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] };
const px = (p, x, y) => { const i = ((y * p.width + x) << 2); return [p.data[i], p.data[i + 1], p.data[i + 2], p.data[i + 3]] };
const setpx = (p, x, y, c) => { const i = ((y * p.width + x) << 2); p.data[i] = c[0]; p.data[i + 1] = c[1]; p.data[i + 2] = c[2]; p.data[i + 3] = 255 };
const near = (a, b, t) => Math.abs(a[0] - b[0]) <= t && Math.abs(a[1] - b[1]) <= t && Math.abs(a[2] - b[2]) <= t;

function usage(code) {
  console.error('usage: node ref-integrity.js check   <ref.png> <capture.png> [--bg=#RRGGBB] [--json]');
  console.error('       node ref-integrity.js crop    <parentFrame.png> <out.png> <x> <y> <w> <h> [--scale=1]');
  console.error('       node ref-integrity.js compose <node.png> <out.png> <frameW> <frameH> <x> <y> --bg=#RRGGBB [--drop-canvas]');
  process.exit(code);
}

// dominant colour of the 1px border ring = the canvas the node was rendered on
function borderColour(p) {
  const tally = new Map();
  const add = (x, y) => { const c = px(p, x, y); const k = c[3] < 8 ? 'T' : c.slice(0, 3).join(','); tally.set(k, (tally.get(k) || 0) + 1) };
  for (let x = 0; x < p.width; x++) { add(x, 0); add(x, p.height - 1) }
  for (let y = 0; y < p.height; y++) { add(0, y); add(p.width - 1, y) }
  let best = null, n = 0;
  for (const [k, v] of tally) if (v > n) { n = v; best = k }
  const ring = 2 * (p.width + p.height);
  return { key: best, share: n / ring, rgb: best === 'T' ? null : best.split(',').map(Number) };
}

if (mode === 'check') {
  const rp = pos[1], cp = pos[2];
  if (!rp || !cp) usage(2);
  if (!fs.existsSync(rp)) { console.error('ERR reference not found: ' + rp); process.exit(2) }
  if (!fs.existsSync(cp)) { console.error('ERR capture not found: ' + cp); process.exit(2) }
  const ref = read(rp), cap = read(cp);
  const problems = [], notes = [];

  // --- DPR: a capture is normally an integer multiple of the reference
  const rx = cap.width / ref.width, ry = cap.height / ref.height;
  const intish = v => Math.abs(v - Math.round(v)) < 0.01;
  if (!intish(rx) || !intish(ry) || Math.abs(rx - ry) > 0.01) {
    problems.push({
      kind: 'box-mismatch',
      detail: `reference ${ref.width}x${ref.height} vs capture ${cap.width}x${cap.height} — ratio ${rx.toFixed(3)}x${ry.toFixed(3)} is not a uniform integer scale`,
      fix: 'the two images do not describe the same box. Re-cut the reference to the captured element box (ref-integrity.js crop), or capture the element the reference actually shows. Do NOT let pixel-diff resample this pair — it converts a width mismatch into a fake height delta plus right-edge hot regions.'
    });
  } else if (Math.round(rx) !== 1) {
    notes.push(`DPR ${Math.round(rx)}x capture vs 1x reference — comparable, downsampled at score time`);
  }

  // --- backdrop: isolated-node exports arrive on an opaque white canvas
  const rb = borderColour(ref), cb = borderColour(cap);
  const want = hex(flag('bg', ''));
  const transparentPx = (() => { let n = 0; for (let i = 3; i < ref.data.length; i += 4) if (ref.data[i] < 8) n++; return n })();
  if (rb.share > 0.6 && cb.share > 0.6 && rb.key !== 'T' && cb.key !== 'T' && !near(rb.rgb, cb.rgb, 6)) {
    problems.push({
      kind: 'backdrop-mismatch',
      detail: `reference backdrop rgb(${rb.rgb.join(',')}) (${(rb.share * 100).toFixed(0)}% of border) vs capture rgb(${cb.rgb.join(',')}) (${(cb.share * 100).toFixed(0)}%)`,
      fix: `the reference was rendered on a different canvas than the page. Crop the section out of its PARENT frame render (ref-integrity.js crop) so the real backdrop travels with it, or compose it: ref-integrity.js compose <node.png> <out> <w> <h> <x> <y> --bg=rgb(${cb.rgb.join(',')}) --drop-canvas`
    });
  }
  if (want && rb.key !== 'T' && !near(rb.rgb, want, 6)) {
    problems.push({
      kind: 'backdrop-not-expected',
      detail: `reference backdrop rgb(${rb.rgb.join(',')}) != expected --bg ${flag('bg', '')}`,
      fix: 'rebuild the reference on the expected background before scoring'
    });
  }
  if (transparentPx === 0 && rb.key === '255,255,255') {
    notes.push('reference is fully opaque with a white border ring — the classic isolated-node export. If the section is an overlay, this reference is wrong even when the score looks good.');
  }

  // --- degenerate references
  const uniq = new Set(); for (let y = 0; y < ref.height; y += Math.max(1, ref.height >> 4)) for (let x = 0; x < ref.width; x += Math.max(1, ref.width >> 4)) uniq.add(px(ref, x, y).slice(0, 3).join(','));
  if (uniq.size <= 1) problems.push({ kind: 'reference-blank', detail: 'reference is a single flat colour', fix: 'the export produced nothing — check the node id and that the node renders standalone (mask groups export empty)' });
  if (ref.width <= 2 || ref.height <= 2) problems.push({ kind: 'reference-degenerate', detail: `reference is ${ref.width}x${ref.height}`, fix: 'a 1x1 or 2px export means the node does not render in isolation (Figma mask group). Export the parent and crop.' });

  const verdict = problems.length ? 'NOT-COMPARABLE' : 'COMPARABLE';
  if (JSONOUT) console.log(JSON.stringify({ verdict, ref: rp, capture: cp, problems, notes }, null, 1));
  else {
    console.log(`EVIDENCE ref-integrity — ${verdict}   ref ${ref.width}x${ref.height}  capture ${cap.width}x${cap.height}`);
    for (const n of notes) console.log('  note: ' + n);
    for (const p of problems) { console.log(`  BLOCKER ${p.kind}: ${p.detail}`); console.log(`     fix: ${p.fix}`) }
    if (!problems.length) console.log('  same box, same backdrop, non-degenerate — safe to score');
  }
  process.exit(problems.length ? 1 : 0);
}

if (mode === 'crop') {
  const [, src, out, X, Y, W, H] = pos;
  if (!src || !out || X == null || H == null) usage(2);
  const scale = +flag('scale', 1);
  const p = read(src);
  const x0 = Math.round(+X * scale), y0 = Math.round(+Y * scale), w = Math.round(+W * scale), h = Math.round(+H * scale);
  if (x0 < 0 || y0 < 0 || x0 + w > p.width || y0 + h > p.height) {
    console.error(`ERR crop ${w}x${h} at ${x0},${y0} falls outside the ${p.width}x${p.height} source`); process.exit(2);
  }
  const o = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) setpx(o, x, y, px(p, x0 + x, y0 + y));
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, PNG.sync.write(o));
  console.log(`cropped ${w}x${h} from ${x0},${y0} of ${p.width}x${p.height} -> ${out}`);
  console.log('this reference carries the real backdrop, so it is safe to score against a full-frame capture');
  process.exit(0);
}

if (mode === 'compose') {
  const [, src, out, FW, FH, X, Y] = pos;
  const bg = hex(flag('bg', ''));
  if (!src || !out || !FW || !bg) usage(2);
  const p = read(src);
  const W = +FW, H = +FH, x0 = Math.round(+X || 0), y0 = Math.round(+Y || 0);
  const o = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) setpx(o, x, y, bg);

  // optional: treat the node export's border-touching uniform colour as canvas, not artwork
  let canvas = null, dropped = 0;
  if (flag('drop-canvas', false)) {
    const b = borderColour(p);
    if (b.key !== 'T' && b.share > 0.5) canvas = b.rgb;
  }
  const seen = canvas ? new Uint8Array(p.width * p.height) : null;
  if (canvas) {                       // flood fill inward from the edges only
    const stack = [];
    for (let x = 0; x < p.width; x++) { stack.push([x, 0], [x, p.height - 1]) }
    for (let y = 0; y < p.height; y++) { stack.push([0, y], [p.width - 1, y]) }
    while (stack.length) {
      const [x, y] = stack.pop();
      if (x < 0 || y < 0 || x >= p.width || y >= p.height) continue;
      const k = y * p.width + x; if (seen[k]) continue;
      const c = px(p, x, y);
      if (!(c[3] > 8 && near(c, canvas, 6))) continue;
      seen[k] = 1; dropped++;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
    const dx = x0 + x, dy = y0 + y;
    if (dx < 0 || dy < 0 || dx >= W || dy >= H) continue;
    if (seen && seen[y * p.width + x]) continue;          // canvas pixel — let the backdrop show
    const c = px(p, x, y), a = c[3] / 255;
    if (a === 0) continue;
    const d = px(o, dx, dy);
    setpx(o, dx, dy, [0, 1, 2].map(i => Math.round(c[i] * a + d[i] * (1 - a))));
  }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, PNG.sync.write(o));
  console.log(`composed ${W}x${H} on rgb(${bg.join(',')}), node ${p.width}x${p.height} at ${x0},${y0} -> ${out}`
    + (canvas ? `  (dropped ${dropped.toLocaleString()} canvas px of rgb(${canvas.join(',')}))` : ''));
  console.log('NOTE composing is the fallback. Cropping from the parent frame render is the correct source of truth.');
  process.exit(0);
}
usage(2);
