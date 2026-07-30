# Shared understanding: import "iTPS UAS Remote" course from the old database

Date: 2026-07-30
Status: awaiting confirmation — nothing built, nothing written to either database

## Goal

Create a new course **iTPS UAS Remote** in this project's database and port the
full contents of the old project's `3d-airmanship` course into it: 8 modules,
102 lessons, 85 material rows, 86 attachment files, the prerequisite graph, and
the RAG embeddings. Field-by-field, not a dump-and-restore.

## The premise that turned out to be wrong

The task assumed the lesson-material JSONB shape had changed. **It has not.**
`lesson_material` has byte-identical columns in both databases — `text`,
`key_points`, `quiz`, `pro_tips`, `links`, `assignments`, `job_of_the_day` —
and the stored quiz JSON already matches `CourseLessonQuizSchema` exactly
(`{id, question, options[{id, value}], correctOptionId}`). Prose fields are
already HTML, which is what the new renderer expects.

So the mapping is close to 1:1 and the real work is elsewhere: dropped columns,
external assets, and content quality.

## Verified source facts

| | Value |
| --- | --- |
| Old course | `3d-airmanship`, id 1, "3D Airmanship" |
| Modules / lessons / material rows | 8 / 102 / 85 |
| Lessons with **no** material | **17** (incl. one test artifact) |
| Duplicate material rows per slug | 0 — clean 1:1 |
| Lessons with `video_id` | 84 (Synthesia uuids) |
| Lessons with FR/JP variants | 68 |
| `is_available = false` | 21 |
| `needs_video_watch = false` | 13 (deliberate, not the default) |
| Attachment files | **92 distinct, 130 MB**, on the old Vercel Blob store (HTTP 200, live) |
| `blob_file_assignments` rows | **114** — 103 scoped to both module+lesson, 11 module-only |
| Prerequisite rows | 8 module_dependencies + 37 lesson_dependencies |
| Embedding chunks | **669** for the 100 kept lessons (684 `lesson-*` rows exist, but 15 belong to the 2 skipped lessons or to lessons no longer in the course) |
| Subscription values in use | `associate`, `candidate` — both valid in the new enum |
| Slug collisions with target DB | **none** (target holds only `module-1/2`, `lesson-11…22`) |

## Schema deltas

| Table | Old | New | Handling |
| --- | --- | --- | --- |
| `courses` | name, slug only | + `description`, `image_url_avif/webp`, `onboarding_questions` | left null / `[]` |
| `modules` | — | + `image_url_avif/webp` | left null |
| `modules`/`lessons` | `rank numeric(10,5)` | `numeric(30,15)` | widening, copies safely |
| `lessons` | `needs_video_watch` | **absent** | **column re-added** (decision 8) |
| `lessons` | `video_id` only | + `video_provider`, `video_ref` | provider stamped `'synthesia'` |
| `lesson_material` | identical | identical | straight copy |
| `docs` | `(source_path, heading, chunk)` unique | + `course_id`, unique `(course_id, source_path, heading, chunk)` NULLS NOT DISTINCT | stamp `course_id` |

## Decisions

