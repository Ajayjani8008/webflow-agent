// plan-diff.js — did you build the PLAN, or a fraction of it?
//
// Why this exists (measured 2026-08-07): every gate in this pack verifies the things that EXIST. Property
// equality checks the classes you created. A pixel score compares the region you captured. The a11y audit
// walks the DOM you shipped. So a build that creates 30 of a plan's 582 nodes can be flawless in all of them
// — the same failure as shipping 1.4% of a reference's strings, one level up: structural omission is
// invisible to correctness checks. A header build proved it, and only a human eye caught it.
//
// So: compare the compiled plan against the built page. Classes, element types, and every string.
//
// Usage:
//   node plan-diff.js verify <plan.json> <built.html|url> [--min-class=100] [--min-string=100] [--json]
//   node plan-diff.js --self-test
//
// Exit 0 the build carries the plan · 1 something in the plan never made it · 2 usage/IO error.
//
// It reads the PUBLISHED MARKUP, not the Designer: no MCP calls, no tokens beyond the fetch, and it sees
// what a visitor sees. Class names in `class="…"`, strings in text nodes, types inferred from tags.
const fs = require('fs'); const path = require('path'); const os = require('os');
const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = n => { const p = '--' + n + '='; const a = argv.find(x => x.startsWith(p)); return a ? a.slice(p.length) : null; };
const has = n => argv.includes('--' + n);
const die = m => { console.error(m); process.exit(2) };
const norm = s => String(s || '').replace(/\s+/g, ' ').trim();

// Webflow renders these element types as these tags. Used to count structure, not to be exact about
// wrappers Webflow adds of its own accord (which is why the type check is a WARN and classes/strings FAIL).
const TYPE_TAG = {
  DivBlock: 'div', Container: 'div', Section: 'section', Heading: 'h', TextBlock: 'div', Paragraph: 'p',
  Button: 'a', TextLink: 'a', LinkBlock: 'a', Image: 'img', RichText: 'div', Blockquote: 'blockquote',
  Video: 'div', YouTubeVideo: 'div', Form: 'form', Tabs: 'div', Slider: 'div', Dropdown: 'div', DOM: null,
};

function walk(node, out) {
  if (!node || typeof node !== 'object') return out;
  out.nodes++;
  const t = node.type || '?';
  out.types[t] = (out.types[t] || 0) + 1;
  for (const c of (node.styleNames || [])) out.classes.add(c);
  const txt = norm(node.setText && (node.setText.text || node.setText));
  if (txt) out.strings.push(txt);
  for (const k of (node.children || [])) walk(k, out);
  return out;
}

function readPlan(file) {
  const p = JSON.parse(fs.readFileSync(file, 'utf8'));
  const out = walk(p.tree, { nodes: 0, types: {}, classes: new Set(), strings: [] });
  for (const c of (p.classes || [])) out.classes.add(c.name);       // classes declared but perhaps unused
  return { plan: p, ...out, classes: [...out.classes] };
}

function strip(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&[a-z]+;/gi, ' ');
}

async function fetchText(target) {
  if (fs.existsSync(target)) return fs.readFileSync(target, 'utf8');
  if (!/^https?:\/\//.test(target)) die('not a file and not a url: ' + target);
  const lib = require(target.startsWith('https') ? 'https' : 'http');
  return await new Promise((res, rej) => lib.get(target, r => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) { r.resume(); return fetchText(r.headers.location).then(res, rej) }
    let d = ''; r.setEncoding('utf8'); r.on('data', c => d += c); r.on('end', () => res(d));
  }).on('error', rej));
}

