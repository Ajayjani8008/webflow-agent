// wf-cms.js — CMS the same way wf-plan does static: KNOW IT BEFORE WRITING, then prove the data renders.
//
// Two jobs, one script.
//
//   plan    Read a reference extract, find the repeating unit, and DERIVE the collection: field slugs,
//           field types, the per-element binding map, and the item payloads — from the reference's own
//           content. Nothing about a CMS section should be invented at the keyboard: the number of items,
//           which parts vary per item, which parts are static chrome, and which field each bound element
//           needs are all facts the reference already states.
//
//   verify  Prove the published page actually RENDERS the data. Webflow marks its own failures in the
//           DOM and nothing in the pack was reading them:
//             .w-dyn-bind-empty     a binding resolved to nothing  -> the #1 "my CMS data isn't showing"
//             .w-dyn-empty          the empty state is on screen   -> no items reached the list
//             .w-condition-invisible a conditional hid the element -> switch field is false/empty
//           A pixel score cannot see any of these: an empty bound heading is simply blank pixels, and the
//           section can score high while every item is missing. So this runs as its own gate.
//
// Usage:
//   node wf-cms.js plan <extract.json> [--min-repeat=3] [--prefix=<block>] [--out=<file>]
//   node wf-cms.js verify <builtUrl> "<selector>" [--expect-items=N] [--port=9900] [--out=<file>]
//   node wf-cms.js --self-test
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const argv = process.argv.slice(2);
const opt = (n, d) => { const p = '--' + n + '='; const a = argv.find(x => x.startsWith(p)); return a ? a.slice(p.length) : d; };
const has = (n) => argv.includes('--' + n);