| # | Decision | Chosen | Rationale |
| --- | --- | --- | --- |
| 1 | Script boilerplate in `text` | **Import verbatim** | 63 of 85 rows contain `<strong>SCRIPT</strong>`, 15 have `Scene N`, 6 have `SYNTH VIDEO POINTER` — raw production script with speaker cues in the learner-facing field. Copying verbatim keeps the import provable (`hash(old) == hash(new)`) and makes cleanup a separate reviewable pass against a known-good baseline. Stripping during import is heuristic across 63 differently-shaped rows with no original to diff against. |
| 2 | Lessons with no material | **Import all, skip the junk one** | 16 of the 17 look like genuine curriculum awaiting content, so their rows preserve real structure. The exception is `rpas-20httpssharesynthesiaio539098ade95c4b1fb3e4c831b684941alanguageen-test-demo` — a mangled share URL, plainly a test artifact. Net: 101 lessons. |
| 3 | Attachments | **Re-upload to this project's Blob store** | 86 files / 117 MB downloaded from the old store and re-uploaded here, then `blob_files` + `blob_file_assignments` written against the NEW URLs. The course owns its assets and survives the old project being torn down. Referencing old URLs would 404 the moment that store is deleted or its token rotated. |
| 4 | Attachment path prefix | **Preserve `library-` prefix** | `src/db/library.ts` infers library membership from `url LIKE '%/library-%'`. Renaming on upload would silently drop files out of the library view. |
| 5 | Prerequisite graph | **Port both sets** | Slug-based on both sides (`module_dependencies.depends_on` is `text[]` of module slugs; `lesson_dependencies.depends_on` is jsonb `{moduleSlug, lessonSlug}`), and since slugs are reused verbatim they remap with no translation. Dropping them would silently unlock lessons meant to be gated. |
| 6 | Videos | **Copy `video_id`, set `video_provider = 'synthesia'`, `video_ref` null** | These are Synthesia uuids; playback/thumbnails/captions are fetched live from Synthesia's API and `SYNTHESIA_API_KEY` is already set in this project. Leaving provider null would stop new-app code recognising them. `other_video_ids` copies as-is — same `{lang: 'FR'|'JP', videoId}` schema both sides. |
| 7 | Embeddings | **Copy the 684 vectors, stamping `course_id`** | Both repos embed with `gemini-embedding-001` at 3072 dims (`airmanship-web/src/ai/gemini.ts:78`, `rmtp-studio/src/ai/gemini.ts:14`), so the vectors live in the same space and are directly reusable — my initial "re-generate" recommendation was over-cautious and is withdrawn. The new table is course-scoped, so `course_id` must be added to each row; that is what lets similarity search filter to this course. |
| 8 | `needs_video_watch` | **Re-add the column to `lessons`** and copy all 102 values | User's call, against my recommendation to accept the loss. 13 lessons have it deliberately false and the old DB may not stay available, so preserving it avoids irreversible loss. Requires a schema change plus `drizzle-kit push`. Per this repo's rule on fields with no read-sites, it ships with a comment stating it is preserved-for-parity and naming that nothing currently consumes it. |
| 9 | Course identity | `name = 'iTPS UAS Remote'` (as typed), `slug = 'itps-uas-remote'` | Description and images left null; the existing `3d-airmanship` course is untouched. |
| 10 | Module/lesson slugs | **Reused verbatim** | They are generic (`introduction-and-background`, `wakeup-call`) and are the de facto join key for `lesson_material`, `blob_file_assignments` and the dependency graph across both schemas. Reusing them makes those four ports need no slug translation, and there are no collisions in the target. |
| 11 | Import behaviour | **Idempotent and resumable** | Upsert on natural keys (slug) so a re-run resumes rather than duplicating; blob uploads check for an existing file of that name first. Matters because the 117 MB transfer is the most likely thing to fail partway, and it cannot be rolled back inside a DB transaction. |
| 12 | Timestamps | **Preserve source `created_at` / `updated_at`** | Faithful copy. Note the old app has no `$onUpdate`, so `updated_at` on modules/lessons is effectively create time. |

## Corrections found during implementation

Four things this ledger got wrong before the code was written. Recorded rather
than quietly fixed, because two of them changed the verification targets.

1. **`blob_file_assignments` changed shape.** Decision 3 said assignments port
   "by lesson_slug". They cannot: the old table scopes by `module_slug` /
   `lesson_slug` (text), the new one by `course_id` / `module_id` / `lesson_id`
   **integer** FKs — the new schema's own comment says *"Integer FKs (not
   slugs): immutable, smaller/faster indexes and joins."* The import therefore
   translates slugs to the ids it just inserted. Old rows commonly set BOTH
   module and lesson; that carries across.
2. **Attachment volume was undercounted.** 92 files / 130 MB / 114 assignments,
   not 86 / 117 MB / 103. The first count only followed `lesson_slug`; 11
   module-scoped assignments pull in 6 further files.
3. **There are TWO test artifacts, not one.** Alongside the mangled-URL slug
   there is `rpas-20-test-demo` ("RPAS 20 TEST DEMO", same module,
   `is_available = false`, but it *does* have a material row, which is why the
   no-material scan missed it). Both are skipped, so the targets become **100
   lessons and 84 material rows**, not 101 and 85.
4. **The `library-` prefix has no reader in this app.** Decision 4 justified
   preserving it via `src/db/library.ts`, which does not exist here — that file
   is old-repo only. The prefix is still preserved, but for round-trip fidelity
   and to keep the door open, not because anything currently queries it.

## Bug found in the first run, and its repair

The initial `import-course.ts` keyed blob idempotency on `blob_files.name`.
**`name` is not unique in the source**: `!CANDA-SITE SURVEY CHECKLIST v1.21`
appears twice — once `.pdf` (old id 12), once `.xlsx` (old id 13) — because the
stored name drops the extension.

