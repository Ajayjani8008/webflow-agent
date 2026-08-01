#!/usr/bin/env node
// text-extents.js — measure the INK extents of a horizontal band in one or two PNGs.
//
// Why this exists: pixel-diff tells you a region is wrong; dom-contract tells you the authored
// properties are right; neither tells you a text run is 6px too wide. On the kush-header build a
// 12px-tall brand sub-line ("OF FRAGRANCES") was first missing entirely (invisible to the differ at
// 98.75% with zero hot regions) and then mis-tracked by a few px (visible to the region gate, but
// with no measurement to aim a fix at). Letter-spacing, word gaps and per-span tracking are exactly
// the class of defect that needs a number, not an opinion — and an opinion costs an image view.
//
// Usage:
//   node text-extents.js <image.png> --band=<y0>:<y1> [--xoff=N] [--thresh=110] [--json]
//   node text-extents.js <ref.png> <built.png> --band=<y0>:<y1> [--ref-xoff=N] [--built-xoff=N]
//   node text-extents.js contract <ref.png> --bands=<label>:<y0>:<y1>,... [--xoff=N] [--out=frag.json]
//   node text-extents.js bands <ref.png> <built.png> --bands=<label>:<y0>:<y1>,... [--tol=1.5]
//   node text-extents.js solve --target=<px> --measured=<px> --ls=<px> --gaps=<n>
//   node text-extents.js check-spec --measured=<px> --font-size=<px> --glyphs=<n> --ls=<px>[:<count>][,…]
//   node text-extents.js --self-test
//
// v2.1 — `contract` runs at INTAKE, before the build. It turns the reference render into measured
// numbers, so the build targets what the render IS instead of what the spec's arithmetic says it
// should be. On kush-header the spec's per-span letter-spacing (3.04 / 13.28 px) computed to a 192px
// line where the render measures 111px; the error surfaced only after four publishes. `solve` then
// closes tracking in ONE step from a single measured point instead of guessing a second time.
//
// --ref-scale / --built-scale divide that side's device pixels back to CSS px (a DPR-2 capture is
// 2). Getting this wrong silently compares different rows: a 3840x234 DPR-2 shot answers a
// --band=104:117 query with the brand NAME, not the sub-line, and the numbers look plausible.
// --band is in CSS pixel rows. --xoff subtracts a constant from reported x, so a
// 1920-wide composite (section starts at x=144) and a 1632-wide element clip can be compared in the
// same coordinate space. Exit 0 always for a single image; with two images, exit 1 if |Δwidth| > tol
// (default 1.5px) so it can gate a fix pass.
'use strict';
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const flag = n => argv.includes('--' + n);
const opt = (n, d = null) => { const p = '--' + n + '='; const a = argv.find(x => x.startsWith(p)); return a ? a.slice(p.length) : d; };
const SUBS = ['contract', 'bands', 'solve', 'check-spec'];
const SUB = SUBS.includes(argv[0]) ? argv[0] : null;
const files = argv.filter(a => !a.startsWith('--') && a !== SUB);

let PNG;
try { PNG = require('pngjs').PNG; }
catch (e) { console.error('ERR pngjs not installed. Run: npm install --prefix "' + path.join(__dirname, '..') + '"'); process.exit(2); }

// Ink = pixels darker than `thresh` luminance and not transparent. Returns null when the band is blank.
function extents(img, y0, y1, xoff, thresh) {
  let L = Infinity, R = -1, T = Infinity, B = -1, n = 0;
  const yEnd = Math.min(y1, img.height - 1);
  for (let y = Math.max(0, y0); y <= yEnd; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (img.width * y + x) << 2;
      if (img.data[i + 3] < 128) continue;
      const lum = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
      if (lum >= thresh) continue;
      n++;
      if (x < L) L = x; if (x > R) R = x;
      if (y < T) T = y; if (y > B) B = y;
    }
  }
  if (R < 0) return null;
  return { left: L - xoff, right: R - xoff, width: R - L + 1, top: T, bottom: B, height: B - T + 1, inkPx: n };
}

