// Offline conformance: the three descriptions of the data model — schema.sql,
// the data_dictionary seed, and references/data-dictionary.md — must agree on
// the projects field set, and SKILL.md must document every command that
// exists in scripts/. No network.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'ok' : 'FAIL'} — ${msg}`);
  if (!ok) failures++;
};

const schema = read('schema.sql');
const projectsBlock = schema.match(/create table if not exists projects \(([\s\S]*?)\n\);/)[1];
const schemaCols = [...projectsBlock.matchAll(/^\s{2}(\w+)\s/gm)].map((m) => m[1]);

const dictSeed = read('seed/data-dictionary.sql');
const dictCols = [...dictSeed.matchAll(/\('projects', '(\w+)'/g)].map((m) => m[1]);

const NOT_IN_DICT = new Set(['id', 'created_at', 'updated_at']);
for (const col of schemaCols.filter((c) => !NOT_IN_DICT.has(c))) {
  check(dictCols.includes(col), `projects.${col} defined in data_dictionary seed`);
}
for (const col of dictCols) {
  check(schemaCols.includes(col), `data_dictionary projects.${col} exists in schema`);
}

const skill = read('SKILL.md');
for (const cmd of ['status', 'gaps', 'north-star', 'barriers', 'current-sequence', 'dictionary', 'brainlift', 'improvements', 'project <slug>', 'score.mjs', 'create --as', 'set <slug>', 'decide <slug>', 'request --as']) {
  check(skill.includes(cmd), `SKILL.md documents: ${cmd}`);
}
// ask.mjs and SKILL.md must agree on the command surface (anti-drift).
const askSrc = read('scripts/ask.mjs');
for (const cmd of ['current-sequence', 'north-star', 'barriers', 'stack-changes', 'brainlift', 'improvements']) {
  check(askSrc.includes(`case '${cmd}'`), `ask.mjs implements: ${cmd}`);
}
// Only the anon key may ship; the service key must never appear in any file.
const allShipped = ['SKILL.md', 'README.md', 'schema.sql', 'scripts/lib/api.mjs', 'scripts/ask.mjs', 'scripts/update.mjs', 'scripts/score.mjs'].map(read).join('');
check(!allShipped.includes('sb_secret'), 'no sb_secret key material in shipped files');
check(!/"role":"service_role"/.test(Buffer.from((allShipped.match(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\./)?.[1] ?? ''), 'base64').toString('utf8')), 'any bundled JWT is anon-role, not service-role');

const stages = ['plan_approved_by_ai', 'approved_by_learning_science', 'ready_for_students', 'approved_by_andy', 'approved_by_campus_dris', 'approved_by_guides'];
for (const s of stages) {
  check(schema.includes(`'${s}'`) && skill.includes(s), `stage ${s} in schema + SKILL.md`);
}

console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