async function verify() {
  const planFile = argv[1], target = argv[2];
  if (!planFile || !target) die('usage: node plan-diff.js verify <plan.json> <built.html|url> [--min-class=100] [--min-string=100]');
  const P = readPlan(planFile);
  const html = await fetchText(target);
  const text = strip(html).toLowerCase();
  const classAttr = (html.match(/class="([^"]*)"/g) || []).join(' ').toLowerCase();
  const minClass = Number(opt('min-class') || 100), minString = Number(opt('min-string') || 100);

  const missingClasses = P.classes.filter(c => !classAttr.includes(c.toLowerCase()));
  const uniqStrings = [...new Set(P.strings)];
  const missingStrings = uniqStrings.filter(s => !text.includes(s.toLowerCase()));
  const classPct = P.classes.length ? ((P.classes.length - missingClasses.length) / P.classes.length) * 100 : 100;
  const stringPct = uniqStrings.length ? ((uniqStrings.length - missingStrings.length) / uniqStrings.length) * 100 : 100;

  // structure: how many of each tag the plan implies vs how many the page has. Webflow adds wrappers of its
  // own, so a SURPLUS is normal and only a DEFICIT is evidence of omission.
  const tagDeficit = [];
  const wanted = {};
  for (const [type, n] of Object.entries(P.types)) {
    const tag = TYPE_TAG[type]; if (!tag) continue;
    wanted[tag] = (wanted[tag] || 0) + n;
  }
  for (const [tag, n] of Object.entries(wanted)) {
    const built = tag === 'h'
      ? (html.match(/<h[1-6][\s>]/gi) || []).length
      : (html.match(new RegExp('<' + tag + '[\\s>]', 'gi')) || []).length;
    if (built < n) tagDeficit.push(`<${tag}> plan ${n}, built ${built}`);
  }

  const fails = [], warns = [];
  if (classPct < minClass) fails.push(`${missingClasses.length}/${P.classes.length} planned classes never reached the page (${classPct.toFixed(1)}% present, need ${minClass}%)`);
  if (stringPct < minString) fails.push(`${missingStrings.length}/${uniqStrings.length} planned strings are absent (${stringPct.toFixed(1)}% present, need ${minString}%)`);
  if (tagDeficit.length) warns.push('structural deficit: ' + tagDeficit.slice(0, 8).join(' · '));

  const verdict = fails.length ? 'FAIL' : 'PASS';
  if (has('json')) {
    console.log(JSON.stringify({ verdict, planNodes: P.nodes, classes: { total: P.classes.length, missing: missingClasses }, strings: { total: uniqStrings.length, missing: missingStrings }, tagDeficit }, null, 1));
    process.exit(fails.length ? 1 : 0);
  }
  console.log(`EVIDENCE plan-diff — ${verdict}   plan ${P.nodes} node(s) · ${P.classes.length} class(es) · ${uniqStrings.length} string(s)`);
  console.log(`  classes on page   ${(P.classes.length - missingClasses.length)}/${P.classes.length}   ${classPct.toFixed(1)}%`);
  console.log(`  strings on page   ${(uniqStrings.length - missingStrings.length)}/${uniqStrings.length}   ${stringPct.toFixed(1)}%`);
  for (const w of warns) console.log('  warn  ' + w);
  for (const f of fails) console.log('  FAIL  ' + f);
  if (missingClasses.length) console.log('  missing classes (first 12): ' + missingClasses.slice(0, 12).join(', '));
  if (missingStrings.length) console.log('  missing strings (first 12): ' + missingStrings.slice(0, 12).map(s => JSON.stringify(s)).join(', '));
  if (fails.length) console.log('  -> the build is a SUBSET of its plan. Every other gate only checks what exists, so this is the\n     only gate that sees an omission. Build the rest before scoring anything.');
  console.log(`VERDICT: ${verdict}`);
  process.exit(fails.length ? 1 : 0);
}

function selfTest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-selftest-'));
  const plan = path.join(tmp, 'p.json');
  fs.writeFileSync(plan, JSON.stringify({
    section: 'hdr',
    classes: [{ name: 'acme__row', properties: {} }, { name: 'acme__link', properties: {} }, { name: 'acme__cta', properties: {} }],
    tree: {
      type: 'DivBlock', styleNames: ['acme__row'], children: [
        { type: 'TextLink', styleNames: ['acme__link'], setText: { text: 'Platform' } },
        { type: 'TextLink', styleNames: ['acme__link'], setText: { text: 'Docs' } },
        { type: 'TextLink', styleNames: ['acme__cta'], setText: { text: 'Start free' } },
      ],
    },
  }));
  const full = path.join(tmp, 'full.html');
  fs.writeFileSync(full, '<div class="acme__row"><a class="acme__link">Platform</a><a class="acme__link">Docs</a><a class="acme__cta">Start free</a></div>');
  const partial = path.join(tmp, 'partial.html');
  fs.writeFileSync(partial, '<div class="acme__row"><a class="acme__link">Platform</a></div>');
  const run = a => { const r = require('child_process').spawnSync(process.execPath, [__filename, ...a], { encoding: 'utf8' }); return { code: r.status, out: (r.stdout || '') + (r.stderr || '') } };

  const rFull = run(['verify', plan, full]);
  const rPart = run(['verify', plan, partial]);
  const cases = [
    ['a complete build passes', rFull.code, 0],
    ['a SUBSET of the plan FAILS', rPart.code, 1],
    ['the failure names the missing class', /acme__cta/.test(rPart.out), true],
    ['the failure names the missing strings', /Docs/.test(rPart.out) && /Start free/.test(rPart.out), true],
    ['it counts the plan, not the page', /plan 4 node\(s\)/.test(rFull.out), true],
    ['surplus wrappers do not fail it', run(['verify', plan, (() => { const f = path.join(tmp, 'surplus.html'); fs.writeFileSync(f, '<div><div class="acme__row"><div><a class="acme__link">Platform</a><a class="acme__link">Docs</a><a class="acme__cta">Start free</a></div></div></div>'); return f })()]).code, 0],
  ];
  let ok = true;
  for (const [name, got, want] of cases) { const pass = got === want; ok = ok && pass; console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}` + (pass ? '' : `  (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`)) }
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch (e) {}
  process.exit(ok ? 0 : 1);
}

if (has('self-test')) selfTest();
else if (cmd === 'verify') verify();
else die('usage: node plan-diff.js verify <plan.json> <built.html|url>   |   --self-test');