// ---------------------------------------------------------------- field typing
// The reference tells you the type; guessing it is how a date ends up a text field and the editor
// loses sorting forever.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;
const LOOSE_DATE = /^(\d{1,2}\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{1,4}/i;

function fieldTypeFor(node) {
  if (node.tag === 'img' || node.src) return 'Image';
  if (node.tag === 'a' || node.href) return 'Link';
  const t = String(node.text || '').trim();
  if (!t) return null;
  if (ISO_DATE.test(t) || LOOSE_DATE.test(t)) return 'DateTime';
  if (/^[+-]?[\d,.]+%?$/.test(t)) return 'Number';
  if (t.length > 220) return 'RichText';
  return 'PlainText';
}

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

// A node's "shape" is what makes two siblings the SAME template: tag path + class, ignoring content.
const shapeOf = (n) => [n.tag, (n.class || '').split(' ').filter(Boolean).sort().join('.')].join('|');

// ---------------------------------------------------------------- repeat detection
// Siblings that share a shape and repeat >= minRepeat are an editorial list. This is the decision the
// rules ask for at intake (>=3 editorial repeats -> CMS), made from the reference instead of by feel.
function findRepeats(nodes, minRepeat) {
  const byParent = new Map();
  for (const n of nodes) {
    const p = String(n.path || '').replace(/>[^>]*$/, '');
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p).push(n);
  }
  const found = [];
  for (const [parent, kids] of byParent) {
    const groups = new Map();
    for (const k of kids) {
      const s = shapeOf(k);
      if (!groups.has(s)) groups.set(s, []);
      groups.get(s).push(k);
    }
    for (const [shape, items] of groups) {
      if (items.length >= minRepeat) found.push({ parent, shape, count: items.length, items });
    }
  }
  return found.sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------- plan
function planFromNodes(nodes, o) {
  const minRepeat = o.minRepeat || 3;
  const prefix = o.prefix || 'cms';
  const repeats = findRepeats(nodes, minRepeat);
  if (!repeats.length) {
    return { decision: 'no-cms', why: 'no sibling group repeats ' + minRepeat + 'x or more — this is static content or a component, not a Collection List' };
  }
  // Rank by CONTENT, never by raw count. A decorative grid (pixel-mask cells, dots, ticks) repeats far
  // more times than any editorial list and carries nothing — on a real reference a 144-cell mask grid beat
  // the 5-row content list and produced a plan with zero fields that still reported READY. A repeat group
  // with no content-bearing descendants is not a Collection List; it is scenery.
  const contentScore = (grp) => {
    let bearing = 0;
    for (const it of grp.items) {
      const kids = nodes.filter((n) => String(n.path || '').startsWith(it.path + '>'));
      if (kids.some((k) => String(k.text || '').trim() || k.src || k.href)) bearing++;
    }
    return bearing;
  };
  const scored = repeats.map((r) => ({ r, score: contentScore(r) }));
  const viable = scored.filter((x) => x.score >= minRepeat);
  const rejected = scored.filter((x) => x.score < minRepeat)
    .map((x) => ({ shape: x.r.shape, count: x.r.count, why: 'repeats ' + x.r.count + 'x but only ' + x.score + ' item(s) carry any content — decorative, not editorial' }));
  if (!viable.length) {
    return { decision: 'no-cms', why: 'the only repeating groups are decorative (no content in their items) — nothing here is editorial CMS material', rejected };
  }
  viable.sort((a, b) => (b.score - a.score) || (b.r.count - a.r.count));
  const top = viable[0].r;
  const rejectedCandidates = rejected;
  const itemPaths = top.items.map((i) => i.path);
  // everything under each repeated item, grouped by its position inside the item
  const descendantsOf = (p) => nodes.filter((n) => String(n.path || '').startsWith(p + '>'));
  const perItem = top.items.map((i) => descendantsOf(i.path));

  // A slot is a position that exists in every item. If its content VARIES across items it is a field;
  // if it is identical in every item it is static chrome and must NOT become a field.
  const slots = new Map();
  perItem.forEach((desc, idx) => {
    desc.forEach((d) => {
      const rel = String(d.path).slice(String(top.items[idx].path).length);
      if (!slots.has(rel)) slots.set(rel, []);
      slots.get(rel).push(d);
    });
  });

  const fields = []; const bindings = []; const staticChrome = [];
  for (const [rel, occurrences] of slots) {
    if (occurrences.length < top.count) continue;                       // not present in every item
    const type = fieldTypeFor(occurrences[0]);
    if (!type) continue;
    const values = occurrences.map((n) => String(n.text || n.src || n.href || '').trim());
    const varies = new Set(values).size > 1;
    const label = occurrences[0].class ? occurrences[0].class.split(' ')[0] : occurrences[0].tag;
    if (!varies) { staticChrome.push({ rel, sample: values[0].slice(0, 40), why: 'identical in every item — static label, never a CMS field' }); continue; }
    const slug = slugify(prefix + '-' + label);
    fields.push({ slug, type, from: rel, samples: values.slice(0, 3) });
    bindings.push({ element: rel, tag: occurrences[0].tag, settingKey: type === 'Image' ? 'assetId' : (type === 'Link' ? 'link' : 'text'), field: slug });
  }

  const items = perItem.map((desc, idx) => {
    const row = {};
    for (const f of fields) {
      const hit = desc.find((d) => String(d.path).slice(String(top.items[idx].path).length) === f.from);
      if (hit) row[f.slug] = String(hit.text || hit.src || hit.href || '').trim();
    }
    return row;
  });

  // one-template check: Webflow allows exactly ONE template per Collection List
  const shapes = new Set(perItem.map((d) => d.map(shapeOf).join(',')));
  const limits = [];
  if (shapes.size > 1) {
    limits.push({ kind: 'one-template-per-list', detail: shapes.size + ' distinct item layouts in the reference',
      fix: 'Webflow renders ONE template per Collection List. Unify into a single card, or add Switch fields bound to `visibility` to show/hide sub-blocks. Two genuinely different layouts = two lists with filters.' });
  }
  if (fields.some((f) => /colou?r|accent|theme/.test(f.slug))) {
    limits.push({ kind: 'color-not-bindable', detail: 'a per-item colour field was inferred',
      fix: 'A CMS Color field is bindable to NO style property (bindableTo: []). Use one fixed colour, or an Option field plus hand-styled states in the Designer, and log it to impossible_cases.md.' });
  }
  const images = fields.filter((f) => f.type === 'Image').length;
  // Zero derived fields means nothing varies per item: whatever this group is, it is not a collection.
  if (!fields.length) {
    return { decision: 'no-cms', why: 'the strongest repeat group has no slot that VARIES between items — identical repeats are a component or scenery, never CMS', rejected: rejectedCandidates };
  }
  return {
    decision: 'cms', collection: slugify(prefix), itemCount: top.count, templatePath: top.items[0].path,
    rejected: rejectedCandidates,
    fields, bindings, staticChrome, items, limits,
    assets: images ? { imageFieldsPerItem: images, totalUploads: images * top.count } : null,
  };
}

// ---------------------------------------------------------------- verify
// Webflow's own runtime classes are the ground truth for "did the data actually arrive".
function diagnose(nodes, expectItems) {
  const cls = (n) => String(n.class || '');
  const items = nodes.filter((n) => /\bw-dyn-item\b/.test(cls(n)));
  const emptyState = nodes.filter((n) => /\bw-dyn-empty\b/.test(cls(n)));
  const bindEmpty = nodes.filter((n) => /\bw-dyn-bind-empty\b/.test(cls(n)));
  const condHidden = nodes.filter((n) => /\bw-condition-invisible\b/.test(cls(n)));
  const imgs = nodes.filter((n) => n.tag === 'img');
  const imgNoSrc = imgs.filter((n) => !n.src);

  const findings = [];
  if (emptyState.length && !items.length) {
    findings.push({ level: 'fail', kind: 'no-items-rendered',
      detail: 'the Collection List is showing its EMPTY STATE',
      causes: ['items exist but were never published (publish_collection_items) — drafts render empty on the live site',
               'the list has a filter that excludes every item',
               'the wrapper is bound to the wrong collection, or `source` was written as a plain string instead of static_json {"collectionId":"…"}'],
      fix: 'check list_collection_items for isDraft/isArchived first — that is the usual one — then the list filter, then the wrapper binding.' });
  }
  if (expectItems != null && items.length !== expectItems) {
    findings.push({ level: items.length ? 'warn' : 'fail', kind: 'item-count-mismatch',
      detail: 'page renders ' + items.length + ' item(s), expected ' + expectItems,
      causes: ['Collection List "Limit items" setting', 'unpublished/draft items', 'a filter on the list'],
      fix: 'read the list settings and list_collection_items side by side; the difference names the cause.' });
  }
  if (bindEmpty.length) {
    findings.push({ level: 'fail', kind: 'binding-resolved-empty',
      detail: bindEmpty.length + ' element(s) carry .w-dyn-bind-empty — Webflow bound them and got nothing back',
      causes: ['the field is empty on those items', 'bound to the wrong field id', 'an Image field bound to `assetId` while the item stores a URL, or vice versa'],
      fix: 'THIS is what "my CMS data is not showing" looks like in the DOM. Fix the item data or re-point the binding — never hide the element to make it look right.' });
  }
  if (imgNoSrc.length) {
    findings.push({ level: 'fail', kind: 'image-no-src', detail: imgNoSrc.length + ' bound image(s) render with no src',
      causes: ['the Image field is empty on those items', 'the asset upload never completed (the S3 POST must send every uploadDetails property, in order)'],
      fix: 'verify the item fieldData holds a hosted URL, then re-check the binding key (assetId).' });
  }
  if (condHidden.length) {
    findings.push({ level: 'info', kind: 'conditionally-hidden', detail: condHidden.length + ' element(s) hidden by a condition (.w-condition-invisible)',
      causes: ['a Switch field is false or empty on those items'], fix: 'expected when conditional visibility is by design — confirm it is.' });
  }
  return { items: items.length, emptyState: emptyState.length > 0, bindEmpty: bindEmpty.length, conditionallyHidden: condHidden.length, findings };
}

// ---------------------------------------------------------------- cli
function loadNodes(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  return j.nodes || j;
}

function cmdPlan() {
  const file = argv[1];
  if (!file) { console.error('usage: node wf-cms.js plan <extract.json> [--min-repeat=3] [--prefix=block] [--out=file]'); process.exit(2); }
  const res = planFromNodes(loadNodes(file), { minRepeat: parseInt(opt('min-repeat', '3'), 10), prefix: opt('prefix', 'cms') });
  if (opt('out')) fs.writeFileSync(opt('out'), JSON.stringify(res, null, 1));
  const L = [];
  if (res.decision === 'no-cms') {
    L.push('EVIDENCE wf-cms plan — NO-CMS');
    L.push('  ' + res.why);
  } else {
    L.push('EVIDENCE wf-cms plan — ' + (res.limits.length ? 'READY-WITH-LIMITS' : 'READY') + '   collection ' + res.collection);
    L.push('  items in reference  ' + res.itemCount);
    L.push('  fields derived      ' + res.fields.length + '   ' + res.fields.map((f) => f.slug + ':' + f.type).join(', '));
    L.push('  bindings            ' + res.bindings.map((b) => b.tag + '.' + b.settingKey + ' <- ' + b.field).join(' · '));
    if (res.staticChrome.length) L.push('  static chrome       ' + res.staticChrome.length + ' slot(s) identical in every item — NOT fields');
    if (res.assets) L.push('  image uploads       ' + res.assets.totalUploads + ' (' + res.assets.imageFieldsPerItem + ' per item)');
    for (const l of res.limits) L.push('  LIMIT ' + l.kind + '  ' + l.detail + '\n     fix: ' + l.fix);
    L.push('  -> schema, bindings and item payloads all come from the reference. Nothing here is invented at the keyboard.');
  }
  console.log(L.join('\n'));
}

function cmdVerify() {
  const url = argv[1]; const selector = argv[2];
  if (!url || !selector) { console.error('usage: node wf-cms.js verify <builtUrl> "<selector>" [--expect-items=N] [--port=9900]'); process.exit(2); }
  const tmp = path.join(require('os').tmpdir(), 'wf-cms-' + Date.now() + '.json');
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'ref-extract.js'), url, tmp, '1440', selector, '0', opt('port', '9900')], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (!fs.existsSync(tmp)) {
    console.log('EVIDENCE wf-cms verify — FAIL   could not capture ' + selector + '\n  ' + (r.stdout || r.stderr || '').trim().split('\n').pop());
    process.exit(1);
  }
  const expect = opt('expect-items') ? parseInt(opt('expect-items'), 10) : null;
  const d = diagnose(loadNodes(tmp), expect);
  if (opt('out')) fs.writeFileSync(opt('out'), JSON.stringify(d, null, 1));
  const fails = d.findings.filter((f) => f.level === 'fail');
  const L = [];
  L.push('EVIDENCE wf-cms verify — ' + (fails.length ? 'FAIL' : 'PASS') + '   ' + url + ' [' + selector + ']');
  L.push('  items rendered      ' + d.items + (expect != null ? ' / ' + expect + ' expected' : ''));
  L.push('  empty state shown   ' + (d.emptyState ? 'YES' : 'no'));
  L.push('  empty bindings      ' + d.bindEmpty + '   (.w-dyn-bind-empty — bound but nothing came back)');
  L.push('  conditionally hidden ' + d.conditionallyHidden);
  for (const f of d.findings) {
    L.push('  ' + f.level.toUpperCase() + ' ' + f.kind + '  ' + f.detail);
    for (const c of f.causes) L.push('       cause: ' + c);
    L.push('       fix: ' + f.fix);
  }
  if (!d.findings.length) L.push('  -> every item rendered with every binding resolved. A pixel score cannot prove this; this can.');
  console.log(L.join('\n'));
  try { fs.unlinkSync(tmp); } catch (e) { /* temp file, ignore */ }
  process.exit(fails.length ? 1 : 0);
}

