// Math K-8 app stack, transcribed from Andy's screenshot of the (still
// org-restricted) "Math K-8 App Stack — Old / Now / Next" sheet, 2026-07-13.
// Provenance is stamped on every cell; when the sheet becomes readable,
// re-import from CSV and the source field flips. Grade K's now-supplement
// cell was not legible in the screenshot and is left null.
//
// Row shape: [grade, oldBase, oldHF, nowBase, nowHF, nowSupp, nowTest,
//             nextBase, nextHF, nextTest, nextSupp, nextSuppTest]

import { rpc } from '../lib/api.mjs';

const SOURCE = 'math-sheet screenshot 2026-07-13';
const CHANGED_BY = process.env.SEED_CHANGED_BY ?? 'seed-import';

const ROWS = [
  [-1, 'Happy Numbers', 'Happy Numbers', 'Happy Numbers', 'Happy Numbers', null, 'Alpha Standardized PreK', 'Happy Numbers', 'Happy Numbers', 'Alpha Standardized PreK', null, null],
  [0, 'Zearn', 'Freckle', 'Math Quest', 'TimeBack Math 1', null, 'Alpha Standardized K', 'Math Quest K', 'TimeBack Math K', 'Alpha CCSS Grade K', 'State Supplement K', 'State Supplement Test K'],
  [1, 'Zearn', 'Freckle', 'Zearn', 'TimeBack Math 2', null, 'Alpha Standardized 1', 'Math Quest 1', 'TimeBack Math 1', 'Alpha CCSS Grade 1', 'State Supplement 1', 'State Supplement Test 1'],
  [2, 'Zearn', 'Freckle', 'Zearn', 'TimeBack Math 3', 'Math Cakes 2 → TEKS', 'Alpha Standardized 2', 'Math Quest 2', 'TimeBack Math 2', 'Alpha CCSS Grade 2', 'State Supplement 2', 'State Supplement Test 2'],
  [3, 'Zearn', 'Edia', 'Zearn', 'TimeBack Math 4', 'Math Cakes 3 → TEKS', 'STAAR G3', 'Blu Math', 'TimeBack Math 3', 'Alpha CCSS Grade 3', 'State Supplement 3', 'State Supplement Test 3'],
  [4, 'Math Academy', 'Edia', 'Blu Math', 'TimeBack Math 4', 'Math Cakes 4 → TEKS', 'STAAR G4', 'Blu Math', 'TimeBack Math 4', 'Alpha CCSS Grade 4', 'State Supplement 4', 'State Supplement Test 4'],
  [5, 'Math Academy', 'Edia', 'Math Academy', 'Math Academy', 'TEKS', 'STAAR G5', 'Blu Math', 'TimeBack Math 5', 'Alpha CCSS Grade 5', 'State Supplement 5', 'State Supplement Test 5'],
  [6, 'Math Academy', 'Edia', 'Math Academy', 'Math Academy', 'TEKS', 'STAAR G6', 'Math Academy', 'TimeBack Math 6', 'Alpha CCSS Grade 6', 'State Supplement 6', 'State Supplement Test 6'],
  [7, 'Math Academy', 'Edia', 'Math Academy', 'Math Academy', 'TEKS', 'STAAR G7', 'Math Academy', 'TimeBack Math 7', 'Alpha CCSS Grade 7', 'State Supplement 7', 'State Supplement Test 7'],
  [8, 'Math Academy', 'Edia', 'Math Academy', 'Math Academy', 'TEKS', 'STAAR G8', 'Math Academy', 'TimeBack Math 8', 'Alpha CCSS Grade 8', 'State Supplement 8', 'State Supplement Test 8'],
];

// A cell like "Math Cakes 3 → TEKS" keeps the arrow text as detail, app is
// the part before the arrow.
const appOf = (cell) => cell?.includes('→') ? cell.split('→')[0].trim() : cell;
const detailOf = (cell) => cell?.includes('→') ? cell : null;

async function put(grade, era, role, cell) {
  await rpc('set_stack_cell', {
    p_subject: 'Math', p_grade: grade, p_era: era, p_role: role,
    p_app: appOf(cell), p_detail: detailOf(cell), p_project_slug: null,
    p_source: SOURCE, p_changed_by: CHANGED_BY,
  });
}

let n = 0;
for (const [g, oldBase, oldHF, nowBase, nowHF, nowSupp, nowTest, nextBase, nextHF, nextTest, nextSupp, nextSuppTest] of ROWS) {
  await put(g, 'old', 'base', oldBase);
  await put(g, 'old', 'hole_filling', oldHF);
  await put(g, 'now', 'base', nowBase);
  await put(g, 'now', 'hole_filling', nowHF);
  await put(g, 'now', 'supplement', nowSupp);
  await put(g, 'now', 'test', nowTest);
  await put(g, 'next', 'base', nextBase);
  await put(g, 'next', 'hole_filling', nextHF);
  await put(g, 'next', 'test', nextTest);
  await put(g, 'next', 'supplement', nextSupp);
  await put(g, 'next', 'supplement_test', nextSuppTest);
  n += 11;
}
console.log(`app_stack: ${n} Math cells upserted (${SOURCE})`);
