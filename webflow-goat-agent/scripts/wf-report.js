#!/usr/bin/env node
// wf-report.js — measure what a section ACTUALLY cost, from the session transcript.
//
// Why: the pack's budget (<=15 tool calls, <=25 turns, <=50k peak context) was being reported from
// recollection, which is not evidence. The two real sections on record cost 107 and 68 calls — both
// reported at the time as "over budget" without a number, and one of them was reported as ~80k tokens
// when the transcript says 961k new / 48M re-read. A budget nobody measures is a wish.
//
// Cost model this reports against (measured, see v2-rationale.md): cost = turns x context size.
// Payload size is a rounding error; an image block is ~1,540 tokens at ANY resolution.
//
// Usage:
//   node wf-report.js                          # newest session, whole session
//   node wf-report.js --since="build the hero"  # only from the user prompt containing that text
//   node wf-report.js --session=<path.jsonl>    # explicit transcript
//   node wf-report.js --json
//   node wf-report.js --self-test
//
// Exit: 0 always (a report, never a gate). wf-section record embeds this automatically.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const argv = process.argv.slice(2);
const flag = n => argv.includes('--' + n);
const opt = (n, d = null) => { const p = '--' + n + '='; const a = argv.find(x => x.startsWith(p)); return a ? a.slice(p.length) : d; };

const TURN_BUDGET = 25, CALL_BUDGET = 15, PUBLISH_BUDGET = 2;

function newestTranscript() {
  const root = path.join(os.homedir(), '.claude', 'projects');
  if (!fs.existsSync(root)) return null;
  let best = null;
  for (const d of fs.readdirSync(root)) {
    const dir = path.join(root, d);
    let st; try { st = fs.statSync(dir) } catch { continue }
    if (!st.isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.jsonl')) continue;
      const p = path.join(dir, f);
      const m = fs.statSync(p).mtimeMs;
      if (!best || m > best.m) best = { p, m };
    }
  }
  return best && best.p;
}

function analyse(file, since) {
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  let on = !since, turns = 0, calls = 0, publishes = 0, imgs = 0, imgChars = 0;
  let out = 0, cw = 0, cr = 0, inTok = 0, peak = 0, t0 = null, t1 = null;
  const byTool = {};
  for (const l of lines) {
    let o; try { o = JSON.parse(l) } catch { continue }
    const m = o.message; if (!m) continue;

    if (!on && o.type === 'user') {
      const c = m.content;
      let txt = typeof c === 'string' ? c : (Array.isArray(c) ? (c.find(b => b.type === 'text') || {}).text : null);
      if (txt && txt.includes(since)) on = true;
    }
    if (!on) continue;
    if (o.timestamp) { if (!t0) t0 = o.timestamp; t1 = o.timestamp; }

    if (m.usage) {
      turns++;
      const u = m.usage;
      out += u.output_tokens || 0; cw += u.cache_creation_input_tokens || 0;
      cr += u.cache_read_input_tokens || 0; inTok += u.input_tokens || 0;
      const ctx = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      if (ctx > peak) peak = ctx;
    }
    if (Array.isArray(m.content)) for (const b of m.content) {
      if (b.type === 'tool_use') {
        calls++;
        const n = (b.name || '?').replace('mcp__claude_ai_', '');
        byTool[n] = (byTool[n] || 0) + 1;
        if (/publish/i.test(JSON.stringify(b.input || {}).slice(0, 400)) && /sites_tool/.test(b.name || '')) publishes++;
      }
      if (b.type === 'image') { imgs++; imgChars += ((b.source || {}).data || '').length; }
      if (b.type === 'tool_result' && Array.isArray(b.content)) for (const q of b.content) {
        if (q.type === 'image') { imgs++; imgChars += ((q.source || {}).data || '').length; }
      }
    }
  }
  const mins = t0 && t1 ? Math.round((new Date(t1) - new Date(t0)) / 60000) : null;
  return { file, turns, calls, publishes, imgs, imageTokensEst: imgs * 1540,
           newTokens: inTok + out + cw, output: out, cacheWrite: cw, cacheRead: cr,
           peakContext: peak, minutes: mins, byTool };
}