// ---------------------------------------------------------------- build sheet
// The planner used to stop at "here is the schema", leaving the agent to invent the call order at the
// keyboard — the same guess-and-correct loop wf-plan exists to kill, just moved into CMS. This emits the
// EXACT ordered MCP calls with real values filled in, so nothing is left to decide mid-build.
function buildSheet(plan, o) {
  const col = o.collectionName || plan.collection;
  const site = o.siteId || '<siteId>';
  const page = o.pageId || '<pageId>';
  const steps = [];
  let i = 1;
  steps.push({ n: i++, tool: 'data_cms_tool', action: 'create_collection',
    args: { siteId: site, displayName: col, slug: slugify(col) },
    note: 'creating a collection auto-creates a detail_* template page — expect it, do not create one' });
  for (const f of plan.fields) {
    steps.push({ n: i++, tool: 'data_cms_tool', action: 'create_collection_static_field',
      args: { collectionId: '<collectionId from step 1>', displayName: f.slug, slug: f.slug, type: f.type },
      note: 'the slug IS the binding contract — name it for content, never for layout' });
  }
  steps.push({ n: i++, tool: 'data_cms_tool', action: 'create_collection_items',
    args: { collectionId: '<collectionId>', items: plan.items.length },
    note: 'name and slug already exist as fields — POSTing them again is a 422 that aborts the whole call' });
  if (plan.assets && plan.assets.totalUploads) {
    steps.push({ n: i++, tool: 'data_assets_tool', action: 'create_asset (x' + plan.assets.totalUploads + ')',
      args: { siteId: site },
      note: 'per image: create_asset (file_name + MD5 file_hash) -> POST bytes to the returned S3 uploadUrl as multipart with EVERY uploadDetails property in order -> put the hosted URL in fieldData. upload_image_by_url is the shortcut when the image is already public.' });
  }
  steps.push({ n: i++, tool: 'data_cms_tool', action: 'publish_collection_items',
    args: { collectionId: '<collectionId>' },
    note: 'drafts render EMPTY on the live site — skipping this is the most common cause of "my CMS data is not showing"' });
  steps.push({ n: i++, tool: 'data_element_builder', action: 'create CMSCollection',
    args: { siteId: site, pageId: page, type: 'CMSCollection' },
    note: 'creates DynamoWrapper > DynamoList > DynamoItem (+ DynamoEmpty). Never hand-build a div list.' });
  steps.push({ n: i++, tool: 'data_element_settings_tool', action: 'set_settings (bind collection)',
    args: { element: '<DynamoWrapper id>', key: 'source', static_json: '{"collectionId":"<collectionId>"}' },
    note: 'static_json ONLY — a plain string or static_text is rejected' });
  steps.push({ n: i++, tool: 'data_element_builder', action: 'build card template inside DynamoItem',
    args: { parent: '<DynamoItem id>', slots: plan.bindings.map(function (b) { return b.tag + ' -> ' + b.field; }) },
    note: 'ONE template — layout cannot vary per item. Layout and gap go on the DynamoList class, not the wrapper.' });
  for (const b of plan.bindings) {
    steps.push({ n: i++, tool: 'data_element_settings_tool', action: 'set_settings (bind field)',
      args: { element: '<' + b.tag + ' in DynamoItem>', key: b.settingKey, field: b.field },
      note: 'discover field ids with get_bindable_sources — never guess them' });
  }
  for (const sc of plan.staticChrome) {
    steps.push({ n: i++, tool: 'data_element_settings_tool', action: 'set_settings (static label)',
      args: { element: sc.rel, key: 'text', static_text: sc.sample },
      note: 'identical in every item — static chrome, never a CMS field' });
  }
  steps.push({ n: i++, tool: 'data_element_settings_tool', action: 'set_settings (empty-state copy)',
    args: { element: '<DynamoEmpty id>', key: 'text' },
    note: 'never ship the default empty-state string' });
  steps.push({ n: i++, tool: 'wf-cms.js', action: 'verify',
    args: { cmd: 'node wf-cms.js verify <publishedUrl> "<selector>" --expect-items=' + plan.itemCount },
    note: 'the section is NOT done until this passes — a pixel score cannot see an empty binding' });
  return { collection: col, steps: steps };
}