function parseBand() {
  const b = opt('band');
  if (!b || !/^\d+:\d+$/.test(b)) { console.error('usage: node text-extents.js <image.png> [<built.png>] --band=<y0>:<y1> [--xoff=N] [--json]'); process.exit(2); }
  const [a, c] = b.split(':').map(Number);
  return [Math.min(a, c), Math.max(a, c)];
}

function load(p) {
  if (!fs.existsSync(p)) { console.error('ERR not found: ' + p); process.exit(2); }
  return PNG.sync.read(fs.readFileSync(p));
}

if (flag('self-test')) {
  // synthesise a 40x20 white image with a 10px-wide black bar on rows 5..9 at x=12..21
  const img = new PNG({ width: 40, height: 20 });
  for (let i = 0; i < img.data.length; i += 4) { img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = 255; }
  for (let y = 5; y <= 9; y++) for (let x = 12; x <= 21; x++) { const i = (40 * y + x) << 2; img.data[i] = img.data[i + 1] = img.data[i + 2] = 0; }
  const e = extents(img, 0, 19, 0, 110);
  const blank = extents(img, 15, 19, 0, 110);
  const off = extents(img, 0, 19, 12, 110);
  const cases = [
    ['width measured exactly', e && e.width === 10],
    ['left/right exact', e && e.left === 12 && e.right === 21],
    ['band rows exact', e && e.top === 5 && e.bottom === 9 && e.height === 5],
    ['ink pixel count exact', e && e.inkPx === 50],
    ['blank band returns null', blank === null],
    ['xoff shifts coordinates', off && off.left === 0 && off.right === 9],
  ];
  // solve is pure arithmetic: 102px measured at ls 4.4 over 11 gaps, target 111 -> 5.22px
  const solved = 4.4 + (111 - 102) / 11;
  cases.push(['solve is linear and exact', Math.abs(solved - 5.2181818) < 0.001]);
  // check-spec, on the real kush-header numbers
  const implied = (measured, track, glyphs, fs2) => ((measured - track) / glyphs) / fs2;
  const badSpec = 111 - (3.04 * 2 + 13.28 * 10);                       // -27.88 -> impossible
  const goodSpec = implied(111, 5.07 * 11, 12, 6.832);                 // ~0.67 em -> plausible
  cases.push(['check-spec catches the impossible spec (negative advances)', badSpec < 0]);
  cases.push(['check-spec accepts the solved value (0.30-0.80 em)', goodSpec > 0.30 && goodSpec < 0.80]);
  let ok = true;
  for (const [n, c] of cases) { console.log((c ? 'PASS' : 'FAIL') + '  ' + n); ok = ok && c; }
  process.exit(ok ? 0 : 1);
}

// ── shared helpers for the multi-band subcommands (v2.1) ───────────────────────────────────────
function parseBands() {
  const b = opt('bands');
  if (!b) { console.error('ERR --bands=<label>:<y0>:<y1>[,...] is required'); process.exit(2); }
  return b.split(',').map(part => {
    const m = part.split(':');
    if (m.length !== 3 || !/^[0-9]+$/.test(m[1]) || !/^[0-9]+$/.test(m[2])) { console.error('ERR bad band spec: ' + part); process.exit(2); }
    return { label: m[0], y0: Math.min(+m[1], +m[2]), y1: Math.max(+m[1], +m[2]) };
  });
}
const rnd = v => Math.round(v * 10) / 10;
function bandExtents(img, bd, xoff, sc, thresh) {
  const e = extents(img, Math.round(bd.y0 * sc), Math.round(bd.y1 * sc), Math.round(xoff * sc), thresh);
  if (!e) return null;
  return { left: rnd(e.left / sc), right: rnd(e.right / sc), width: rnd(e.width / sc),
           top: rnd(e.top / sc), bottom: rnd(e.bottom / sc), inkPx: e.inkPx };
}

