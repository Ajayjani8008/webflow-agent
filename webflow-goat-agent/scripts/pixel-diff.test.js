#!/usr/bin/env node
// pixel-diff.test.js — regression suite for the strict (v1.9.0) pixel-diff gate.
// Generates synthetic sections, runs the real CLI on each pair, asserts the verdict matrix.
// Usage: node pixel-diff.test.js        (exit 0 = all cases behave as specified)
//
// Why these five cases: each one is a hole the pre-1.9.0 gate had, or a false-positive risk the
// strict gate must NOT introduce. Run this after touching pixel-diff.js, before trusting a score.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const HERE = __dirname;
function req(name) {
  const roots = [path.join(HERE, '..'), os.homedir(), HERE];
  for (const r of roots) { try { return require(require.resolve(name, { paths: [path.join(r, 'node_modules'), r] })); } catch (e) {} }
  console.error(`missing dep ${name} — run npm install in ~/docs/memory/webflow`); process.exit(2);
}
const { PNG } = req('pngjs');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-pxtest-'));
const W = 600, H = 800;

// a plausible section: dark header band, headline block, badge, CTA button
const base = (x, y) => {
  if (y < 120) return [20, 30, 60];
  if (y < 160 && x > 40 && x < 420) return [240, 240, 250];
  if (y >= 250 && y < 330 && x >= 430 && x < 520) return [255, 90, 0];   // badge  (1.5% of canvas)
  if (y > 600 && y < 700 && x > 40 && x < 200) return [45, 140, 220];    // CTA    (3.3% of canvas)
  return [250, 250, 252];
};

function write(name, h, fn) {
  const p = new PNG({ width: W, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, c = fn(x, y);
    p.data[i] = c[0]; p.data[i + 1] = c[1]; p.data[i + 2] = c[2]; p.data[i + 3] = 255;
  }
  const f = path.join(DIR, name + '.png');
  fs.writeFileSync(f, PNG.sync.write(p));
  return f;
}

const REF = write('ref', H, base);
const IDENTICAL = write('identical', H, base);
// antialiasing / font-hinting style jitter on ~3% of pixels — must NOT fail
const NOISE = write('noise', H, (x, y) => { const c = base(x, y).slice(); if (((x * 31 + y * 17) % 33) === 0) c[0] = Math.min(255, c[0] + 12); return c; });
// same content, 200px taller (25% delta) — the crop blind spot
const TALLER = write('taller', 1000, (x, y) => (y < H ? base(x, y) : [250, 250, 252]));
// badge never rendered: 1.5% of pixels → 98.5% global, above the old 97% bar, but one region is destroyed
const HIDDEN = write('hidden', H, (x, y) => (y >= 250 && y < 330 && x >= 430 && x < 520 ? [250, 250, 252] : base(x, y)));
// CTA wrong colour: 3.3% → fails globally too (sanity: strictness did not break the basic case)
const BROKEN = write('broken', H, (x, y) => (y > 600 && y < 700 && x > 40 && x < 200 ? [220, 40, 40] : base(x, y)));

const CLI = path.join(HERE, 'pixel-diff.js');
function run(built) {
  try {
    const out = execFileSync(process.execPath, [CLI, REF, built, '--json'], { encoding: 'utf8' });
    return { code: 0, res: JSON.parse(out) };
  } catch (e) {
    const stdout = (e.stdout || '').toString();
    return { code: e.status, res: stdout ? JSON.parse(stdout) : null };
  }
}

const cases = [
  { name: 'identical',            file: IDENTICAL, verdict: 'PASS', because: 'byte-identical capture' },
  { name: 'antialiasing noise 3%',file: NOISE,     verdict: 'PASS', because: 'resampling/hinting tolerance must not fail a good build' },
  { name: '200px too tall',       file: TALLER,    verdict: 'FAIL', reason: /height delta/,  because: 'PASSed pre-1.9.0 — crop hid it' },
  { name: 'badge missing (1.5%)', file: HIDDEN,    verdict: 'FAIL', reason: /concentrated/,  because: 'PASSed pre-1.9.0 at 98.5% global' },
  { name: 'CTA wrong colour 3.3%',file: BROKEN,    verdict: 'FAIL', reason: /global match/,  because: 'basic global-drift case still fails' }
];

let bad = 0;
console.log(`pixel-diff regression — ${cases.length} cases  (fixtures: ${DIR})\n`);
for (const c of cases) {
  const { code, res } = run(c.file);
  const okVerdict = res && res.verdict === c.verdict;
  const okCode = code === (c.verdict === 'PASS' ? 0 : 1);
  const okReason = !c.reason || (res && res.fails.some(f => c.reason.test(f)));
  const ok = okVerdict && okCode && okReason;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${c.name.padEnd(24)} expected ${c.verdict}, got ${res ? res.verdict : 'ERROR'} (${res ? res.match : '?'}%, exit ${code})`);
  console.log(`      ${c.because}${res && res.fails.length ? `\n      → ${res.fails.join('\n      → ')}` : ''}`);
}
console.log(`\n${bad ? `FAILED: ${bad}/${cases.length} case(s) misbehaved` : `all ${cases.length} cases behave as specified`}`);
process.exit(bad ? 1 : 0);
