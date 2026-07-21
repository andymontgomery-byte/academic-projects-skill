// Hourly BrainLift change watch (Andy directive 2026-07-21).
//
// Scans every project's brainlift_urls, fetches the full outline content
// (share links via headless Chrome + the in-page WF API; workflowy.com/#/
// app URLs via the v1 API with Andy's key), fingerprints it, and reports
// which BrainLifts changed since the last scan. First sighting of a URL is
// BASELINE (recorded, no re-assess). On change it writes a snapshot and a
// re-assess prompt; the wrapper (brainlift-watch.sh) then runs one headless
// `claude -p` to update the board. Never writes to Workflowy.
//
// State (local only — the repo is public, content never committed):
//   ~/.academic-projects-skill/brainlift-fingerprints.json
//   ~/.academic-projects-skill/brainlift-snapshots/<slug>--<n>.txt
//   /tmp/academic-projects-brainlift-reassess-prompt.md  (only when changes)

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const GATEWAY = 'https://timeback-loops-k8.vercel.app/api/academic-projects';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const STATE_DIR = join(homedir(), '.academic-projects-skill');
const FINGERPRINTS = join(STATE_DIR, 'brainlift-fingerprints.json');
const SNAP_DIR = join(STATE_DIR, 'brainlift-snapshots');
const PROMPT_FILE = '/tmp/academic-projects-brainlift-reassess-prompt.md';
const MAX_REASSESS_PER_RUN = 3;

const log = (m) => console.log(`${new Date().toISOString()} ${m}`);

// The diff-cell authoring duty (Andy ruling 7/21: an LLM uses the timeback
// skill to find each cell and writes it down; serving code never interprets).
const CELL_DUTY = (subj) => `
ALSO this run: author the 25-26 diff cells for the subject "${subj}" (its rows in
the diff_cells table are missing or older than 7 days). Using the timeback
production skill at ~/.claude/skills/timeback (scripts/timeback-query.mjs —
courses + classes + enrollments + metrics.totalXp/60), determine for each grade
PK-12: the MAIN app(s) students actually used in SY25-26 (judgment over real
enrollment + catalog + PowerPath; exclude hole-filling, supplements, placement,
practice/test and AP courses — AP belongs to AP rows) and the grade's expected
XP hours. Upsert rows into diff_cells (subject, grade_key 'PK'/'K'/'1'..'12',
yr '25-26', apps, hours like '~9 h', evidence naming courses + enrollment
counts, authored_by 'Fable via timeback skill <date>') via Supabase REST with
the service key (~/.academic-projects-skill/api-keys.json;
POST /diff_cells?on_conflict=subject,grade_key,yr with Prefer
resolution=merge-duplicates). Evidence must cite real query results — never
guess. Grades with nothing real get apps 'none found' with the evidence.`;

function sha(text) { return createHash('sha256').update(text).digest('hex'); }

function loadState() {
  try { return JSON.parse(readFileSync(FINGERPRINTS, 'utf8')); } catch { return {}; }
}

// ---- fetchers ---------------------------------------------------------------

const WALK_JS = `(() => {
  function walk(item, depth, out) {
    if (depth > 30 || out.len > 900000) return;
    const name = item.getNameInPlainText ? item.getNameInPlainText() : '';
    const note = item.getNoteInPlainText ? item.getNoteInPlainText() : '';
    const line = '  '.repeat(depth) + '- ' + name + (note ? ' || NOTE: ' + note.replace(/\\n/g, ' ') : '');
    out.parts.push(line); out.len += line.length;
    for (const c of item.getChildren()) walk(c, depth + 1, out);
  }
  const out = { parts: [], len: 0 };
  walk(WF.rootItem(), 0, out);
  return out.parts.join('\\n');
})()`;

async function fetchShareLink(browser, url) {
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(
      `(() => { try { return typeof WF !== 'undefined' && typeof WF.rootItem === 'function' && WF.rootItem().getChildren().length > 0; } catch { return false; } })()`,
      { timeout: 45000, polling: 500 },
    );
    await new Promise((r) => setTimeout(r, 1500));
    const text = await page.evaluate(WALK_JS);
    if (!text || text.length < 40) return { error: 'empty tree' };
    return { text };
  } catch (e) {
    const body = await page.evaluate(() => document.body?.innerText?.slice(0, 200) ?? '').catch(() => '');
    if (/4O4|no longer there|permission/i.test(body)) return { error: 'share link dead or restricted (404)' };
    return { error: `fetch failed: ${String(e.message).slice(0, 120)}` };
  } finally {
    await page.close().catch(() => {});
  }
}