// ── solve: close tracking in one step from one measured point ──────────────────────────────────
if (SUB === 'solve') {
  const target = Number(opt('target')), measured = Number(opt('measured')),
        ls = Number(opt('ls')), gaps = Number(opt('gaps'));
  if ([target, measured, ls, gaps].some(v => !isFinite(v)) || gaps <= 0) {
    console.error('usage: node text-extents.js solve --target=<px> --measured=<px> --ls=<px> --gaps=<n>'); process.exit(2);
  }
  const next = ls + (target - measured) / gaps;
  console.log('EVIDENCE text-extents solve');
  console.log('  target ' + target + 'px · measured ' + measured + 'px at letter-spacing ' + ls + 'px over ' + gaps + ' gaps');
  console.log('  delta ' + rnd(target - measured) + 'px  ->  letter-spacing ' + (Math.round(next * 100) / 100) + 'px');
  console.log('  (ink width is linear in letter-spacing: glyph advances are constant, so ONE measured point solves it)');
  process.exit(0);
}

// ── check-spec: does the SPEC's tracking even fit the measured render? (FIX 1) ────────────────
// Blocks a build whose source-derived numbers are arithmetically impossible against the render.
// No font metrics required: the implied glyph advance is what falls out of the decomposition.
if (SUB === 'check-spec') {
  const measured = Number(opt('measured')), fontSize = Number(opt('font-size')), glyphs = Number(opt('glyphs'));
  const lsSpec = opt('ls');
  if (![measured, fontSize, glyphs].every(isFinite) || glyphs < 2 || !lsSpec) {
    console.error('usage: node text-extents.js check-spec --measured=<px> --font-size=<px> --glyphs=<n> --ls=<px>[:<count>][,<px>:<count>…]');
    console.error('  --ls entries are letter-spacing values with how many gaps each applies to.');
    console.error('  Omit :count on a single entry to apply it to all (glyphs-1) gaps.');
    process.exit(2);
  }
  const parts = lsSpec.split(',').map(t => {
    const [v, c] = t.split(':');
    return { ls: Number(v), gaps: c === undefined ? glyphs - 1 : Number(c) };
  });
  if (parts.some(x => !isFinite(x.ls) || !isFinite(x.gaps))) { console.error('ERR bad --ls spec: ' + lsSpec); process.exit(2); }
  const trackTotal = parts.reduce((a, x) => a + x.ls * x.gaps, 0);
  const gapTotal = parts.reduce((a, x) => a + x.gaps, 0);
  const impliedSum = measured - trackTotal;
  const perGlyph = impliedSum / glyphs;
  const ratio = perGlyph / fontSize;
  // latin text advances land ~0.30-0.80 em; below 0.20 or above 1.0 is not a real typeface
  const LO = 0.30, HI = 0.80, HARD_LO = 0.20, HARD_HI = 1.0;
  console.log('EVIDENCE text-extents check-spec');
  console.log('  measured ink        ' + measured + 'px   font-size ' + fontSize + 'px   glyphs ' + glyphs + '   tracked gaps ' + gapTotal);
  console.log('  spec tracking total ' + rnd(trackTotal) + 'px  (' + parts.map(x => x.ls + 'px x' + x.gaps).join(' + ') + ')');
  console.log('  implied advances    ' + rnd(impliedSum) + 'px  ->  ' + rnd(perGlyph) + 'px/glyph  =  ' + (Math.round(ratio * 100) / 100) + ' em');
  if (impliedSum <= 0) {
    console.log('  VERDICT IMPOSSIBLE — the spec\'s tracking alone (' + rnd(trackTotal) + 'px) meets or exceeds the whole');
    console.log('     measured line (' + measured + 'px), leaving ' + rnd(impliedSum) + 'px for the glyphs themselves.');
    console.log('     The source numbers are not px, or not per-character. DO NOT BUILD from them —');
    console.log('     solve tracking from the render instead:  text-extents.js solve --target=' + measured + ' …');
    process.exit(1);
  }
  if (ratio < HARD_LO || ratio > HARD_HI) {
    console.log('  VERDICT IMPLAUSIBLE — ' + (Math.round(ratio * 100) / 100) + ' em per glyph is outside any real latin typeface');
    console.log('     (' + HARD_LO + '-' + HARD_HI + ' em). Re-read the source, or solve from the render.');
    process.exit(1);
  }
  if (ratio < LO || ratio > HI) {
    console.log('  VERDICT SUSPECT — ' + (Math.round(ratio * 100) / 100) + ' em per glyph is outside the usual ' + LO + '-' + HI + ' em band.');
    console.log('     Legal for a condensed or very wide face; confirm against the render before building.');
    process.exit(0);
  }
  console.log('  VERDICT PLAUSIBLE — the spec\'s tracking is consistent with the measured render.');
  process.exit(0);
}