function cmdBuild() {
  const file = argv[1];
  if (!file) { console.error('usage: node wf-cms.js build <extract.json|plan.json> [--prefix=] [--collection=] [--site=] [--page=] [--out=]'); process.exit(2); }
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const plan = raw.decision ? raw : planFromNodes(raw.nodes || raw, { minRepeat: parseInt(opt('min-repeat', '3'), 10), prefix: opt('prefix', 'cms') });
  if (plan.decision !== 'cms') { console.log('EVIDENCE wf-cms build — NO-CMS\n  ' + plan.why); process.exit(1); }
  const sheet = buildSheet(plan, { collectionName: opt('collection'), siteId: opt('site'), pageId: opt('page') });
  if (opt('out')) fs.writeFileSync(opt('out'), JSON.stringify({ plan: plan, sheet: sheet }, null, 1));
  const L = ['EVIDENCE wf-cms build — SHEET   collection ' + sheet.collection + '   ' + sheet.steps.length + ' ordered call(s), no decisions left'];
  for (const st of sheet.steps) {
    L.push('  ' + String(st.n).padStart(2) + '. ' + st.tool + ' > ' + st.action);
    if (st.note) L.push('        ' + st.note);
  }
  L.push('  -> execute in this order. Every value above came from the reference or from a prior step id.');
  console.log(L.join('\n'));
}

