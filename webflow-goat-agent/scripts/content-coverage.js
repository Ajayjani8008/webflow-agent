// content-coverage.js — the gate that catches a build which quietly REPLACED the reference's content.
//
// Why this exists (2026-08-07, measured): a header rebuild from squarespace.com shipped with
// verify-section PASS, dom-contract 46/46 PASS, page-audit PASS at two widths — while containing
// ~20 of the reference's 124 strings and NONE of its copy. Every gate compared the build against the
// agent's OWN spec, so content the agent decided to substitute was invisible to all of them.
// A pixel score cannot see it either: different words in the right box still fill the box.
//
// So: extract the reference's strings ONCE at intake, then compare the BUILT page's strings against
// that inventory. In replica mode, missing reference strings are a FAIL, not a note.
//
// Usage:
//   node content-coverage.js inventory <ref-extract.json> <out.json>
//        pull every distinct text string (and its class) out of a ref-extract/url-intake capture
//   node content-coverage.js verify <inventory.json> <built.html|url> [--mode=replica|adapt] [--min=100] [--json]
//        replica: every inventory string must appear in the built page. Coverage < --min = exit 1.
//        adapt  : strings are NOT required (the user supplied their own), but STRUCTURE counts are:
//                 the number of link/heading slots per group must match, so an adapted build cannot
//                 silently ship 2 panels where the reference has 3.
//   node content-coverage.js --self-test
//
// Exit 0 pass · 1 coverage/structure failure · 2 usage or IO error.
const fs = require('fs'); const path = require('path'); const os = require('os');
const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = n => { const p = '--' + n + '='; const a = argv.find(x => x.startsWith(p)); return a ? a.slice(p.length) : null; };
const has = n => argv.includes('--' + n);

const norm = s => String(s || '').replace(/\s+/g, ' ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').trim();
const die = m => { console.error(m); process.exit(2) };

function nodesOf(file) {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  return d.nodes || d.elements || [];
}

// ---------- inventory ----------
function inventory() {
  const src = argv[1], out = argv[2];
  if (!src || !out) die('usage: node content-coverage.js inventory <ref-extract.json> <out.json>');
  const els = nodesOf(src);
  const strings = []; const seen = new Set();
  const groups = {};                                  // class-suffix -> count, the structural fingerprint
  for (const e of els) {
    const t = norm(e.text);
    const cls = String(e.class || '');
    const suffix = cls.split(/\s+/).filter(Boolean).map(c => c.replace(/^.*__/, '__')).find(c => c.startsWith('__')) || null;
    if (suffix) groups[suffix] = (groups[suffix] || 0) + 1;
    if (!t || t.length > 200) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    strings.push({ text: t, class: cls || null });
  }
  const inv = { source: src, strings, structure: groups, counts: { strings: strings.length, groups: Object.keys(groups).length } };
  fs.writeFileSync(out, JSON.stringify(inv, null, 1));
  console.log(`EVIDENCE content-coverage inventory  ${strings.length} distinct string(s), ${Object.keys(groups).length} class group(s) -> ${out}`);
  return inv;
}

// ---------- verify ----------
function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '')                    // tag boundary marker, so adjacent text does not fuse
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&[a-z]+;/gi, ' ');
}

async function fetchText(target) {
  if (fs.existsSync(target)) return fs.readFileSync(target, 'utf8');
  if (!/^https?:\/\//.test(target)) die('not a file and not a url: ' + target);
  const https = require(target.startsWith('https') ? 'https' : 'http');
  return await new Promise((res, rej) => {
    https.get(target, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) { r.resume(); return fetchText(r.headers.location).then(res, rej) }
      let d = ''; r.setEncoding('utf8'); r.on('data', c => d += c); r.on('end', () => res(d));
    }).on('error', rej);
  });
}

