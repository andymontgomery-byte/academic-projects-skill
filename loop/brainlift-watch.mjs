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
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const GATEWAY = 'https://timeback-loops-k8.vercel.app/api/academic-projects';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const STATE_DIR = join(homedir(), '.academic-projects-skill');
const FINGERPRINTS = join(STATE_DIR, 'brainlift-fingerprints.json');
const SNAP_DIR = join(STATE_DIR, 'brainlift-snapshots');
const PROMPT_FILE = '/tmp/academic-projects-brainlift-reassess-prompt.md';

const log = (m) => console.log(`${new Date().toISOString()} ${m}`);

// The diff-cell authoring duty (Andy ruling 7/21: an LLM uses the timeback
// skill to find each cell and writes it down; serving code never interprets).
const CELL_DUTY = (subj) => `
ALSO this run: ADVERSARIALLY re-verify and re-author the 25-26 diff cells for
the subject "${subj}" (its rows in diff_cells are missing or older than 7
days). Treat every existing cell as a claim to attack: re-run the decisive
queries via the timeback production skill at ~/.claude/skills/timeback
(scripts/timeback-query.mjs — courses + classes + enrollments +
metrics.totalXp/60 + processed_facts usage since 2025-08-01) and only then
re-author. For each grade PK-12 determine: the MAIN app(s) students actually
used in SY25-26 (judgment over real enrollment + usage + catalog + PowerPath;
exclude hole-filling, supplements, placement, practice/test containers,
personal copies and AP courses — AP belongs to AP rows; beware catalog
defects: courseType NULL on real courses, junk totalXp, wrong grades arrays,
enrolled-but-never-used courses) and the grade's expected XP hours.
GRADE-MATERIAL RULE (Andy 7/22): a grade row lists apps serving THAT grade
level's MATERIAL. Above-grade-level work by that age-grade's students belongs
on the higher grade's row (PK kids doing Zearn K work is NOT a PK Math app —
Zearn has no PK course). The converse stands too: an app that genuinely serves
grade-G material to grade-G kids counts even when its catalog grades array is
wrong (the Reading PK Mentava precedent). Upsert rows into diff_cells (subject, grade_key 'PK'/'K'/'1'..'12',
yr '25-26', apps, hours like '~9 h', evidence naming courses + enrollment
counts, authored_by 'Fable via timeback skill <date>') via Supabase REST with
the service key (~/.academic-projects-skill/api-keys.json;
POST /diff_cells?on_conflict=subject,grade_key,yr with Prefer
resolution=merge-duplicates). Evidence must cite real query results — never
guess. Grades with nothing real get apps 'none found' with the evidence.
ALSO maintain the subject's AP rows the same way: one diff_cells row per real
main-sequence AP course family, grade_key 'AP:<family>' (e.g. 'AP:AP Biology'),
apps = the serving app(s), hours from totalXp/60 when priced. Real = actual AP
course with >=3 active student enrollments or real processed_facts usage —
EXCLUDE practice/test containers, progress checks, review packets, test-outs,
hole-filler shells, essay/FRQ/DBQ skill drills, WIP clones, and student-named
personal copies. If the subject has no real AP course, write one row with
grade_key 'AP:none' and apps 'none found' plus the evidence.

APPROVED ⇒ TIMEBACK HOURS (Andy ruling 7/22): any project with an approved
approved_by_andy stage does its approval process IN TimeBack, so its 26-27 XP
hours MUST come from TimeBack production — never the BrainLift. Check every
approved project this run: prefer catalog_match so nextHours prices per grade
(clear hours_display if it overrides real catalog pricing); where nextHours
can't bucket (per-student copies → use MEDIAN totalXp across variants; empty
grades arrays → author the TB number into hours_display + xp_hours with the
query evidence). If an approved project truly has NO priced TB course, that is
a finding to surface (flag it in the run report / escalate) — do NOT fall back
to BrainLift hours for approved work.`;

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
  // The main-view SPEC is itself a watched Workflowy source (Andy 7/22:
  // spec amendments must reach the headless agent, not be ignored). Its
  // changes get a dedicated realignment duty, not the BrainLift duty.
  targets.push({
    slug: '__spec', name: 'sy-diff main-view spec (Workflowy)', owner: 'Andy', i: 0,
    url: 'https://workflowy.com/#/20cd87f869a6',
  });
  log(`scan: ${targets.length} brainlift urls across ${(board.status ?? []).length} projects (+ the main-view spec)`);

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
        // A brand-new source needs a FIRST assessment, not just a baseline —
        // found 2026-07-24: Ilma's four new AP BrainLifts and Janna's
        // AlphaMath BrainLift sat baselined-but-never-assessed overnight.
        changed.push({ ...t, snap, chars: res.text.length, firstAssess: true });
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

  // All changed BrainLifts are processed this run — no deferral cap (review
  // finding 7/21: the cap silently dropped fingerprinted-but-deferred work).
  const specChanged = changed.find((c) => c.slug === '__spec');
  const queue = changed.filter((c) => c.slug !== '__spec');

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

  // ── GitHub ticket intake (Andy 7/21: react and fix) ───────────────────────
  const newTickets = [];
  try {
    const raw = execSync(
      'gh issue list --repo andymontgomery-byte/academic-projects-skill --state open --json number,title,author,createdAt --limit 50',
      { encoding: 'utf8', timeout: 60000 },
    );
    const lastSeen = state['__tickets']?.lastSeen ?? 0;
    let maxSeen = lastSeen;
    for (const iss of JSON.parse(raw)) {
      if (iss.number === 1) continue; // rolling digest issue
      if (iss.number > lastSeen) {
        newTickets.push(iss);
        maxSeen = Math.max(maxSeen, iss.number);
      }
    }
    if (maxSeen > lastSeen) {
      state['__tickets'] = { lastSeen: maxSeen, at: new Date().toISOString() };
      writeFileSync(FINGERPRINTS, JSON.stringify(state, null, 1));
    }
    if (newTickets.length) log(`tickets: ${newTickets.map((t) => '#' + t.number).join(', ')}`);
  } catch (e) { log(`ticket intake failed: ${String(e.message).slice(0, 100)}`); }

  // ── "ACADEMIC PROJECTS" email intake (Mail.app, alpha account) ────────────
  const newEmails = [];
  try {
    // Two intakes: the "ACADEMIC PROJECTS" subject channel, plus ANY mail
    // from Ruchi — her approval emails gate the approved_by_ruchi stage
    // (Andy 7/22: "wait until you see an email from Ruchi to me approving
    // something before you mark any Ruchi-approved greens").
    const raw = execSync(`osascript -e '
      set out to ""
      tell application "Mail"
        repeat with m in (messages of inbox whose subject contains "ACADEMIC PROJECTS")
          set out to out & (id of m) & "\t" & (sender of m) & "\t" & (subject of m) & "\n"
        end repeat
        repeat with m in (messages of inbox whose sender contains "ruchi")
          set out to out & (id of m) & "\t" & (sender of m) & "\t" & (subject of m) & "\n"
        end repeat
      end tell
      return out'`, { encoding: 'utf8', timeout: 120000 });
    const processed = new Set(state['__emails']?.processed ?? []);
    const inboxDir = join(STATE_DIR, 'inbox');
    mkdirSync(inboxDir, { recursive: true });
    for (const lineRaw of raw.split('\n')) {
      const [id, sender, subject] = lineRaw.split('\t');
      if (!id || processed.has(id)) continue;
      if (/andy\.montgomery@/.test(sender ?? '') || /academic projects agent/i.test(sender ?? '')) { processed.add(id); continue; }
      const body = execSync(`osascript -e 'tell application "Mail" to get content of (first message of inbox whose id is ${Number(id)})'`, { encoding: 'utf8', timeout: 60000 }).slice(0, 20000);
      const file = join(inboxDir, `${id}.txt`);
      writeFileSync(file, `From: ${sender}\nSubject: ${subject}\n\n${body}`);
      newEmails.push({ id, sender, subject, file });
      processed.add(id);
    }
    state['__emails'] = { processed: [...processed].slice(-500), at: new Date().toISOString() };
    writeFileSync(FINGERPRINTS, JSON.stringify(state, null, 1));
    if (newEmails.length) log(`emails: ${newEmails.map((e) => e.id).join(', ')}`);
  } catch (e) { log(`email intake failed: ${String(e.message).slice(0, 100)}`); }

  // ── assemble the run prompt from whatever duties exist ────────────────────
  const duties = [];
  if (queue.length) {
    duties.push(`BRAINLIFT CHANGES — these BrainLifts changed since their last assessment. Content is pre-fetched to snapshots; do NOT fetch Workflowy.
${queue.map((c) => `- project slug \`${c.slug}\` ("${c.name}", owner ${c.owner ?? 'UNCLAIMED'}) — source #${c.i} (${c.url}) — snapshot: ${c.snap}`).join('\n')}
For each: (1) read the snapshot in full; (2) re-assess the 7 questions and write source_coverage via node scripts/update.mjs set <slug> --as "AI assess (30-min watch)" --json '{"source_coverage": {...}}' per SKILL.md; (3) refresh [AI guess — verify]-prefixed fields the content improves — NEVER overwrite owner-verified fields; (3b) maintain the diff-report fields (primary_app, key_differences <=3x5-word bullets, why_better 5 words, hours_display like '~15 h', cell_role main|hole-filling|supplement|assessment, ap_courses for AP projects, catalog_match only if verified) in the same call; (4) material changes get one line in loop/WATCH_LOG.md (commit+push that file only).`);
  }
  if (staleSubjects.length) duties.push(CELL_DUTY(staleSubjects[0]));
  if (newTickets.length) {
    duties.push(`NEW TICKETS on andymontgomery-byte/academic-projects-skill — triage, RCA, fix, respond:
${newTickets.map((t) => `- #${t.number}: ${t.title} (by ${t.author?.login ?? '?'})`).join('\n')}
For each ticket: read it (gh issue view N --comments); root-cause against the board data, the BrainLift snapshots (~/.academic-projects-skill/brainlift-snapshots/), and the timeback skill (~/.claude/skills/timeback) as needed. If it is a data disagreement you can verify, FIX the data (update.mjs set / decide / diff_cells upsert, attributed 'ticket #N (<requester>)') — owner statements outrank AI guesses. Comment your RCA + what you changed, then close it. If it needs Andy or code changes beyond data, comment the triage + who owns it and leave it open.`);
  }
  if (newEmails.length) {
    duties.push(`NEW "ACADEMIC PROJECTS" EMAILS — triage, RCA, fix, reply (Andy 7/21 flow):
${newEmails.map((e) => `- from ${e.sender} — "${e.subject}" — full text: ${e.file}`).join('\n')}
For each email: (1) read it; (2) immediately send a short triage reply via zsh loop/reply-mail.sh "<their email address>" "Re: <subject>" <path-to-a-body-file-you-write> — acknowledge receipt + your initial read; (3) RCA against the board, snapshots, and the timeback skill; (4) if fixable in data, fix it (attributed 'email from <sender> <date>'; owner statements outrank AI guesses); (5) send a second reply describing exactly what changed (or why nothing did, or that it is escalated to Andy). Sign every reply "— Academic Projects agent (automated, on behalf of Andy)". Never reply to no-reply addresses or to andy.montgomery@ addresses.

