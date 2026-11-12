# Rollout: debrief knowledge chunks

## What ships

Lesson debriefs now track each pilot's mastery of AI-generated knowledge chunks instead of a single score. A pilot clears a lesson's debrief by reaching full mastery across attempts, with a 6 h wait between attempts, paste blocked, and drafts that survive a reload. The course percent gains a mastery item, and Viper can mention a revisit note. Design: [`docs/superpowers/specs/2026-11-12-debrief-knowledge-chunks-design.md`](../specs/2026-11-12-debrief-knowledge-chunks-design.md).

## Order

1. Run `pnpm db:migrate-knowledge-chunks` against production FIRST.
   - It creates `lesson_knowledge_chunks`, `debrief_chunk_mastery`, `debrief_passes` and `debrief_answer_logs`, plus their unique indexes.
   - It adds nullable columns `format`, `chunk_version`, `draft` and `finished_reason` to `lesson_test_results`, and a partial unique index allowing one open chunk-format attempt per pilot and lesson.
   - It backfills `debrief_passes` from LEGACY completed attempts (`format is null`) with `total_score >= 75` (one row per pilot and lesson, earliest `completed_at`). `on conflict do nothing`.
   - It runs in one transaction and prints a single line: `Knowledge chunk tables are in place and legacy passes backfilled.` It does NOT print a legacy-pass count. To read the count, run this BEFORE migrating (the source count, since `debrief_passes` does not exist yet): `select count(*) from (select 1 from lesson_test_results where completed_at is not null and total_score >= 75 group by user_id, lesson_slug) t;`. Immediately after migrating, and before deploying, `select count(*) from debrief_passes;` should equal it.
   - Re-running it is safe at any time, before or after deploying. The backfill reads only legacy rows (`format is null`), so a chunk attempt — whose `total_score` is its mastery percent, e.g. 6 of 8 = 75 — never becomes a pass.
   - Run it a second time. It must finish with the same line and change nothing (the count is unchanged).
2. Deploy.
3. Spot-check one pilot's lesson ring and Debrief tab (a pilot who passed before should still show passed).

Never run `pnpm db:push`: it offers to truncate the `docs` table because of unrelated schema drift.

## Why migrate before deploy

The new code selects the new tables and columns, so deploying first would error on every debrief and lesson load. Old code ignores the new tables and columns, so migrating first is safe while the old build is still live.

## Walkthrough checklist

- [ ] Take a debrief on a video lesson to 100% across two attempts.
- [ ] See the 6 h countdown between attempts.
- [ ] Reload during the 6 h wait and confirm Worth revisiting is still shown (with mastery above the countdown).
- [ ] Confirm paste is blocked and the note explaining it shows.
- [ ] Reload mid-attempt and confirm it resumes with the draft.
- [ ] Confirm the course percent shows the mastery item.
- [ ] Confirm a pilot who passed under the old system still shows passed.
- [ ] Confirm Viper mentions a revisit note.

## Rollback

Deploy the previous build. The new tables and columns are additive and ignored by old code, and `debrief_passes` rows are kept for a later redeploy.

The old build does NOT ignore chunk attempts, though. Every finished chunk attempt is a `lesson_test_results` row with `completed_at` and a `total_score`: 100 when it cleared every chunk, otherwise the pilot's mastery percent at the finish. The old build reads those rows by score alone, so after a rollback:

- an all-cleared attempt (100) reads as passed;
- an attempt that finished with holes but a mastery of 75 or more (say 6 of 8) also reads as passed, though the new build never passed it;
- an attempt below 75 reads as a failed attempt, which puts the pilot in the old build's rewatch-required state for that lesson.

Unfinished chunk attempts (`completed_at` null) are ignored by the old build. A pass granted by carry-over alone (no attempt row) exists only in `debrief_passes`, which the old build does not read, so that pilot appears un-passed until the new build is redeployed.

## Cost

Chunk generation is one Sonnet call per lesson, cached per source fingerprint, plus one Haiku match call on regeneration.