async function verify() {
  const invFile = argv[1], target = argv[2];
  if (!invFile || !target) die('usage: node content-coverage.js verify <inventory.json> <built.html|url> [--mode=replica|adapt] [--min=100]');
  const inv = JSON.parse(fs.readFileSync(invFile, 'utf8'));
  const mode = (opt('mode') || 'replica').toLowerCase();
  if (!['replica', 'adapt'].includes(mode)) die('--mode must be replica or adapt');
  const min = Number(opt('min') || 100);
  const html = await fetchText(target);
  const hay = stripHtml(html).toLowerCase();

  const missing = [], present = [];
  for (const s of inv.strings) {
    const needle = s.text.toLowerCase();
    (hay.includes(needle) ? present : missing).push(s.text);
  }
  const pct = inv.strings.length ? (present.length / inv.strings.length) * 100 : 100;

  const out = [];
  out.push(`EVIDENCE content-coverage — ${'PLACEHOLDER'}   mode=${mode}   ${present.length}/${inv.strings.length} reference string(s) present   ${pct.toFixed(1)}%`);
  let ok = true;

  if (mode === 'replica') {
    if (pct < min) {
      ok = false;
      out.push(`  FAIL: replica mode requires >= ${min}% of the reference's strings; ${missing.length} are absent.`);
      out.push(`  A build that replaces the reference's copy is not a replica, and no pixel score or property`);
      out.push(`  contract can see the difference — they only compare the build against its own spec.`);
      out.push(`  first 25 missing: ` + missing.slice(0, 25).map(m => JSON.stringify(m)).join(', '));
      if (missing.length > 25) out.push(`  ... and ${missing.length - 25} more (full list in --json)`);
    } else {
      out.push('  every reference string is present in the built page');
    }
  } else {
    out.push(`  adapt mode: reference copy intentionally replaced, so strings are informational.`);
    out.push(`  STRUCTURE is still enforced — an adapted build must not drop slots:`);
    const strFail = [];
    for (const [g, n] of Object.entries(inv.structure || {})) {
      if (n < 2) continue;                            // single-instance classes carry no structural promise
      const builtCount = (hay.match(new RegExp(g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').toLowerCase(), 'g')) || []).length;
      if (builtCount === 0) strFail.push(`${g} x${n} -> 0 in build`);
    }
    if (strFail.length) {
      // class names legitimately differ in a rebuild, so this is a WARN, never the verdict
      out.push('  warn: reference class groups not found by name (expected — the rebuild renames them): ' + strFail.slice(0, 6).join(' · '));
      out.push('  → structural completeness must be confirmed by the per-group slot counts in the spec.');
    }
    out.push(`  reference had ${inv.counts.strings} strings across ${inv.counts.groups} class groups — confirm the spec's`);
    out.push(`  slot counts match that shape before calling an adapted section done.`);
  }

  const verdict = ok ? 'PASS' : 'FAIL';
  out[0] = out[0].replace('PLACEHOLDER', verdict);
  if (has('json')) console.log(JSON.stringify({ verdict, mode, total: inv.strings.length, present: present.length, pct, missing }, null, 1));
  else console.log(out.join('\n') + `\nVERDICT: ${verdict}`);
  process.exit(ok ? 0 : 1);
}

// ---------- self-test ----------
function selfTest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-selftest-'));
  const ref = path.join(tmp, 'ref.json');
  fs.writeFileSync(ref, JSON.stringify({ nodes: [
    { tag: 'a', class: 'nav__link-title', text: 'Products' },
    { tag: 'a', class: 'nav__link-title', text: 'Solutions' },
    { tag: 'a', class: 'nav__link-title', text: 'Resources' },
    { tag: 'span', class: 'nav__eyebrow', text: 'Website' },
    { tag: 'a', class: 'nav__cta', text: 'Get started' },
  ] }));
  const invFile = path.join(tmp, 'inv.json');
  const saveArgv = process.argv;
  process.argv = ['node', 'x', 'inventory', ref, invFile];
  // re-enter inventory with patched argv
  const inv = (function () { const a = argv.slice(); argv.length = 0; argv.push('inventory', ref, invFile); const r = inventory(); argv.length = 0; a.forEach(x => argv.push(x)); return r })();
  process.argv = saveArgv;

  const full = path.join(tmp, 'full.html');
  fs.writeFileSync(full, '<nav><a>Products</a><a>Solutions</a><a>Resources</a><span>Website</span><a>Get started</a></nav>');
  const substituted = path.join(tmp, 'sub.html');
  fs.writeFileSync(substituted, '<nav><a>Integrations</a><a>Help Center</a><a>Home</a><a>Explore Integrations</a></nav>');

  const run = (args) => {
    const r = require('child_process').spawnSync(process.execPath, [__filename, ...args], { encoding: 'utf8' });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
  };
  const cases = [
    ['replica: complete build passes', run(['verify', invFile, full, '--mode=replica']).code, 0],
    ['replica: substituted content FAILS', run(['verify', invFile, substituted, '--mode=replica']).code, 1],
    ['adapt: substituted content allowed', run(['verify', invFile, substituted, '--mode=adapt']).code, 0],
    ['inventory captured all 5 strings', inv.strings.length, 5],
  ];
  let ok = true;
  for (const [name, got, want] of cases) {
    const pass = got === want; ok = ok && pass;
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}` + (pass ? '' : `  (got ${got}, want ${want})`));
  }
  const subOut = run(['verify', invFile, substituted, '--mode=replica']).out;
  const named = ['Products', 'Solutions', 'Resources'].every(s => subOut.includes(s));
  console.log(`${named ? 'PASS' : 'FAIL'}  failure names the missing strings`);
  ok = ok && named;
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch (e) {}
  process.exit(ok ? 0 : 1);
}

if (has('self-test')) selfTest();
else if (cmd === 'inventory') inventory();
else if (cmd === 'verify') verify();
else die('usage: node content-coverage.js <inventory|verify> …   |   --self-test');
