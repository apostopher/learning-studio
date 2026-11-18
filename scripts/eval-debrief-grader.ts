/**
 * Golden-set eval for the debrief free-text grader.
 *
 * Runs the REAL grader (`evaluateFreeText`, live model calls) over answers an
 * SME labelled as strong (meant as a good answer: must clear the chunk) or
 * weak (written weak on purpose: must not). Unit tests can't catch a grader
 * that drifts harsh or soft — only real answers with known verdicts can.
 *
 * Run after ANY change to the evaluation prompt, scoring or grader model:
 *   pnpm eval:grader            # 3 runs per case
 *   pnpm eval:grader --runs 5
 *   pnpm eval:grader --verbose  # print claims and notes for passing cases too
 *
 * Lesson text is course content, so it is not committed: each fixture's
 * context lives in a gitignored `<fixture>.context.txt` beside it. On a fresh
 * checkout, fetch them once with `--fetch`, which reads `lesson_material.text`
 * in a READ ONLY transaction from DATABASE_URL and writes nothing to the DB.
 *
 * Needs AI Gateway credentials in the environment.
 * Exits 1 if any case lands on the wrong side of CHUNK_CLEAR_SCORE in any run.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { evaluateFreeText } from '#/ai/evaluate-answer';
import { CHUNK_CLEAR_SCORE, type KnowledgeChunk } from '#/lib/debrief-mastery';

type GoldenCase = {
  id: string;
  chunkIds: string[];
  expect: 'strong' | 'weak';
  question: string;
  expectedAnswer: string;
  answer: string;
};
type GoldenFile = {
  lesson: string;
  chunks: KnowledgeChunk[];
  cases: GoldenCase[];
};

const runsArg = process.argv.indexOf('--runs');
const RUNS = runsArg > -1 ? Number(process.argv[runsArg + 1]) : 3;
const dir = join(import.meta.dirname, 'fixtures', 'debrief-grader');
const fixtures = readdirSync(dir).filter((f) => f.endsWith('.json'));
const contextPath = (file: string) =>
  join(dir, file.replace(/\.json$/, '.context.txt'));

async function fetchContexts() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    for (const file of fixtures) {
      const { lesson } = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      const { rows } = await client.query<{ text: string | null }>(
        'select text from lesson_material where lesson_slug = $1',
        [lesson],
      );
      if (!rows[0]?.text) throw new Error(`No lesson_material.text for ${lesson}`);
      writeFileSync(contextPath(file), rows[0].text);
      console.log(`fetched ${lesson} (${rows[0].text.length} chars)`);
    }
    await client.query('ROLLBACK');
  } finally {
    await client.end();
  }
}

if (process.argv.includes('--fetch')) await fetchContexts();
const missing = fixtures.filter((f) => !existsSync(contextPath(f)));
if (missing.length > 0) {
  console.error(
    `Missing lesson text for ${missing.join(', ')}. Run: pnpm eval:grader --fetch`,
  );
  process.exit(2);
}

let failures = 0;
for (const file of fixtures) {
  const golden = JSON.parse(
    readFileSync(join(dir, file), 'utf8'),
  ) as GoldenFile;
  const context = readFileSync(contextPath(file), 'utf8');
  console.log(`\n${golden.lesson}  (${RUNS} runs per case)`);

  const results = await Promise.all(
    golden.cases.map(async (c) => {
      const runs = await Promise.all(
        Array.from({ length: RUNS }, () =>
          evaluateFreeText(
            {
              id: c.id,
              type: 'free-text',
              question: c.question,
              expectedAnswer: c.expectedAnswer,
              chunkIds: c.chunkIds,
            },
            c.answer,
            golden.chunks,
            context,
          ),
        ),
      );
      return { c, runs };
    }),
  );

  for (const { c, runs } of results) {
    const scores = runs.map((r) => r.score);
    const ok = scores.every((s) =>
      c.expect === 'strong' ? s >= CHUNK_CLEAR_SCORE : s < CHUNK_CLEAR_SCORE,
    );
    if (!ok) failures++;
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${c.id.padEnd(16)} ${c.expect.padEnd(6)} ${scores.join(' / ')}`,
    );
    if (!ok || process.argv.includes('--verbose')) {
      for (const r of runs) {
        console.log(`        claims: ${JSON.stringify(r.incorrectClaims)}`);
        console.log(`        note:   ${r.revisitNote}`);
      }
    }
  }
}

console.log(failures === 0 ? '\nAll cases pass.' : `\n${failures} failing.`);
process.exit(failures === 0 ? 0 : 1);