RUCHI APPROVALS (Andy ruling 7/22 — email-gated, zero inference): the sy-diff "Ruchi" column reads ONLY the approved_by_ruchi approvals stage. You may set that stage to approved ONLY when an email actually FROM Ruchi (to Andy) explicitly approves a specific project/subject/grade — quote her exact sentence in the approval notes, cite the email date, set --grades to exactly what she approved, decided_by "Ruchi <date> (email to Andy, recorded by loop)". It is NEVER implied by any other stage (Andy's approvals cascade into ready_for_students, NOT into approved_by_ruchi), never inferred from a BrainLift, a ticket, a meeting mention, or anyone else's email. A Ruchi email that does not explicitly approve records nothing. Do not send triage replies to Ruchi emails that aren't ACADEMIC PROJECTS-subject tickets — just record any explicit approval.`);
  }

  if (specChanged) {
    duties.push(`THE MAIN-VIEW SPEC CHANGED — Andy amended the Workflowy spec node (pre-fetched snapshot: ${specChanged.snap}; do NOT fetch Workflowy).
(1) Read the snapshot in full; diff it against the mirror at ~/projects/timeback-loops-k8/docs/SY_DIFF_SPEC.md; update the mirror to match and commit+push ONLY that file in the timeback-loops-k8 repo (message "docs: mirror spec amendment <date>") — the one allowed edit outside this repo.
(2) Re-validate ALL projects and diff_cells against the amended spec (conformance block below); fix data violations, attributed 'spec amendment <date>'.
(3) Anything the amendment requires of RENDER code (SyDiff.jsx etc.) is NOT yours to change — escalate by emailing andy.montgomery@alpha.school via zsh loop/reply-mail.sh with subject "ACADEMIC PROJECTS — spec change needs render work", listing the changed spec lines and exactly what the page must do differently.`);
  }

  // Standing conformance block — Andy 7/22 ("change the directions and context
  // so the workflow won't be ignored"): the spec rides along on EVERY run.
  const SPEC_BLOCK = `MAIN-VIEW SPEC CONFORMANCE (binding on every cell/field you author or edit; spec of record: Workflowy node 20cd87f869a6, mirrored at ~/projects/timeback-loops-k8/docs/SY_DIFF_SPEC.md — re-read the mirror before writing):
- App·hours columns (both years) name the PRIMARY app(s) of the main sequence ONLY — never hole-filling, supplement, or assessment app names.
- Hours = total expected XP hours of the grade level. 25-26: 100% from the timeback skill. 26-27: TimeBack first, BrainLift second — and ANY Andy-approved project MUST price from TimeBack production (catalog_match → per-grade nextHours; per-student copies → MEDIAN totalXp across variants; no TB price = escalate, never BrainLift).
- key_differences: <=3 bullets, <=5 words each, fewer is better. why_better: ONE simple 5-word explanation. Fix any stored field violating these (npm test now asserts them).
- Grade-material rule: a grade row lists apps serving THAT grade's material; above-level work belongs on the higher grade's row.
- After G12: non-standard courses (ISEE, SAT) and multi-grade course sets get own rows (diff_cells 'NG:<label>' + ap_courses labels), then each AP course ('AP:<family>').
- Naming when TimeBack-served: Alpha[Subject] by [Team] (TimeBack); AP: Alpha[course] by [Team]; teams SuperBuilders/Academics/PhysicsGraph/Vaidik/LearnWithAI, else the person's name.
- Andy column = approved_by_andy (grade-scoped); Ruchi column = approved_by_ruchi (email-gated, never implied by anything).
Render-side violations you cannot fix in data → email andy.montgomery@alpha.school (subject "ACADEMIC PROJECTS — render/spec misalignment") describing the exact misalignment; never silently skip.`;

  if (duties.length) {
    writeFileSync(PROMPT_FILE, `You are the Academic Projects triage agent (headless, every 30 minutes).
Working directory: ~/projects/academic-projects-skill. Doctrine: SKILL.md (gaps are the product; owners outrank sources; every write attributed).

${duties.join('\n\n')}

${SPEC_BLOCK}

Do not touch Workflowy. Do not modify the repo except loop/WATCH_LOG.md (plus the spec-mirror exception above when the spec changed). End with a one-line summary per duty.`);
    log(`RUN duties: ${[queue.length && 'brainlifts', staleSubjects.length && 'cells', newTickets.length && 'tickets', newEmails.length && 'emails', specChanged && 'SPEC'].filter(Boolean).join('+')} → ${PROMPT_FILE}`);
  } else {
    try { if (existsSync(PROMPT_FILE)) writeFileSync(PROMPT_FILE, ''); } catch { /* ignore */ }
    log('no work');
  }
  if (errors.length) log(`errors: ${errors.map((e) => `${e.slug}#${e.i} (${e.error})`).join('; ')}`);
}

main().catch((e) => { log(`FATAL ${e.stack ?? e}`); process.exit(1); });