if (has('self-test')) {
  const nodes = [
    { tag: 'div', path: 'list', class: 'w-dyn-items' },
    { tag: 'div', path: 'list>a', class: 'card w-dyn-item' },
    { tag: 'h3', path: 'list>a>h3', class: 'card-t', text: 'Alpha report' },
    { tag: 'p', path: 'list>a>p', class: 'card-d', text: '2026-01-04' },
    { tag: 'p', path: 'list>a>p2', class: 'card-k', text: 'Read more' },
    { tag: 'img', path: 'list>a>img', class: 'card-i', src: 'a.jpg' },
    { tag: 'div', path: 'list>a2', class: 'card w-dyn-item' },
    { tag: 'h3', path: 'list>a2>h3', class: 'card-t', text: 'Beta report' },
    { tag: 'p', path: 'list>a2>p', class: 'card-d', text: '2026-02-11' },
    { tag: 'p', path: 'list>a2>p2', class: 'card-k', text: 'Read more' },
    { tag: 'img', path: 'list>a2>img', class: 'card-i', src: 'b.jpg' },
    { tag: 'div', path: 'list>a3', class: 'card w-dyn-item' },
    { tag: 'h3', path: 'list>a3>h3', class: 'card-t', text: 'Gamma report' },
    { tag: 'p', path: 'list>a3>p', class: 'card-d', text: '2026-03-09' },
    { tag: 'p', path: 'list>a3>p2', class: 'card-k', text: 'Read more' },
    { tag: 'img', path: 'list>a3>img', class: 'card-i', src: 'c.jpg' },
  ];
  const plan = planFromNodes(nodes, { minRepeat: 3, prefix: 'rep' });
  const d1 = diagnose(nodes, 3);
  const d2 = diagnose([{ tag: 'div', class: 'w-dyn-empty', path: 'x' }], 3);
  const d3 = diagnose(nodes.concat([{ tag: 'h3', class: 'card-t w-dyn-bind-empty', path: 'list>a4>h3' }]), null);
  const cases = [
    ['detects the repeating unit', plan.decision === 'cms' && plan.itemCount === 3],
    ['varying slots become fields', plan.fields.some((f) => f.type === 'PlainText') && plan.fields.length >= 3],
    ['date slot typed as DateTime', plan.fields.some((f) => f.type === 'DateTime')],
    ['image slot typed as Image', plan.fields.some((f) => f.type === 'Image')],
    ['identical slot stays static chrome, not a field', plan.staticChrome.some((s) => s.sample === 'Read more')],
    ['item payloads built per item', plan.items.length === 3],
    ['image upload count reported', plan.assets && plan.assets.totalUploads === 3],
    ['non-repeating input returns no-cms', planFromNodes([{ tag: 'div', path: 'a', class: 'x' }], { minRepeat: 3 }).decision === 'no-cms'],
    ['a decorative mass-repeat never wins over a smaller content list', (() => {
      const deco = [];
      for (let i = 0; i < 40; i++) deco.push({ tag: 'span', path: 'grid>c' + i, class: 'cell' });
      const r = planFromNodes(nodes.concat(deco), { minRepeat: 3, prefix: 'rep' });
      return r.decision === 'cms' && r.itemCount === 3;
    })()],
    ['content-free repeats alone return no-cms, with the reason', (() => {
      const deco = [];
      for (let i = 0; i < 40; i++) deco.push({ tag: 'span', path: 'grid>c' + i, class: 'cell' });
      const r = planFromNodes(deco, { minRepeat: 3 });
      return r.decision === 'no-cms' && /decorative/.test(r.why);
    })()],
    ['verify counts rendered items', d1.items === 3 && d1.findings.length === 0],
    ['empty state is a FAIL with causes', d2.findings.some((f) => f.kind === 'no-items-rendered' && f.causes.length >= 2)],
    ['w-dyn-bind-empty is caught', d3.findings.some((f) => f.kind === 'binding-resolved-empty')],
    ['build sheet is ordered and complete', (function () {
      const sh = buildSheet(plan, { collectionName: 'reports', siteId: 's', pageId: 'p' });
      const acts = sh.steps.map(function (x) { return x.action; });
      return acts[0] === 'create_collection'
        && acts.filter(function (a) { return a === 'create_collection_static_field'; }).length === plan.fields.length
        && acts.indexOf('publish_collection_items') >= 0
        && acts.indexOf('create CMSCollection') >= 0
        && acts.filter(function (a) { return a === 'set_settings (bind field)'; }).length === plan.bindings.length
        && acts[acts.length - 1] === 'verify';
    })()],
    ['items are published BEFORE the element tree is built', (function () {
      const acts = buildSheet(plan, {}).steps.map(function (x) { return x.action; });
      return acts.indexOf('publish_collection_items') < acts.indexOf('create CMSCollection');
    })()],
  ];
  let bad = 0;
  for (const [n, ok] of cases) if (!ok) { bad++; console.log('  FAIL  ' + n); }
  console.log(bad ? 'EVIDENCE wf-cms self-test — FAIL ' + bad + '/' + cases.length : 'EVIDENCE wf-cms self-test — OK ' + cases.length + ' case(s)');
  process.exit(bad ? 1 : 0);
}

const sub = argv[0];
if (sub === 'plan') cmdPlan();
else if (sub === 'build') cmdBuild();
else if (sub === 'verify') cmdVerify();
else { console.error('usage: node wf-cms.js plan <extract.json> [...]   |   verify <url> "<selector>" [...]   |   --self-test'); process.exit(2); }