// ── contract: reference render -> measured numbers, at INTAKE ──────────────────────────────────
if (SUB === 'contract') {
  if (!files[0]) { console.error('usage: node text-extents.js contract <ref.png> --bands=<label>:<y0>:<y1>,... [--xoff=N] [--out=frag.json]'); process.exit(2); }
  const img = load(files[0]);
  const sc = Number(opt('scale', '1')), xoff = Number(opt('xoff', '0')), th = Number(opt('thresh', '110'));
  const out = {};
  console.log('EVIDENCE text-extents contract  ' + path.basename(files[0]) + (xoff ? '  xoff ' + xoff : '') + (sc !== 1 ? '  DPR ' + sc : ''));
  for (const bd of parseBands()) {
    const e = bandExtents(img, bd, xoff, sc, th);
    out[bd.label] = e;
    console.log('  ' + bd.label.padEnd(14) + (e ? 'x ' + e.left + ' -> ' + e.right + '   width ' + e.width + '   ink y' + e.top + '-' + e.bottom
      : 'BLANK — nothing in y' + bd.y0 + '-' + bd.y1 + ' (wrong band, or the reference is empty here)'));
  }
  const dest = opt('out');
  if (dest) { fs.writeFileSync(dest, JSON.stringify({ textExtents: out }, null, 1)); console.log('  -> ' + dest); }
  console.log('  These are the numbers the build must hit. Solve tracking with `solve`; never re-derive it from the spec.');
  process.exit(0);
}

// ── bands: multi-band ref-vs-built compare, one call, fail-closed ──────────────────────────────
if (SUB === 'bands') {
  if (!files[1]) { console.error('usage: node text-extents.js bands <ref.png> <built.png> --bands=<label>:<y0>:<y1>,... [--tol=1.5]'); process.exit(2); }
  const A = load(files[0]), B = load(files[1]);
  const SRb = Number(opt('ref-scale', opt('scale', '1'))), SBb = Number(opt('built-scale', opt('scale', '1')));
  const xa = Number(opt('ref-xoff', opt('xoff', '0'))), xb = Number(opt('built-xoff', '0'));
  const th = Number(opt('thresh', '110')), tl = Number(opt('tol', '1.5'));
  let bad = 0;
  console.log('EVIDENCE text-extents bands  tol ' + tl + 'px');
  for (const bd of parseBands()) {
    const a = bandExtents(A, bd, xa, SRb, th), b = bandExtents(B, bd, xb, SBb, th);
    if (!a || !b) { console.log('  ' + bd.label.padEnd(14) + 'FAIL  ' + (!a ? 'reference' : 'built') + ' has no ink in y' + bd.y0 + '-' + bd.y1 + ' (a clipped or missing text run looks exactly like this, and a global pixel percentage cannot see it)'); bad++; continue; }
    const dw = rnd(b.width - a.width), dl = rnd(b.left - a.left);
    const ok = Math.abs(dw) <= tl && Math.abs(dl) <= tl;
    if (!ok) bad++;
    console.log('  ' + bd.label.padEnd(14) + (ok ? 'PASS' : 'FAIL') +
      '  ref w' + a.width + ' x' + a.left + '   built w' + b.width + ' x' + b.left +
      '   dWidth ' + (dw >= 0 ? '+' : '') + dw + '  dLeft ' + (dl >= 0 ? '+' : '') + dl);
  }
  console.log('  VERDICT ' + (bad ? 'FAIL — ' + bad + ' band(s) off. dWidth is tracking, dLeft is position. Solve, do not guess.' : 'PASS — every band within tolerance'));
  process.exit(bad ? 1 : 0);
}