Consequence: when the `.xlsx` was reached, the check found the `.pdf` row
already inserted, treated the transfer as done, and mapped **both** old ids to
the PDF's new row. 91 `blob_files` instead of 92, and every assignment that
should point at the spreadsheet pointed at the PDF. A learner opening the
checklist would silently have downloaded the wrong document — a wrong-data bug,
not a missing-data one, so nothing would have surfaced it at runtime.

It was caught because the observed count (91) disagreed with the source (92) and
the discrepancy did not survive scrutiny: the first hypothesis (that the missing
file belonged only to a skipped test lesson) was tested and disproved, which
forced the real cause out.

Fixes:
- `import-course.ts` now keys on the blob **pathname**, which carries the
  extension and uniquely identifies a blob. A fresh run cannot reproduce it.
- `scripts/repair-import-blob-dupe.ts` repairs the already-written rows —
  transferring the missing file and re-pointing only the assignments whose
  source row named the `.xlsx`. Surgical rather than delete-and-retransfer,
  because the correct target for each assignment is recoverable from the source.
  Idempotent, and a no-op once repaired.

## Order of operations

```
course -> modules -> lessons -> lesson_material
      -> blob_files -> blob_file_assignments
      -> module_dependencies -> lesson_dependencies
      -> docs (embeddings)
```
Each step upserts on its natural key. Slug-referencing tables must run after
`lessons`, since `lesson_material.lesson_slug` is an FK to `lessons.slug`.

## Failure behaviour

| Scenario | What happens | Operator sees |
| -------- | ------------ | ------------- |
| Blob upload dies mid-transfer | Completed uploads persist; re-run skips them by name | Progress log; re-run resumes |
| Old DB unreachable mid-run | Import aborts before writing further rows | Connection error naming the step |
| A lesson slug already exists in target | Upserted, not duplicated | Counted as updated, not inserted |
| Material references a lesson that failed to insert | FK rejects the row loudly | Error naming the slug |
| Re-run after full success | No-op; counts unchanged | "0 inserted, N unchanged" |
| Content hash mismatch at verify | Reported per lesson slug | Verify report lists offenders |

## Verification

- Row counts match source: 8 modules, **100** lessons, **84** material, **92** blob files, **114** assignments, 45 dependency rows, **669** doc chunks. (Revised — see Corrections.)
- `hash(old.text) == hash(new.text)` per lesson — meaningful precisely because decision 1 keeps text byte-identical.
- Every imported attachment URL returns HTTP 200 from the **new** store.
- `OnboardingQuestionsSchema` / `CourseLessonQuizSchema` parse cleanly over imported rows.

## Accepted risks

- **63 lessons ship with production script scaffolding visible** to learners. Deliberate per decision 1; cleanup is a separate pass and the import report lists the affected slugs.
- **One material row has double-encoded UTF-8** (`â€"` where an em-dash belongs). Imported verbatim for consistency with decision 1; listed in the report.
- **117 MB is duplicated** across two Blob stores until the old project is decommissioned.
- **`video_ref` left null on all 84 lessons.** Correct today, but if the app later standardises on `video_ref` these rows need backfilling.
- **Synthesia dependency retained.** If `SYNTHESIA_API_KEY` lapses or the account closes, 84 lessons lose playback. Not introduced by this import, but inherited by it.
- **Old-DB credentials sit in this project's `.env`** as `OLD_DATABASE_URL`, and the old repo has its connection string committed in `drizzle.config.ts`. Worth rotating once the import is done.

## Explicitly dismissed

- **User data** — progress, quiz answers, favourites, video progress. Out of scope. Note `fav_key_points` keys on the full HTML key-point string, so it would only survive if `keyPoints` were copied byte-identically (which decision 1 does happen to guarantee).
- **Concurrency** — a one-shot admin script, not a request path.
- **The three GIN indexes** declared in the old repo via `void sql\`...\`` — dead code that never executed, so they do not exist in the source DB and are not schema to port.

## Assumed (not confirmed)

- `onboarding_questions` starts `[]` for the new course; the ITPS categories already imported live on `3d-airmanship` and can be re-authored in the admin UI in a few clicks.
- `description`, `image_url_avif`, `image_url_webp` left null on both course and modules.
- The import runs as a script under `scripts/`, invoked manually, not exposed as a route.
- The existing `3d-airmanship` course and its placeholder modules/lessons are left exactly as they are.

## Second bug: double-encoded blob pathnames

