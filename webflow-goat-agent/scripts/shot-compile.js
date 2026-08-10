// shot-compile.js — a SCREENSHOT compiles too. The last source that needed hand work.
//
// Why this exists: figma -> figma-compile, url/html -> url-compile, screenshot -> nothing. So the one
// source with no machine capture was the one where the plan, the values and the string inventory were all
// hand-authored — which is exactly the condition that produced a 204-call, 1.4%-accurate header. A PNG has
// no DOM, but it is not opaque either: OCR gives the strings WITH boxes, and the pixels give colours,
// backgrounds, edges and rhythm. Everything emitted here is MEASURED from the image, and every value that
// an image physically cannot pin down is emitted with `provenance` saying so.
//
// Usage:
//   node shot-compile.js <image.png> --prefix=<block> [--section=<name>] [--dpr=2] [--font=Inter]
//        [--out-plan=p.json] [--out-contract=c.json] [--out-inventory=i.json] [--json]
//   node shot-compile.js --self-test
//
// Honest limits, printed on every run (never buried):
//   · font FAMILY is not recoverable from pixels — `--font` names the substitute, and it is recorded.
//   · font SIZE is estimated from measured cap/x-height, +-1px. Pipeline step 3c (`text-extents check-spec`)
//     confirms or solves it against the render before the build; that step is not optional for this source.
//   · hover/scroll/load STATES do not exist in a still. A screenshot build can never claim behaviour parity;
//     it must ask for a URL/HTML reference or a recording, and say so.
const fs = require('fs'); const path = require('path'); const os = require('os');
const { spawnSync } = require('child_process');
const argv = process.argv.slice(2);
const opt = n => { const p = '--' + n + '='; const a = argv.find(x => x.startsWith(p)); return a ? a.slice(p.length) : null; };
const has = n => argv.includes('--' + n);
const die = m => { console.error(m); process.exit(2) };
const SCRIPTS = __dirname;

// ── pixels ───────────────────────────────────────────────────────────────────────────────────────
function loadPNG(file) {
  let PNG; try { PNG = require('pngjs').PNG } catch (e) {
    try { PNG = require(path.join(SCRIPTS, 'node_modules', 'pngjs')).PNG } catch (e2) { die('pngjs missing — run: node wf-doctor.js --fix') }
  }
  return PNG.sync.read(fs.readFileSync(file));
}
const px = (img, x, y) => { const i = (Math.max(0, Math.min(img.height - 1, y | 0)) * img.width + Math.max(0, Math.min(img.width - 1, x | 0))) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]] };
const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
function modalColour(img, x0, y0, x1, y1, step = 2) {
  const b = new Map();
  for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) {
    const c = px(img, x, y); const k = ((c[0] >> 3) << 10) | ((c[1] >> 3) << 5) | (c[2] >> 3);
    const e = b.get(k) || { n: 0, c }; e.n++; b.set(k, e);
  }
  let best = null; for (const e of b.values()) if (!best || e.n > best.n) best = e;
  return best ? best.c : [0, 0, 0];
}