function decodeEntities(s) {
  return (s ?? '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/<[^>]+>/g, '');
}

async function fetchApiNode(shortId, key) {
  const nodes = [];
  let cursor = null;
  for (let i = 0; i < 40; i += 1) {
    const u = new URL(`https://beta.workflowy.com/api/v1/nodes/${shortId}/subtree`);
    if (cursor) u.searchParams.set('cursor', cursor);
    const r = await fetch(u, { headers: { Authorization: `Bearer ${key}` } });
    if (!r.ok) return { error: `API ${r.status}` };
    const d = await r.json();
    if (d.code) return { error: `API ${d.code}` };
    nodes.push(...(d.nodes ?? []));
    cursor = d.next_cursor;
    if (!cursor) break;
  }
  if (!nodes.length) return { error: 'API empty' };
  const byParent = new Map();
  for (const n of nodes) {
    if (!byParent.has(n.parent_id)) byParent.set(n.parent_id, []);
    byParent.get(n.parent_id).push(n);
  }
  for (const arr of byParent.values()) arr.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  const lines = [];
  const emit = (n, depth) => {
    lines.push('  '.repeat(depth) + '- ' + decodeEntities(n.name) + (n.note ? ' || NOTE: ' + decodeEntities(n.note).replace(/\n/g, ' ') : ''));
    for (const c of byParent.get(n.id) ?? []) emit(c, depth + 1);
  };
  emit(nodes[0], 0);
  return { text: lines.join('\n') };
}

// ---- main -------------------------------------------------------------------

async function main() {
  mkdirSync(SNAP_DIR, { recursive: true });
  const state = loadState();

  const board = await (await fetch(GATEWAY)).json();
  const targets = [];
  for (const p of board.status ?? []) {
    for (const [i, url] of (p.brainlift_urls ?? []).entries()) {
      targets.push({ slug: p.slug, name: p.name, owner: p.owner, i, url });
    }
  }
  log(`scan: ${targets.length} brainlift urls across ${(board.status ?? []).length} projects`);

  let wfKey = null;
  try { wfKey = readFileSync(join(homedir(), '.workflowy/api.key'), 'utf8').trim(); } catch { /* app-url fetches will fail loudly */ }

  const needsBrowser = targets.some((t) => /workflowy\.com\/s\//.test(t.url));
  const browser = needsBrowser
    ? await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-first-run', '--disable-extensions'] })
    : null;

  const changed = [];
  const errors = [];
  try {
    for (const t of targets) {
      const key = `${t.slug}#${t.i}`;
      let res;
      const short = t.url.match(/workflowy\.com\/#\/([0-9a-f]{12})/);
      if (short) res = wfKey ? await fetchApiNode(short[1], wfKey) : { error: 'no workflowy api key' };
      else if (/workflowy\.com\/s\//.test(t.url)) res = await fetchShareLink(browser, t.url);
      else res = { error: 'unsupported url shape' };

      if (res.error) {
        errors.push({ ...t, error: res.error });
        log(`ERR  ${key} ${res.error}`);
        state[key] = { ...(state[key] ?? {}), url: t.url, lastError: res.error, checkedAt: new Date().toISOString() };
        continue;
      }
      const hash = sha(res.text);
      const prev = state[key];
      const snap = join(SNAP_DIR, `${t.slug}--${t.i}.txt`);
      if (!prev?.hash) {
        writeFileSync(snap, res.text);
        state[key] = { url: t.url, hash, baselinedAt: new Date().toISOString(), checkedAt: new Date().toISOString() };
        log(`BASE ${key} (${res.text.length} chars)`);
      } else if (prev.hash !== hash || prev.url !== t.url) {
        writeFileSync(snap, res.text);
        state[key] = { url: t.url, hash, changedAt: new Date().toISOString(), checkedAt: new Date().toISOString() };
        changed.push({ ...t, snap, chars: res.text.length });
        log(`CHG  ${key} (${res.text.length} chars)`);
      } else {
        state[key].checkedAt = new Date().toISOString();
        log(`ok   ${key}`);
      }
    }
  } finally {
    await browser?.close().catch(() => {});
  }

  writeFileSync(FINGERPRINTS, JSON.stringify(state, null, 1));

  const queue = changed.slice(0, MAX_REASSESS_PER_RUN);
  const deferred = changed.slice(MAX_REASSESS_PER_RUN);
  if (deferred.length) log(`deferred to next run: ${deferred.map((c) => c.slug).join(', ')}`);

  // 25-26 diff-cell freshness (Andy 7/21: an LLM finds each cell with the
  // timeback skill). A subject qualifies when it has no cells or its newest
  // cell is older than 7 days; one subject per run.
  const SUBJECTS = ['Science', 'Social Studies', 'Math', 'Reading', 'Language', 'Writing', 'Vocabulary', 'FastMath'];
  const cellRows = board.diffCells ?? [];
  const staleSubjects = SUBJECTS.filter((s) => {
    const rows = cellRows.filter((r) => r.subject === s && r.yr === '25-26');
    if (!rows.length) return true;
    const newest = Math.max(...rows.map((r) => Date.parse(r.authored_at ?? 0)));
    return Date.now() - newest > 7 * 24 * 3600 * 1000;
  });
  if (staleSubjects.length) log(`diff-cells stale/missing: ${staleSubjects.join(', ')}`);

  if (queue.length) {
    const prompt = `You are the Academic Projects BrainLift re-assess worker (headless, hourly watch).
Working directory: ~/projects/academic-projects-skill. Read SKILL.md's "BrainLift is the form" assess recipe first.

These BrainLifts CHANGED since their last assessment. The full current content of each is already fetched to a local snapshot file — read the snapshot, do NOT try to fetch Workflowy yourself.

${queue.map((c) => `- project slug \`${c.slug}\` ("${c.name}", owner ${c.owner ?? 'UNCLAIMED'}) — source #${c.i} (${c.url}) — snapshot: ${c.snap}`).join('\n')}

For each changed project:
1. Read the snapshot in full.
2. Re-assess the 7 questions (parent_summary, q1_subject_grades, q2_standards, q3_passes_test, q4_entry_gate, q5_xp_hours, q6_effective_for) and write source_coverage via: node scripts/update.mjs set <slug> --as "AI assess (hourly BrainLift watch)" --json '{"source_coverage": {...}}' — schema per SKILL.md (assessed_at today, assessed_by "AI assess (hourly BrainLift watch)", per-question verdict/evidence/ask).
3. Refresh any [AI guess — verify]-prefixed fields the new content improves, in the same update call. NEVER overwrite an owner-verified field (one without the [AI guess prefix) — owners outrank sources.
3b. Also maintain the diff-dashboard summary fields from the new content (you are the Fable summarizer for the sy-diff page): primary_app (the serving app; 'TimeBack' when served by the TimeBack UI), key_differences (max 3 bullets, max 5 words each, fewer is better), why_better (one 5-word explanation of better academic outcomes vs last year), and catalog_match (an ILIKE title pattern for the project's uploaded TimeBack courses, only if you can verify matches exist). Same update call.
4. If the change is material (a question flipped verdict, a number changed), append one line per project to loop/WATCH_LOG.md: "<date> <slug>: <one-sentence what changed>". Commit and push loop/WATCH_LOG.md only (git add loop/WATCH_LOG.md && git commit && git push).

Do not email anyone. Do not touch Workflowy. Do not modify anything else in the repo. End with a one-line summary per project.

${staleSubjects.length ? CELL_DUTY(staleSubjects[0]) : ''}`;
    writeFileSync(PROMPT_FILE, prompt);
    log(`REASSESS ${queue.length}: ${queue.map((c) => c.slug).join(', ')} → ${PROMPT_FILE}`);
  } else if (staleSubjects.length) {
    // No BrainLift changes, but cells need authoring — cells-only run.
    writeFileSync(PROMPT_FILE, `You are the Academic Projects diff-cell author (headless, hourly watch).
Working directory: ~/projects/academic-projects-skill.
${CELL_DUTY(staleSubjects[0])}
Do not email anyone. Do not touch Workflowy. End with a one-line summary.`);
    log(`CELLS ${staleSubjects[0]} → ${PROMPT_FILE}`);
  } else {
    try { if (existsSync(PROMPT_FILE)) writeFileSync(PROMPT_FILE, ''); } catch { /* ignore */ }
    log('no changes');
  }
  if (errors.length) log(`errors: ${errors.map((e) => `${e.slug}#${e.i} (${e.error})`).join('; ')}`);
}

main().catch((e) => { log(`FATAL ${e.stack ?? e}`); process.exit(1); });