`new URL(url).pathname` returns the percent-ENCODED path, and `put()` encodes
whatever it is handed — so `%21` became `%2521`, `%20` became `%2520`. Every
blob was reachable and every row consistent, so no count or FK check could see
it: the damage was that a file's real name contained the escape sequences as
literal characters, and downloading one saved
`%21CANDA-SITE%20SURVEY%20CHECKLIST%20v1.21.pdf` instead of
`!CANDA-SITE SURVEY CHECKLIST v1.21.pdf`.

Caught only because the final assignment reconciliation compared source and
target by URL pathname and reported 97 "missing" plus 97 "extra" — the same
rows, differing by one layer of encoding.

- `import-course.ts` now decodes before uploading.
- `scripts/repair-import-blob-encoding.ts` re-stored the 78 affected files under
  their true pathnames, repointed `blob_files.url`, and deleted the
  wrongly-named blobs (in that order, so a crash never leaves a row pointing at
  a deleted blob). 14 files were unaffected — their names contained nothing that
  needed escaping.
- `blob_files.name` was deliberately left as copied from source, where it is
  already inconsistent (`Brain%20Visual%20Processing.pdf` keeps escapes and its
  extension; `!CANDA-SITE SURVEY CHECKLIST v1.21` has neither). Normalising it
  is a content decision, not part of fixing storage.

## Third bug: `video_ref` left null, so no imported lesson showed its video

Decision 6 copied `video_id` and set `video_provider = 'synthesia'` but left
`video_ref` null, and this ledger logged that as an accepted risk — *"correct
today, but if the app later standardises on `video_ref` these rows need
backfilling."* **It had already standardised.** Two consumers read the
`(videoProvider, videoRef)` pair and neither reads `videoId`:

- `video-section-container.tsx`: `hasVideo = activeProvider !== null && activeRef !== null`
- `resolveLessonPlayback` (`src/db/admin.ts`): `if (!lesson.videoProvider || !lesson.videoRef) return null`

So every imported lesson opened the editor's Video tab in the empty
"paste a Mux/Synthesia URL" state despite having a video — the symptom the user
reported as "no data populated". Nothing in the database was inconsistent, which
is why every count and FK check passed.

`videoId` is NOT redundant: the learner side still reads it (sidebar progress in
`course-sidebar-wrapper.tsx`, the player in `compute-lesson-main-state.ts`), so
both fields have to be set.

- `import-course.ts` now writes `video_ref` alongside `video_id` in both the
  insert and update branches. `videoRef` for Synthesia is the bare uuid — see
  `synthesiaProvider.detect()`, which returns `{ ref: <uuid> }`.
- The 83 already-imported lessons with a video were backfilled with
  `video_ref = video_id::text`. Verified in the running app: the Video tab now
  reads "Current video: Synthesia".

Two non-bugs surfaced while diagnosing this, worth recording so they are not
re-investigated: the board request is slow on first load (cold vite module graph
plus Neon cold start) and looks indistinguishable from a hang; and the dev server
listens on **5001**, not 5000, because macOS ControlCenter holds 5000 and vite
silently falls back.

## Final verified state

| | Result |
| --- | --- |
| Course | `iTPS UAS Remote` / `itps-uas-remote` |
| Modules / lessons / material | 8 / 100 / 84 — all fields match source |
| Material content | `text`, `pro_tips`, `key_points`, `quiz` byte-identical across all 84 rows |
| Lesson fields | name, rank, module, video_id, is_available, exclusive_per_day, has_debrief, needs_video_watch, required_subscriptions, other_video_ids all match; `video_provider = 'synthesia'` wherever a video exists; `video_ref` null throughout |
| Attachments | 92 files, 114 assignments — assignment triples reconcile exactly (0 missing, 0 extra); all 92 URLs return HTTP 200 from the new store |
| Prerequisites | 8 module + 37 lesson dependency rows |
| Embeddings | 669 chunks, `course_id` stamped |
| `needs_video_watch = false` | 13 lessons preserved |

Ranks compare equal numerically; their text form widened from `numeric(10,5)`
to `numeric(30,15)` (`"8.00000"` → `"8.000000000000000"`), which an early
verification pass wrongly flagged as 18 mismatches by comparing as strings.

## Open

- Whether to strip the script scaffolding from the 63 affected lessons, and whether to fix the one mojibake row. Trigger: after the import verifies clean, using the report as the worklist.
- Whether to normalise `blob_files.name` (see above).
- Rotating the old-database credentials now that `OLD_DATABASE_URL` has served its purpose.