if (flag('self-test')) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wfrep-'));
  const f = path.join(tmp, 's.jsonl');
  const rows = [
    { type: 'user', timestamp: '2026-08-01T10:00:00Z', message: { content: 'build the widget' } },
    { type: 'assistant', timestamp: '2026-08-01T10:01:00Z', message: { usage: { input_tokens: 10, output_tokens: 100, cache_read_input_tokens: 5000, cache_creation_input_tokens: 50 },
      content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }] } },
    { type: 'assistant', timestamp: '2026-08-01T10:12:00Z', message: { usage: { input_tokens: 0, output_tokens: 200, cache_read_input_tokens: 9000, cache_creation_input_tokens: 0 },
      content: [{ type: 'tool_use', name: 'mcp__claude_ai_Webflow__data_sites_tool', input: { actions: [{ publish_site: { site_id: 'x' } }] } },
                { type: 'image', source: { data: 'x'.repeat(400) } }] } },
  ];
  fs.writeFileSync(f, rows.map(r => JSON.stringify(r)).join('\n'));
  const r = analyse(f, null);
  const scoped = analyse(f, 'build the widget');
  const cases = [
    ['turns counted', r.turns === 2],
    ['calls counted', r.calls === 2],
    ['publish detected', r.publishes === 1],
    ['image counted at ~1540 tok', r.imgs === 1 && r.imageTokensEst === 1540],
    ['new tokens = input+output+cacheWrite', r.newTokens === 10 + 300 + 50],
    ['peak context is the max, not the sum', r.peakContext === 9000],
    ['wall clock measured', r.minutes === 12],
    ['--since scopes to the prompt', scoped.turns === 2],
  ];
  let ok = true;
  for (const [n, c] of cases) { console.log((c ? 'PASS' : 'FAIL') + '  ' + n); ok = ok && c; }
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
}

const file = opt('session') || newestTranscript();
if (!file || !fs.existsSync(file)) {
  const msg = 'no session transcript found — cost unmeasured';
  if (flag('json')) console.log(JSON.stringify({ error: msg }));
  else console.log('EVIDENCE wf-report — ' + msg);
  process.exit(0);
}
const r = analyse(file, opt('since'));
if (flag('json')) { console.log(JSON.stringify(r, null, 1)); process.exit(0); }

const mark = (v, b) => v <= b ? 'ok  ' : 'OVER';
const k = n => n >= 1e6 ? (Math.round(n / 1e5) / 10) + 'M' : Math.round(n / 1000) + 'k';
console.log('EVIDENCE wf-report  ' + path.basename(file) + (opt('since') ? '  scoped from: "' + opt('since') + '"' : '  whole session'));
console.log('  turns          ' + String(r.turns).padStart(5) + '   / ' + TURN_BUDGET + '   ' + mark(r.turns, TURN_BUDGET));
console.log('  tool calls     ' + String(r.calls).padStart(5) + '   / ' + CALL_BUDGET + '   ' + mark(r.calls, CALL_BUDGET));
console.log('  publishes      ' + String(r.publishes).padStart(5) + '   / ' + PUBLISH_BUDGET + '    ' + mark(r.publishes, PUBLISH_BUDGET));
console.log('  peak context   ' + String(k(r.peakContext)).padStart(5) + '   / 50k  ' + mark(r.peakContext, 50000));
console.log('  new tokens     ' + String(k(r.newTokens)).padStart(5) + '   (output ' + k(r.output) + ' + cache-write ' + k(r.cacheWrite) + ')');
console.log('  context re-read' + String(k(r.cacheRead)).padStart(6) + '   <- turns x context, the actual cost driver');
console.log('  images         ' + String(r.imgs).padStart(5) + '   ~' + k(r.imageTokensEst) + ' tok (a rounding error; never ration these)');
if (r.minutes != null) console.log('  wall clock     ' + String(r.minutes).padStart(5) + ' min');
const top = Object.entries(r.byTool).sort((a, b) => b[1] - a[1]).slice(0, 5);
if (top.length) console.log('  busiest        ' + top.map(([n, c]) => n + ' x' + c).join(' · '));
if (r.calls > CALL_BUDGET || r.turns > TURN_BUDGET || r.publishes > PUBLISH_BUDGET) {
  console.log('  -> OVER BUDGET. Report it in the section report with this block pasted verbatim.');
  console.log('     Over-budget is not a failure to hide; an unmeasured budget is.');
}
process.exit(0);