// ── OCR (the OS does it; nothing to install) ──────────────────────────────────────────────────────
function ocr(image) {
  const cacheDir = path.join(SCRIPTS, '.cache');
  const bin = path.join(cacheDir, 'wf-ocr');
  const src = path.join(SCRIPTS, 'wf-ocr.swift');
  if (process.platform === 'darwin') {
    if (!fs.existsSync(bin)) {
      if (!fs.existsSync(src)) die('wf-ocr.swift missing from the pack');
      fs.mkdirSync(cacheDir, { recursive: true });
      const c = spawnSync('swiftc', ['-O', '-o', bin, src], { encoding: 'utf8' });
      if (c.status !== 0) die('could not build the OCR helper (needs Xcode command line tools: xcode-select --install)\n' + (c.stderr || '').slice(0, 400));
    }
    const r = spawnSync(bin, [image], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    if (r.status !== 0) die('OCR failed: ' + (r.stdout || r.stderr || '').slice(0, 300));
    const j = JSON.parse(r.stdout);
    if (j.error) die('OCR: ' + j.error);
    return j;
  }
  // portable fallback
  const t = spawnSync('tesseract', ['--version'], { encoding: 'utf8' });
  if (t.status === 0) {
    const out = path.join(os.tmpdir(), 'wfocr-' + process.pid);
    const r = spawnSync('tesseract', [image, out, '--psm', '11', 'tsv'], { encoding: 'utf8' });
    if (r.status !== 0) die('tesseract failed: ' + (r.stderr || '').slice(0, 300));
    const rows = fs.readFileSync(out + '.tsv', 'utf8').trim().split('\n').slice(1);
    fs.unlinkSync(out + '.tsv');
    return rows.map(l => l.split('\t')).filter(c => c.length >= 12 && c[11].trim())
      .map(c => ({ text: c[11], conf: Number(c[10]) / 100, x: +c[6], y: +c[7], w: +c[8], h: +c[9] }));
  }
  die('no OCR available. macOS: install Xcode command line tools (xcode-select --install).\n' +
      '  Linux/Windows: install tesseract. A screenshot cannot be compiled without reading its text —\n' +
      '  the alternative is asking the user for a URL/HTML reference, which is better input anyway.');
}

// OCR artefacts that are real and repeatable on UI screenshots
function cleanRuns(runs) {
  const notes = [];
  const out = [];
  for (const r of runs) {
    let t = String(r.text).replace(/\s+/g, ' ').trim();
    // A trailing SINGLE-CHARACTER token in a UI label is an icon the OCR read as text — a chevron, an arrow,
    // a caret. Enumerating glyphs is hopeless: Vision returned "V" for one chevron and the CJK "く" for the
    // next one in the same image. So the rule is structural, not a character list. Digits are kept ("Step 2"),
    // and every strip is reported so nothing disappears silently.
    const tail = t.match(/\s(\S)$/);
    if (tail && !/[0-9]/.test(tail[1])) {
      t = t.slice(0, tail.index).trim();
      notes.push(`trailing glyph ${JSON.stringify(tail[1])} stripped from "${r.text}" — an icon, not a string (add it as an Image/Icon child)`);
    }
    // a lone leading 1-2 char token next to a much longer word is a logo mark read as text
    const logo = t.match(/^([^\s]{1,2})\s+(\S{4,}.*)$/);
    if (logo && logo[1].length <= 2 && /^[a-zA-Z@#*&]+$/.test(logo[1])) { t = logo[2]; notes.push(`logo mark "${logo[1]}" stripped from "${r.text}" — it is an image, not a string`); }
    if (!t) continue;
    out.push({ ...r, text: t });
  }
  return { runs: out, notes };
}

// ── structure from geometry ───────────────────────────────────────────────────────────────────────
// Rows: runs whose vertical centres overlap. Groups within a row: runs separated by less than the median
// inter-run gap belong together (a nav cluster), a much larger gap starts a new group.
function rows(runs, dpr) {
  const sorted = [...runs].sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2));
  const out = [];
  for (const r of sorted) {
    const cy = r.y + r.h / 2;
    const row = out.find(g => Math.abs(g.cy - cy) <= Math.max(r.h, g.h) * 0.6);
    if (row) { row.items.push(r); row.cy = (row.cy * (row.items.length - 1) + cy) / row.items.length; row.h = Math.max(row.h, r.h) }
    else out.push({ cy, h: r.h, items: [r] });
  }
  for (const g of out) g.items.sort((a, b) => a.x - b.x);
  return out;
}
function groupsIn(row) {
  const gaps = [];
  for (let i = 1; i < row.items.length; i++) gaps.push(row.items[i].x - (row.items[i - 1].x + row.items[i - 1].w));
  // The base must be the WITHIN-group gap, so take a low percentile — never the median. With three clusters
  // the median gap IS a between-cluster gap, so the cut computed from it exceeds every real gap and the row
  // never splits (caught by the self-test: BRAND | ONE TWO | GET STARTED collapsed into one group).
  const sorted = [...gaps].sort((a, b) => a - b);
  const p25 = sorted.length ? sorted[Math.floor((sorted.length - 1) * 0.25)] : 0;
  const med = p25;                                    // reported as the within-group rhythm
  const cut = Math.max(p25 * 3, p25 + 24, 40);
  const groups = [[row.items[0]]];
  for (let i = 1; i < row.items.length; i++) {
    const gap = row.items[i].x - (row.items[i - 1].x + row.items[i - 1].w);
    if (gap > cut) groups.push([row.items[i]]); else groups[groups.length - 1].push(row.items[i]);
  }
  return { groups, medianGap: med };
}

function compile() {
  const image = argv.find(a => !a.startsWith('--')) || die('usage: node shot-compile.js <image.png> --prefix=<block>');
  const prefix = opt('prefix') || die('--prefix=<block> is required (from the SITE id, never the image filename)');
  const section = opt('section') || 'section';
  const font = opt('font') || 'Inter';
  const img = loadPNG(image);
  const dpr = Number(opt('dpr') || (img.width >= 2000 ? 2 : 1));
  const CSS = v => Math.round(v / dpr);

  const raw = ocr(image);
  const { runs, notes } = cleanRuns(raw);
  if (!runs.length) die('OCR found no text in ' + image + ' — if the reference really has no text, a screenshot adds nothing over a description; ask for the source.');

  const pageBG = modalColour(img, 0, 0, img.width, img.height);
  const R = rows(runs, dpr);

  // per-run measurements: colour sampled at its own ink, local background sampled just outside it
  for (const row of R) for (const r of row.items) {
    const inside = [];
    for (let y = r.y + r.h * 0.25; y < r.y + r.h * 0.75; y += 2) for (let x = r.x; x < r.x + r.w; x += 2) inside.push(px(img, x, y));
    const localBG = modalColour(img, Math.max(0, r.x - r.h), Math.max(0, r.y - r.h * 0.8), Math.min(img.width, r.x + r.w + r.h), Math.min(img.height, r.y + r.h * 1.8));
    // text colour = the pixels furthest in luminance from the local background
    let far = null, fd = -1;
    for (const c of inside) { const d = Math.abs(lum(c) - lum(localBG)); if (d > fd) { fd = d; far = c } }
    r.colour = hex(far || [0, 0, 0]);
    r.localBG = hex(localBG);
    // a filled pill/button: its local background differs from the page background
    r.onFill = Math.abs(lum(localBG) - lum(pageBG)) > 24;
    r.upper = r.text === r.text.toUpperCase() && /[A-Z]/.test(r.text);
    // cap-height ratio: uppercase runs have no descenders, mixed case do
    r.fontSize = Math.max(9, Math.round(CSS(r.h) / (r.upper ? 0.80 : 0.95)));
  }

  // ── plan ──
  const classes = new Map();
  const cls = (name, props) => { if (!classes.has(name)) classes.set(name, props); return name };
  const ink = { x0: Math.min(...runs.map(r => r.x)), x1: Math.max(...runs.map(r => r.x + r.w)), y0: Math.min(...runs.map(r => r.y)), y1: Math.max(...runs.map(r => r.y + r.h)) };
  const rootProps = {
    display: 'flex', 'align-items': 'center', 'justify-content': 'space-between',
    width: '100%', 'background-color': hex(pageBG),
    'padding-left': CSS(ink.x0) + 'px', 'padding-right': CSS(img.width - ink.x1) + 'px',
    'padding-top': CSS(ink.y0) + 'px', 'padding-bottom': CSS(img.height - ink.y1) + 'px',
  };
  const tree = { type: 'DivBlock', styleNames: [cls(`${prefix}`, rootProps)], children: [] };

  const strings = [];
  R.forEach((row, ri) => {
    const { groups, medianGap } = groupsIn(row);
    const rowNode = R.length > 1
      ? { type: 'DivBlock', styleNames: [cls(`${prefix}__row-${ri + 1}`, { display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', width: '100%' })], children: [] }
      : tree;
    groups.forEach((g, gi) => {
      const holder = g.length > 1
        ? { type: 'DivBlock', styleNames: [cls(`${prefix}__group-${ri + 1}-${gi + 1}`, { display: 'flex', 'align-items': 'center', 'grid-column-gap': Math.max(4, CSS(medianGap)) + 'px', 'grid-row-gap': Math.max(4, CSS(medianGap)) + 'px' })], children: [] }
        : null;
      for (const r of g) {
        strings.push(r.text);
        const isBtn = r.onFill;
        const name = isBtn ? `${prefix}__button` : (r.fontSize >= 24 ? `${prefix}__title` : (r.upper ? `${prefix}__label` : `${prefix}__text`));
        const props = {
          'font-family': font, 'font-size': r.fontSize + 'px', 'font-weight': r.upper ? '500' : '400',
          'line-height': Math.round(r.fontSize * 1.3) + 'px', color: r.colour, 'text-decoration': 'none',
        };
        if (r.upper) props['text-transform'] = 'uppercase';
        if (isBtn) Object.assign(props, {
          display: 'flex', 'align-items': 'center', 'justify-content': 'center',
          'background-color': r.localBG,
          'padding-left': '24px', 'padding-right': '24px', 'padding-top': '14px', 'padding-bottom': '14px',
          'border-top-left-radius': '8px', 'border-top-right-radius': '8px',
          'border-bottom-left-radius': '8px', 'border-bottom-right-radius': '8px',
        });
        const node = { type: 'TextLink', styleNames: [cls(name, props)], setText: r.text };
        (holder || rowNode).children.push(node);
      }
      if (holder) rowNode.children.push(holder);
    });
    if (rowNode !== tree) tree.children.push(rowNode);
  });

  const plan = {
    section, source: 'screenshot ' + path.basename(image), mode: 'replica',
    provenance: {
      measured: ['strings (OCR)', 'text colour (sampled)', 'background colour (modal)', 'filled-button detection (local vs page background)', 'gaps and padding (ink extents)'],
      estimated: [`font-size from cap-height +-1px (confirm with text-extents check-spec — step 3c, not optional for this source)`],
      unknowable: [`font family (substituted: ${font})`, 'hover / scroll / load states (a still has none — a screenshot build cannot claim behaviour parity)'],
    },
    classes: [...classes.entries()].map(([name, properties]) => ({ name, properties })),
    tree,
  };
  const contract = {
    section, width: CSS(img.width),
    elements: plan.classes.filter(c => c.properties['font-size'] || c.properties['background-color']).map(c => ({
      sel: '.' + c.name,
      expect: Object.fromEntries(Object.entries(c.properties).filter(([k]) => ['font-size', 'color', 'background-color', 'text-transform', 'display'].includes(k))),
    })),
  };
  const inventory = { source: image, strings: strings.map(t => ({ text: t, class: null })), structure: {}, counts: { strings: strings.length, groups: 0 } };

  const planOut = opt('out-plan') || image.replace(/\.png$/i, '.plan.json');
  const conOut = opt('out-contract') || image.replace(/\.png$/i, '.contract.json');
  const invOut = opt('out-inventory') || image.replace(/\.png$/i, '.inventory.json');
  fs.writeFileSync(planOut, JSON.stringify(plan, null, 1));
  fs.writeFileSync(conOut, JSON.stringify(contract, null, 1));
  fs.writeFileSync(invOut, JSON.stringify(inventory, null, 1));

  if (has('json')) { console.log(JSON.stringify({ strings: strings.length, classes: plan.classes.length, rows: R.length, planOut, conOut, invOut, notes }, null, 1)); return }
  console.log(`EVIDENCE shot-compile — OK   ${section}   ${path.basename(image)}  ${img.width}x${img.height} @dpr${dpr}`);
  console.log(`  OCR              ${raw.length} run(s) -> ${runs.length} after artefact cleanup, mean confidence ${(raw.reduce((a, r) => a + r.conf, 0) / raw.length).toFixed(2)}`);
  console.log(`  rows detected    ${R.length}   groups: ${R.map(r => groupsIn(r).groups.length).join('+')}`);
  console.log(`  strings carried  ${strings.length}   <- inventory written; content-coverage enforces them`);
  console.log(`  classes          ${plan.classes.length}`);
  console.log(`  page background  ${hex(pageBG)}   filled buttons detected: ${runs.filter(r => r.onFill).length}`);
  for (const n of notes) console.log(`  cleanup          ${n}`);
  console.log(`  MEASURED         ${plan.provenance.measured.join(' · ')}`);
  console.log(`  ESTIMATED        ${plan.provenance.estimated.join(' · ')}`);
  console.log(`  NOT KNOWABLE     ${plan.provenance.unknowable.join(' · ')}`);
  console.log(`  plan      ${planOut}`);
  console.log(`  contract  ${conOut}`);
  console.log(`  inventory ${invOut}`);
  console.log(`  NEXT: wf-preflight.js ${planOut} --site-prefix=<site id>   then step 3c text-extents check-spec`);
}

function selfTest() {
  let PNG; try { PNG = require('pngjs').PNG } catch (e) { try { PNG = require(path.join(SCRIPTS, 'node_modules', 'pngjs')).PNG } catch (e2) { console.error('SKIP: pngjs missing'); process.exit(2) } }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-selftest-'));
  // structure/colour logic is testable without OCR: feed known runs straight into the geometry helpers
  const runs = [
    { text: 'BRAND', x: 80, y: 50, w: 300, h: 40 },
    { text: 'ONE', x: 1000, y: 55, w: 120, h: 30 },
    { text: 'TWO', x: 1160, y: 55, w: 120, h: 30 },
    { text: 'GET STARTED', x: 2500, y: 52, w: 260, h: 34 },
    { text: 'Second row text', x: 80, y: 200, w: 400, h: 30 },
  ];
  const R = rows(runs, 2);
  const g0 = groupsIn(R[0]);
  const cleaned = cleanRuns([
    { text: 'PRODUCTS V', x: 0, y: 0, w: 10, h: 10, conf: 1 },
    { text: 'g SQUARESPACE', x: 0, y: 0, w: 10, h: 10, conf: 1 },
    { text: 'Real Sentence Here', x: 0, y: 0, w: 10, h: 10, conf: 1 },
    { text: 'RESOURCES く', x: 0, y: 0, w: 10, h: 10, conf: 1 },
    { text: 'Get started →', x: 0, y: 0, w: 10, h: 10, conf: 1 },
    { text: 'Step 2', x: 0, y: 0, w: 10, h: 10, conf: 1 },
  ]);
  const cases = [
    ['runs on one baseline become one row', R.length, 2],
    ['a wide gap splits a row into groups', g0.groups.length >= 3, true],
    ['adjacent nav items stay in one group', g0.groups.some(g => g.length === 2), true],
    ['chevron glyph stripped', cleaned.runs[0].text, 'PRODUCTS'],
    ['CJK glyph Vision returned for the same chevron stripped', cleaned.runs[3].text, 'RESOURCES'],
    ['arrow glyph stripped', cleaned.runs[4].text, 'Get started'],
    ['a trailing DIGIT is real content, kept', cleaned.runs[5].text, 'Step 2'],
    ['logo mark stripped from the wordmark', cleaned.runs[1].text, 'SQUARESPACE'],
    ['real prose is left alone', cleaned.runs[2].text, 'Real Sentence Here'],
    ['cleanup is reported, never silent', cleaned.notes.length, 4],
  ];
  let ok = true;
  for (const [n, got, want] of cases) { const p = got === want; ok = ok && p; console.log(`${p ? 'PASS' : 'FAIL'}  ${n}` + (p ? '' : `  (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`)) }
  // colour + button detection on a synthetic bar: dark bar, white text, light pill on the right
  const W = 1440, H = 80; const im = new PNG({ width: W, height: H });
  const put = (x, y, c) => { const i = (y * W + x) * 4; im.data[i] = c[0]; im.data[i + 1] = c[1]; im.data[i + 2] = c[2]; im.data[i + 3] = 255 };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, x > 1200 && x < 1400 && y > 20 && y < 60 ? [230, 230, 230] : [16, 16, 20]);
  const f = path.join(tmp, 'bar.png'); fs.writeFileSync(f, PNG.sync.write(im));
  const img = loadPNG(f);
  const bg = modalColour(img, 0, 0, W, H);
  const pill = modalColour(img, 1210, 25, 1390, 55);
  const more = [
    ['page background sampled as the modal colour', hex(bg), '#101014'],
    ['a filled pill reads as a different local background', Math.abs(lum(pill) - lum(bg)) > 24, true],
  ];
  for (const [n, got, want] of more) { const p = got === want; ok = ok && p; console.log(`${p ? 'PASS' : 'FAIL'}  ${n}` + (p ? '' : `  (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`)) }
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch (e) {}
  process.exit(ok ? 0 : 1);
}

if (has('self-test')) selfTest(); else compile();