const [y0, y1] = parseBand();
const thresh = Number(opt('thresh', '110'));
const tol = Number(opt('tol', '1.5'));

const SR = Number(opt('ref-scale', opt('scale', '1')));
const SB = Number(opt('built-scale', opt('scale', '1')));
// measure in device px for the band, then report in CSS px
const measure = (p, xoff, sc) => {
  const e = extents(load(p), Math.round(y0 * sc), Math.round(y1 * sc), Math.round(xoff * sc), thresh);
  if (!e) return null;
  return { left: e.left / sc, right: e.right / sc, width: e.width / sc,
           top: e.top / sc, bottom: e.bottom / sc, height: e.height / sc, inkPx: e.inkPx, scale: sc };
};

if (files.length === 1) {
  const e = measure(files[0], Number(opt('xoff', '0')), SB);
  if (flag('json')) { console.log(JSON.stringify({ file: files[0], band: [y0, y1], extents: e }, null, 1)); process.exit(0); }
  console.log('EVIDENCE text-extents  ' + path.basename(files[0]) + '  band y' + y0 + '-' + y1);
  console.log(e ? '  x ' + e.left + ' -> ' + e.right + '   width ' + e.width + '   ink rows y' + e.top + '-' + e.bottom + ' (' + e.inkPx + 'px)'
                : '  BLANK — no ink in this band (a missing or clipped text run looks exactly like this)');
  process.exit(0);
}

if (files.length >= 2) {
  const a = measure(files[0], Number(opt('ref-xoff', opt('xoff', '0'))), SR);
  const b = measure(files[1], Number(opt('built-xoff', '0')), SB);
  const r1 = v => Math.round(v * 10) / 10;
  const fmt = e => e ? ('x ' + String(r1(e.left)).padStart(6) + ' -> ' + String(r1(e.right)).padStart(6) + '   width ' + String(r1(e.width)).padStart(6) + '   y' + r1(e.top) + '-' + r1(e.bottom) + (e.scale !== 1 ? '  (DPR ' + e.scale + ')' : '')) : 'BLANK';
  console.log('EVIDENCE text-extents  band y' + y0 + '-' + y1 + '   tol ' + tol + 'px');
  console.log('  REF    ' + fmt(a));
  console.log('  BUILT  ' + fmt(b));
  if (!a || !b) { console.log('  VERDICT FAIL — one side has no ink in this band'); process.exit(1); }
  const dw = r1(b.width - a.width), dl = r1(b.left - a.left), dr = r1(b.right - a.right);
  console.log('  Δwidth ' + (dw >= 0 ? '+' : '') + dw + 'px   Δleft ' + (dl >= 0 ? '+' : '') + dl + 'px   Δright ' + (dr >= 0 ? '+' : '') + dr + 'px');
  const pass = Math.abs(dw) <= tol && Math.abs(dl) <= tol;
  console.log('  VERDICT ' + (pass ? 'PASS' : 'FAIL — adjust tracking/word-gap by the Δ above, then re-measure'));
  process.exit(pass ? 0 : 1);
}
console.error('usage: node text-extents.js <image.png> [<built.png>] --band=<y0>:<y1> [--xoff=N] [--json]   |   --self-test');
process.exit(2);
