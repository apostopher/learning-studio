# Lesson Versions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Courses teach frozen snapshots of a lesson; Disciplines holds the working copy; a chip moves one course to the newer version.

**Architecture:** `lessons` + `lesson_material` stay the working copy. `lesson_versions` holds immutable content snapshots and `course_lesson_versions` pins each (course, lesson) to one. Every membership write calls one idempotent `syncCourseLessonVersions` in its own transaction; every course-scoped content read goes through the pin.

**Tech Stack:** TanStack Start, Drizzle + Postgres (pgvector), Upstash Redis, TanStack Query, jotai, react-hook-form + zod, Base UI, Tailwind, vitest.

**Spec:** `docs/superpowers/specs/2026-11-24-lesson-versions-design.md`

## Global Constraints

- Branch `lesson-versions`, based on `origin/main` (e6ebf59). Baseline: 557 test files, 5057 passing.
- `.env.local` points at PROD. Never run a migration, script, `db:push`, `drizzle-kit push` or the dev server against it. Database checks run only on the local Postgres from Task 2.
- Version format `^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$`, compared numerically per part, stored as text, default `1.0`.
- A pin is an invariant: every (course, lesson) a course shows has one. Course-scoped readers INNER JOIN (or LEFT JOIN where the placeholder-row comments require it) through it; none falls back to the working copy.
- Learner payloads never carry a version number or `contentUpdatedAt`.
- Copy, verbatim: `v1.0 is used by 3 courses. Enter a higher version to make changes.` / `v1.0 is used by 1 course. …` / `v1.0 was used by a course. Enter a higher version to make changes.`; `Up to date with Disciplines`; `Disciplines has v1.1. Update this lesson`; `Do you want to update this lesson?`; `Content is v1.0. Edit it in Disciplines.`
- Every server route self-guards. Client fetching only through TanStack Query hooks in `src/data-hooks`. jotai for state, react-hook-form + zod for forms, Base UI components, presentational/container split, kebab-case files, logical CSS properties, semantic tokens only, AAA text contrast, locked states state their reason.
- In tests import with `#/`, never `@/`; assert on what the consumer received; each regression test is seen red first. Never run `biome format --write src` (format only touched files). Do not commit an unrelated `routeTree.gen.ts` diff.
- Outer columns in correlated subqueries must be table-qualified (`outerRef` in `progress-components.ts`).

## Review Focus

1. A course takes 1.1 while an SME is mid-edit of 1.1: the SME's next save must be refused with the locked message and lose none of their typed work. (Tasks 4, 10)
2. `1.10` vs `1.9`, and a typed `1`, `v1.1`, `01.1`, `1.1 `: compared as numbers; malformed input refused at the field, surrounding spaces trimmed. (Task 1)
3. A snapshot whose video or material is empty while the working copy has one (and the reverse): the course shows the snapshot's emptiness, never the working copy's value. (Tasks 3, 5)
4. Two courses on different versions of one lesson, one learner enrolled in both: chunk regeneration in one must not delete mastery from the other. (Task 6)
5. A borrowed lesson: updating in course B changes only B, and the caller needs authority over B, not over the module's owner. (Tasks 3, 9)

## File Structure

- `src/lib/lesson-version.ts` — pure: parse, compare, format, locked message, `versionEditError`.
- `src/db/lesson-versions.ts` — snapshots, pins, sync, update. The only writer of both new tables.
- `src/db/lesson-content-edit.ts` — the working-copy edit gate (`applyContentEdit`).
- `src/db/course-lesson-content.ts` — course-scoped content reads through the pin.
- `src/db/migrate-lesson-versions.ts` — migration.
- `src/lib/index-lesson-versions.server.ts` — Viper chunks per snapshot.
- `src/routes/api/admin/courses.$courseId.lessons.$lessonId.version.ts` — update one course.
- UI under `src/components/admin/`: `lesson-config/version-field.tsx`, `lesson-config/version-field-container.tsx`, `version-chip.tsx`, `update-lesson-version-dialog.tsx`, `update-lesson-version-dialog-container.tsx`.

---

### Task 1: Version rules (pure)

**Files:** Create `src/lib/lesson-version.ts`, `src/lib/__tests__/lesson-version.test.ts`

**Interfaces — Produces:**
```ts
export const DEFAULT_LESSON_VERSION = '1.0';
export const lessonVersionSchema: z.ZodType<string>; // trims, then the regex; message 'Use a number like 1.0'
export function compareVersions(a: string, b: string): number; // <0, 0, >0
export function formatVersion(version: string): string; // 'v1.0'
export function lockedVersionMessage(version: string, courseCount: number): string;
export type VersionState = { version: string; highestTaken: string | null };
export function isVersionLocked(s: VersionState): boolean; // highestTaken === version
/** Null when a content edit carrying `next` is allowed; else why not. `undefined` = keep the current version. */
export function versionEditError(s: VersionState, next: string | undefined):
  | null | { reason: 'locked' } | { reason: 'not-higher'; than: string };
```

- [ ] **Step 1: Failing tests**
```ts
expect(compareVersions('1.10', '1.9')).toBeGreaterThan(0);
expect(compareVersions('2.0', '1.99')).toBeGreaterThan(0);
for (const bad of ['1', 'v1.1', '01.1', '1.01', '1.1.1', '', '12345.0']) expect(lessonVersionSchema.safeParse(bad).success).toBe(false);
expect(lessonVersionSchema.parse(' 1.1 ')).toBe('1.1');
expect(lockedVersionMessage('1.0', 3)).toBe('v1.0 is used by 3 courses. Enter a higher version to make changes.');
expect(lockedVersionMessage('1.0', 1)).toBe('v1.0 is used by 1 course. Enter a higher version to make changes.');
expect(lockedVersionMessage('1.0', 0)).toBe('v1.0 was used by a course. Enter a higher version to make changes.');
const taken = { version: '1.0', highestTaken: '1.0' };
expect(versionEditError(taken, undefined)).toEqual({ reason: 'locked' });
expect(versionEditError(taken, '1.0')).toEqual({ reason: 'locked' });
expect(versionEditError(taken, '0.9')).toEqual({ reason: 'not-higher', than: '1.0' });
expect(versionEditError(taken, '1.1')).toBeNull();
const open = { version: '1.2', highestTaken: '1.0' };
expect(versionEditError(open, undefined)).toBeNull();
expect(versionEditError(open, '1.1')).toBeNull(); // lowering an untaken number is fine
expect(versionEditError(open, '1.0')).toEqual({ reason: 'not-higher', than: '1.0' });
expect(versionEditError({ version: '1.0', highestTaken: null }, '0.1')).toBeNull();
```
- [ ] **Step 2:** `npx vitest run src/lib/__tests__/lesson-version.test.ts` → FAIL (module missing)
- [ ] **Step 3:** Implement. Client-safe: zod only.
- [ ] **Step 4:** Same command → PASS
- [ ] **Step 5:** Commit `feat(lessons): version rules`

### Task 2: Schema, migration, local Postgres

**Files:** Modify `src/db/schema.ts`, `package.json`; Create `src/db/migrate-lesson-versions.ts`, `src/db/__tests__/migrate-lesson-versions.test.ts`, `src/db/__tests__/support/local-pg.ts`

**Interfaces — Produces:**
- `lessonsTable.version: text not null default '1.0'`, `lessonsTable.contentUpdatedAt: timestamp not null default now()`.
- `lessonVersionsTable` (`lesson_versions`): `id, lessonId, version, name, videoProvider, videoRef, otherVideoIds, text (nullable), keyPoints, quiz, proTips, links, assignments, jobOfTheDay, testThis, extraTab, createdAt`; unique index `lesson_versions_lesson_version_idx`. `lesson_id` cascades on delete. Column types match the working copy's (`json` stays `json`, so `json_array_length` works).
- `courseLessonVersionsTable` (`course_lesson_versions`): `courseId, lessonId, lessonVersionId, updatedAt`; PK (`courseId`, `lessonId`); all three FKs cascade; index on `lessonVersionId`.
- `lessonKnowledgeChunksTable.lessonVersionId` (nullable FK, cascade), unique index `lesson_knowledge_chunks_lesson_version_idx`; the unique index on `lesson_id` becomes plain.
- `docs.lessonVersionId` (nullable FK, cascade) + index.
- `LESSON_VERSIONS_STATEMENTS: SQL[]`; script `db:migrate-lesson-versions`.
- `localPg(): { db, pool } | null` — null unless `TEST_DATABASE_URL` is set; THROWS unless its host is `localhost` or `127.0.0.1`.

- [ ] **Step 1: Local database.** The schema comes from `drizzle-kit export`, which prints SQL and opens no connection; never from push. Export BEFORE editing `schema.ts`, so the migration is tested against the real "before":
```bash
npx drizzle-kit export --dialect=postgresql --schema=./src/db/schema.ts > "$SCRATCH/schema-before.sql"
createdb rmtp_versions_test && psql rmtp_versions_test -c 'create extension if not exists vector' -f "$SCRATCH/schema-before.sql"
```
Expected: no SQL errors. If `halfvec`/hnsw indexes fail on the local pgvector, skip those index statements only. Later tasks reset with `dropdb`/`createdb`, this file, then the migration.

- [ ] **Step 2: Failing test** (migration shape, plus Postgres when `TEST_DATABASE_URL` is set via `describe.skipIf`):
```ts
it('never drops or truncates data', () => { for (const s of sqls()) expect(s).not.toMatch(/drop (table|column)|truncate|delete\s+from/i); });
// Postgres: course 1 owns module M with lesson A (material) and lesson B (none); course 2 borrows M; lesson C unplaced.
it('snapshots and pins every course showing a lesson, borrowed included', ...) // 4 pins, 2 snapshots, both '1.0'; B.text is null; none for C
it('labels existing chunk and lesson doc rows', ...)  // lesson_version_id set to A's snapshot; an uploaded doc (lesson_slug null) stays null
it('is re-runnable and picks up later placements', ...) // run twice → same counts; place C → third run adds 1 snapshot + pins
it('backfills content_updated_at once', ...) // greatest(lessons.updated_at, material.updated_at); a re-run leaves a later value alone
```
- [ ] **Step 3:** Run → FAIL. `TEST_DATABASE_URL=postgres://localhost/rmtp_versions_test npx vitest run src/db/__tests__/migrate-lesson-versions.test.ts`
- [ ] **Step 4:** Implement in one transaction. Duplicate material rows: first by `id`. `extra_tab` from the discipline slug (`FLAGSHIP_DISCIPLINE_SLUG` → `jobOfTheDay`, else `testThis`). Chunk/doc labelling only `where lesson_version_id is null`, using the lesson's lowest snapshot id. Swap the chunk index: `drop index if exists "lesson_knowledge_chunks_lesson_idx"` then create the new ones. Document "migrate → deploy → migrate again" in the header comment.
- [ ] **Step 5:** Run → PASS. `npx tsc --noEmit` clean.
- [ ] **Step 6:** Commit `feat(lessons): lesson_versions schema and migration`

### Task 3: Snapshots, pins, and every membership write

**Files:** Create `src/db/lesson-versions.ts`, `src/db/__tests__/lesson-versions.test.ts`; Modify `src/db/placements.ts` (`linkLesson`, `unlinkLesson`, `movePlacement`), `src/db/copy-discipline-module.ts`, `src/db/course-remixes.ts` (`remixCourse`, `unremixCourse`), `src/db/admin.ts` (`deleteModule`)

**Interfaces — Produces:**
```ts
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Pin every member lesson lacking a pin to the working copy's version (creating its snapshot if untaken) and delete pins of lessons the course no longer shows. Existing pins are never moved. */
export function syncCourseLessonVersions(tx: Tx, courseIds: number[]): Promise<{ createdVersionIds: number[] }>;
export function getCourseIdsShowingModule(tx: Tx, moduleId: number): Promise<number[]>;
export type UpdateCourseLessonResult =
  | { ok: true; version: string; createdVersionIds: number[] }
  | { ok: false; reason: 'not-found' | 'stale' | 'current' };
/** `toVersion` is what the dialog showed; 'stale' when the working copy has moved on. */
export function updateCourseLessonVersion(i: { courseId: number; lessonId: number; toVersion: string }): Promise<UpdateCourseLessonResult>;
export function highestTakenVersions(lessonIds: number[]): Promise<Map<number, string>>; // compareVersions in JS
export function getCoursesUsingLesson(lessonId: number): Promise<{ id: number; name: string }[]>;
```
`linkLesson`, `copyDisciplineModuleIntoCourse` and `remixCourse` results gain `createdVersionIds: number[]` for Task 7.

- [ ] **Step 1: Failing Postgres tests**
  - `linking a lesson pins the working copy for the owner and every borrower`
  - `a second course shares the existing snapshot of the same version` (1 snapshot, 2 pins)
  - `editing the working copy changes neither the snapshot nor the pin`
  - `a lesson with no material or video snapshots as null, and stays null after the working copy gains them`
  - `unlinking drops the pin; re-linking takes the CURRENT version`
  - `unlinking from one of two modules keeps the pin`
  - `moving between modules of one course keeps the pin`
  - `remix pins the working copy's version even when the source course is pinned lower`
  - `unremix and deleteModule drop the pins they orphan`
  - `updateCourseLessonVersion moves one course only` (borrower updated, owner's pin unchanged)
  - `updateCourseLessonVersion: stale / current / not-found`
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** Implement. Membership = `course_modules` ⋈ `module_lessons`. Lock the affected `lessons` rows `for update` ordered by id before reading content, so a snapshot and a content edit serialise. Snapshot insert `on conflict (lesson_id, version) do nothing`. Each membership write moves into a transaction that ends with the sync; cache invalidation stays outside and after. `updateCourseLessonVersion` also evicts that course's details cache and the lesson's playback.
- [ ] **Step 4:** Run → PASS; `npx vitest run src/db` → PASS (update mocks that stub these writers)
- [ ] **Step 5:** Commit `feat(lessons): courses pin a snapshot of each lesson`

### Task 4: The working-copy edit gate

**Files:** Create `src/db/lesson-content-edit.ts` + test; Modify `src/db/lesson.ts` (`upsertLessonMaterial`), `src/db/admin.ts` (`setLessonVideo`, `writeLessonAlternateVideos`, `updateLessonName`), `src/lib/admin-schemas.ts`, routes `lessons.$lessonId.ts`, `.material.ts`, `.video.ts`, `.alternate-videos.ts`, and their tests

**Interfaces — Produces:**
```ts
export class VersionEditError extends Error { body: VersionConflictBody }
export const versionConflictSchema = z.object({ error: z.string(), code: z.literal('version'), version: z.string(), highestTaken: z.string().nullable() });
/** Locks the lesson row, applies `versionEditError`, writes version + contentUpdatedAt. Call first inside the writer's tx. Throws VersionEditError; null when no such lesson. */
export function applyContentEdit(tx: Tx, lessonId: number, version: string | undefined): Promise<{ id: number; slug: string } | null>;
export function setLessonVersion(lessonId: number, version: string): Promise<{ id: number; version: string } | null>;
```
Bodies of the four content writes accept optional `version: lessonVersionSchema`. `PATCH /lessons/:id` also accepts a strict `{ version }` alone. Refusal: `409` with `VersionConflictBody`; `error` is the locked message, or `Enter a version higher than v1.0.`

- [ ] **Step 1: Failing tests** — Postgres: for EACH of material, video, add language, remove language, rename: `refused on a taken version and nothing is written`; `accepted with a higher version, which is stored`; `free on an untaken version`. Plus: `a course taking 1.1 between two saves makes the second save refused` (Review Focus 1); `settings (visibility, levels, paid, debrief) save on a taken version and do not touch content_updated_at`. Routes: `409 body parses as versionConflictSchema`; `version reaches the writer` (assert the stub's arguments, for each route); `the config schema still rejects version`.
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** Implement; every writer runs in a transaction whose first call is `applyContentEdit`. `setLessonVideo`, alternates, rename no longer evict learner caches (the working copy is not what learners see): delete those calls and any helper left unused.
- [ ] **Step 4:** Run `npx vitest run src/db src/routes/api/admin` → PASS
- [ ] **Step 5:** Commit `feat(lessons): a taken version is locked; content edits need a higher one`

### Task 5: Learner reads go through the pin

**Files:** Create `src/db/course-lesson-content.ts` + test; Modify `src/db/course.ts` (`getCourseDetails`), `src/lib/course-details-shape.ts`, `src/db/lesson-playback.ts`, `src/db/lesson-transcript.ts`, `src/lib/lesson-debrief-source.server.ts`, `src/db/lesson-score-facts.ts`, `src/lib/lesson-score.server.ts`, `src/routes/api/lesson/material.ts`, `src/db/course-content.ts`, `src/lib/course-content.ts`, plus callers of changed signatures

**Interfaces — Produces:**
```ts
/** Same shape as today's LessonMaterial; null when the pinned snapshot has no material. `extraTab` is the snapshot's. */
export function getCourseLessonMaterial(lessonSlug: string, courseId: number): Promise<LessonMaterial | null>;
export function getPinnedVersionId(lessonSlug: string, courseId: number): Promise<number | null>;
/** The course whose credentials fetch a snapshot's transcript: lowest pinned course owning a module with the lesson, else lowest pinned course. */
export function getHomeCourseIdForVersion(versionId: number): Promise<number | null>;
selectAuthoredQuiz(lessonSlug: string, courseId: number)
getScoreFacts(userId: string, lessonSlug: string, courseId: number)
getLessonTranscript(lessonSlug, { courseId, versionId }) // cache key `lesson-transcript:${lessonSlug}:${versionId}`
// GatedLesson gains `versionId: number`
```
`getLessonMaterial(slug)` remains for the Disciplines form only.

- [ ] **Step 1: Failing tests** — Postgres, courses 1 (pinned 1.0) and 2 (pinned 1.1), working copy at 1.2, all with different content:
  - `getCourseDetails returns each course's pinned name and hasVideo`
  - `material, quiz key, playback ref, languages and agent text come from the pin`
  - `a snapshot without material answers null though the working copy has some` (Review Focus 3)
  - `the closing tab is the snapshot's after the lesson changes discipline`
  - `resolveDebriefSource uses the served course's snapshot and that version's home course`
  - Unit: `/api/lesson/material` passes the gate's `courseId` to `getCourseLessonMaterial` on BOTH the normal and archived branches; the learner course payload has no `version` or `contentUpdatedAt` key on any lesson.
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** Implement. In `getCourseDetails` overlay `name, videoProvider, videoRef, otherVideoIds` from the snapshot and drop `version`/`contentUpdatedAt` before caching. Two courses on one version must build the same transcript context (hence the home course), or chunk fingerprints flap. Grep `getLessonMaterial(`, `selectAuthoredQuiz(`, `getScoreFacts(`, `getLessonTranscript(` and account for every caller.
- [ ] **Step 4:** Run `npx vitest run src/db src/lib src/routes/api/lesson` → PASS; `npx tsc --noEmit`
- [ ] **Step 5:** Commit `feat(lessons): learners read their course's snapshot`

### Task 6: Progress facts and debrief chunks per snapshot

**Files:** Modify `src/db/progress-components.ts`, `src/db/course-progress.ts`, `src/db/course.ts` (`getMyCourses`), `src/db/lesson-test.ts` (`getDebriefFacts`), `src/lib/debrief-access.server.ts`, `src/db/knowledge-chunks.ts`, `src/lib/knowledge-chunks.server.ts`, `src/lib/debrief-attempt.server.ts`, `src/lib/prepared-debrief.server.ts`, tests

**Interfaces:**
- `progressComponentColumns` / `progressComponentGroupBy` read content from `lessonVersionsTable` (video, quiz, sections, text, `extra_tab`); both queries LEFT JOIN pin then snapshot after `lessonsTable`, keeping the placeholder-row behaviour. The two queries stay in step.
- `chunksClearedSql(userId, lessonVersionId)`, `chunksTotalSql(lessonVersionId)`, `hasChunksSql(lessonVersionId)`.
- `getDebriefFacts(userId, lessonSlug, lessonId, courseId)`.
- `selectLessonChunks(lessonVersionId)`; `selectCurrentChunks` likewise; `upsertLessonChunks` conflicts on `lessonVersionId`; `nextChunkVersion(lessonId): Promise<number>` = 1 + max `version` over ALL of the lesson's chunk rows, so chunk ids (`v3-c1`) never collide across snapshots.
- `carryOverMastery(lessonId, mapping, previousVersion, ex?)` and `staleMasteryRows(lessonId, previousVersion)` match `v{previousVersion}-%` only.
- `mapToCurrentChunkIds(scores, mapping, currentVersion)`: a non-current id goes through `mapping[id]` with no "one version old" check (numbers are no longer consecutive within a snapshot).
- Claim key: `knowledge-chunks:claim:${lessonVersionId}`.

- [ ] **Step 1: Failing tests** — Postgres: `quiz, sections, video presence and bearing follow the pin, not the working copy`; `regenerating snapshot 1.1's chunks leaves mastery of 1.0's chunk ids alone` (Review Focus 4); `concurrent regeneration of two snapshots never issues the same chunk version` (take the lesson row lock in the transaction); `a passed debrief stays passed after the course updates; an unpassed one has chunksCleared 0`. Unit: `an open attempt from 1.0 answered after the update is graded, records no mastery against 1.1 ids, and can still pass`; `getDebriefAccess passes the gate's courseId to getDebriefFacts`.
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** Implement; every `GROUP BY` covers the new non-aggregated columns (pin with the capture helper AND run on Postgres).
- [ ] **Step 4:** `npx vitest run src/db src/lib` → PASS
- [ ] **Step 5:** Commit `feat(debrief): progress and key points follow the course's version`

### Task 7: Viper searches snapshots

**Files:** Create `src/lib/index-lesson-versions.server.ts`, `scripts/index-lesson-versions.ts`, tests; Modify `src/ai/embeddings.ts`, `src/db/knowledge-base.ts`, `src/lib/course-content.ts`, `src/ai/tools/search-kb.ts`, `lessons.$lessonId.material.ts`, `src/db/migrate-lesson-embeddings.ts`, routes that gained `createdVersionIds` (`modules.$moduleId.lessons.ts`, `courses.$courseId.modules.from-library.ts`, `courses.$courseId.remixes.ts`, `courses.ts`)

**Interfaces — Produces:**
```ts
generateLessonEmbeddings(i: { lessonVersionId: number; lessonSlug: string; version: string; html: string })
  // replaces rows of that lessonVersionId only; sourcePath `lesson:${slug}@${version}` (the docs unique key omits lesson_slug)
export function indexLessonVersions(ids: number[]): Promise<{ indexed: number; failed: number[] }>; // never throws
export function unindexedLessonVersionIds(): Promise<number[]>; // has text, no docs rows
searchKB(query, { courseId, lessonVersionIds: number[] })
allowedLessonVersionIds(course: GatedCourse): number[] // replaces allowedLessonSlugs
newestVersionIdForSlug(lessonSlug: string): Promise<number | null> // admin preview
```
Script `db:index-lesson-versions` runs `indexLessonVersions(await unindexedLessonVersionIds())`.

- [ ] **Step 1: Failing tests** — `searchKB receives only the gated course's snapshot ids` (assert stub args); `uploaded-document filter still requires lesson_slug is null`; `saving material no longer embeds`; `linking, copying a module, remixing, creating a course and updating a lesson each index the created ids via waitUntil`; `an indexing failure does not fail the route`; `the preview uses the newest snapshot, and no lesson chunks when there is none`.
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** Implement. `migrate-lesson-embeddings` becomes a call to the new script's function or is deleted with its test and package script.
- [ ] **Step 4:** `npx vitest run src/ai src/db src/routes/api` → PASS
- [ ] **Step 5:** Commit `feat(viper): lesson search follows the course's version`

### Task 8: Admin reads and payloads

**Files:** Modify `src/lib/admin-schemas.ts`, `src/db/admin.ts` (`getCourseBoard`, `resolveLessonPlayback`, `getCourseLessonPosters`), `src/db/editor.ts` (`getOrgLibrary`), `src/db/library-lessons.ts`, `src/components/admin/editor-board-updates.ts`, `lessons.$lessonId.video-playback.ts`, `src/data-hooks/use-lesson-video-playback.ts`, `src/data-hooks/keys.ts`, `lesson-video-modal-container.tsx`, `video-section-container.tsx`, tests and stories that build these payloads

**Interfaces — Produces:**
- `boardLessonSchema` += `version` (this course's), `disciplineVersion` (working copy's), `contentUpdatedAt: z.coerce.date()` (working copy's). Name, video, `isConfigured`, `quizQuestionCount` come from the pin.
- `libraryLessonSchema` += `version`, `highestTaken: z.string().nullable()`, `contentUpdatedAt`. `courseCount` already exists.
- `resolveLessonPlayback(lessonId, courseId, lang, source: 'course' | 'discipline')`; route param `?source=` defaults to `course`; `useLessonVideoPlayback({ lessonId, courseId, lang, source })` with `source` in the query key. The Disciplines dialog passes `discipline`; the play modal and course dialog pass `course`.
- `boardLessonFromLibrary`: `version` and `disciplineVersion` are both the library lesson's `version`.

- [ ] **Step 1: Failing tests** — Postgres: `board shows the pinned name/video/quiz count and both versions`; `a lesson a course shows twice appears once per placement, not multiplied`; `posters use the pinned ref in a course and the working ref on the shelf`; `library reports highestTaken by number, 1.10 over 1.9`. Unit: route forwards `source`; the Disciplines dialog's playback hook receives `discipline`, the play modal's receives `course`; the editor payload still has no `videoRef`.
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** Implement
- [ ] **Step 4:** `npx vitest run` → PASS; `npx tsc --noEmit`
- [ ] **Step 5:** Commit `feat(admin): boards carry the course's version and the working copy's`

### Task 9: Update route, delete block, no lesson creation in a course

**Files:** Create `src/routes/api/admin/courses.$courseId.lessons.$lessonId.version.ts` + test; Modify `lessons.$lessonId.ts` (`deleteLessonHandler`), `src/db/admin.ts` (`deleteLesson`; delete `createLesson`), `modules.$moduleId.lessons.ts`, `src/lib/admin-schemas.ts` (`addModuleLessonInputSchema` → link only), tests

**Interfaces — Produces:**
- `POST /api/admin/courses/:courseId/lessons/:lessonId/version` body strict `{ toVersion }`. Guard `requireCoursePermission(headers, courseId, 'structure', 'update')` on the VIEWED course. `200 { version }`; `404`; `409 { error: 'Disciplines has changed since you opened this. Try again.', code: 'stale' }`; `409 code: 'current'`. Indexes created ids via `waitUntil`.
- `deleteLesson(lessonId): Promise<{ ok: true } | { ok: false; reason: 'not-found' } | { ok: false; reason: 'in-use'; courses: { id: number; name: string }[] }>`, checked under the lesson row lock. Route: `409 { error, code: 'in-use', courses }`, `error` = `Used by Course A and Course B. Remove it from those courses first.`
- `POST /modules/:id/lessons` with `{ name }` → 400.

- [ ] **Step 1: Failing tests** — `403 without structure on the viewed course, even when staff of the module's owner` and `200 for the borrower's staff` (Review Focus 5; assert the guard's `courseId` argument); `stale and current map to 409`; `404 for a lesson the course does not show`; `delete refused and names the courses, and the row survives`; `delete works with no course, cascading snapshots`; `{ name } is refused`.
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** Implement. Let the route tree regenerate; commit only this route's lines.
- [ ] **Step 4:** `npx vitest run src/routes/api/admin src/db` → PASS
- [ ] **Step 5:** Commit `feat(admin): update one course's lesson; block deleting a used lesson`

### Task 10: Version field and Save in the Disciplines editor

**Files:** Create `lesson-config/version-field.tsx`, `lesson-config/version-field-container.tsx`, `src/data-hooks/use-set-lesson-version.ts`, `src/data-hooks/version-conflict.ts`, tests; Modify `src/atoms/admin.ts`, `video-section-container.tsx`, `alternate-videos-container.tsx`, `library-lesson-heading-container.tsx`, `material-section-container.tsx`, `material-save-button.tsx`, `material-save-button-container.tsx`, `library-lesson-config-dialog-container.tsx`, the five content mutation hooks, stories

**Interfaces — Produces:**
```ts
export const lessonVersionDraftAtomFamily: (lessonId: number) => PrimitiveAtom<string | null>; // null = untouched
/** What every content write in the dialog asks before mutating. */
export function useVersionGate(lesson: { id: number } & VersionState & { courseCount: number }): {
  version: string | undefined;           // send this with the write
  blocked: string | null;                // locked / not-higher / malformed message
  refuse: () => void;                    // show the message at the field and focus it
};
VersionField props: { id, register, error?, lockedReason: string | null, disabled }
readVersionConflict(res: Response): Promise<string | null> // 409 code 'version' → its message
```
- Field: label `Version`, under "Other languages" (and present when there is no video), text input, `inputMode="decimal"`, hint = `lockedReason`, wired by `aria-describedby`; error `role="alert"`. Own react-hook-form with the zod schema, mirrored to the draft atom.
- Save button label `Save` (`Saving…`, `Save, unsaved changes`), lit when material OR version is dirty. Submit with only the version dirty calls `useSetLessonVersion` and skips material validation.
- On a blocked write: no request, message at the field, focus moves there. On a server 409: same, typed work kept, library refetched.
- On success: draft → null; invalidate `orgLibrary`, `editorBoard`, `courseBoards`.

- [ ] **Step 1: Failing tests** — `locked lesson shows "v1.0 is used by 3 courses. Enter a higher version to make changes."`; for each of Save, Replace video, Add language, Remove language, rename: `blocked while locked with no draft: fetch not called, field focused` and `with draft 1.1: request body carries version '1.1'`; `malformed draft blocks Save`; `version-only Save sends PATCH { version } and no material POST`; `a 409 keeps the typed material and shows the message` (Review Focus 1); `the eye toggle works while locked`; `Word-doc fill does not touch the version`; `closing the dialog clears the draft`.
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** Implement (presentational/container split).
- [ ] **Step 4:** `npx vitest run src/components/admin src/data-hooks` → PASS
- [ ] **Step 5:** Commit `feat(editor): version field in the lesson editor`

### Task 11: Chips, update dialog, read-only course content

**Files:** Create `version-chip.tsx`, `update-lesson-version-dialog.tsx`, `update-lesson-version-dialog-container.tsx`, `src/data-hooks/use-update-course-lesson-version.ts`, tests + stories; Modify `lesson-card.tsx` (replace `VersionChip` placeholder with a `version` prop), `library-lesson-card.tsx` (replace hidden "Vers 3.4"), `editor-lesson-card-container.tsx` (drop `onEdit`), `sortable-lesson-card.tsx`, `lesson-config-dialog-container.tsx`, `video-section-container.tsx` (`readOnly` prop), `borrowed-lesson-list` and its cards, `delete-lesson-dialog-container.tsx`, `use-delete-lesson.ts`, `src/components/ui/chip.tsx` (comment on `solid-accent`), `src/atoms/admin.ts`; Delete `create-lesson-dialog-container.tsx`, `use-create-lesson.ts`, `createLessonModuleIdAtom`, the module column's add-lesson control

**Interfaces — Produces:**
```ts
VersionChip props: { version: string; disciplineVersion: string; onUpdate?: () => void; isPending?: boolean }
updateLessonVersionAtom: { courseId; courseName; lessonId; lessonName; from; to; contentUpdatedAt } | null
useUpdateCourseLessonVersion(): mutation { courseId, lessonId, toVersion }
```
- Equal: `solid-success`, `v1.0`, `aria-disabled`, tooltip `Up to date with Disciplines`. Different: `solid-accent`, `v1.0` + `ArrowUp` (aria-hidden), a button, name and tooltip `Disciplines has v1.1. Update this lesson`. Add `normal-case` so the chip reads `v1.0`. Contrast measured in both themes, AAA.
- Borrowed modules' cards show the same clickable chip. A caller the server refuses sees the 403 as `Only someone who can edit this course can update its lessons.`
- Dialog (Base UI `AlertDialog`): title `Do you want to update this lesson?`; body names lesson and course, `v1.0 → v1.1` with an accessible text form, `Last edited 24 Nov 2026, 09:38` (date-fns), and `Learners keep their progress. A debrief they have not passed starts over. You cannot go back to v1.0.`; buttons `Cancel` / `Update lesson`. A `stale` 409 keeps the dialog open with the route's message and refetches.
- Success invalidates `editorBoard`, `courseBoards`, `allLessonPosters`, `lessonPlaybacks(lessonId)`, `orgLibrary`.
- Course "Configure lesson": Content tab = read-only video (`source: 'course'`), credential flow, `Content is v1.0. Edit it in Disciplines.`; no URL form, languages, captions, material form or Save.
- Delete dialog for a used lesson: names the courses (from the editor board cache, else the 409 body), no confirm form, reason visible.

- [ ] **Step 1: Failing tests** — chip: equal → not actionable; different → `onUpdate` called once by click and Enter, and inert while pending; dialog: confirm posts `{ toVersion: '1.1' }` to THAT course's URL; cancel posts nothing; stale keeps it open with the message; library card shows `v1.0` visibly; editor course card has no `Edit lesson` button; borrowed card chip opens the dialog with the BORROWING course's id; Configure dialog renders `Content is v1.0. Edit it in Disciplines.` and no textbox; delete dialog for `courseCount > 0` has no submit; no "add lesson" control in a course column.
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** Implement; storybook stories for both chip states and the dialog.
- [ ] **Step 4:** `npx vitest run` → PASS; `npx tsc --noEmit`; `npx biome check` on touched files
- [ ] **Step 5:** Commit `feat(editor): version chips and update dialog`

### Task 12: End-to-end check and runbook

**Files:** Create `docs/runbooks/lesson-versions-rollout.md`

- [ ] **Step 1:** Fresh local Postgres from the BEFORE schema with seed data (3 courses, one borrowing, quiz + debrief rows), run the migration, then through the db layer: edit refused → bump to 1.1 → courses unchanged → update one course → only its details, material, quiz, playback ref, progress and chunks change; new course takes 1.1; delete refused; re-run migration changes nothing.
- [ ] **Step 2:** Run the app against that LOCAL database (`DATABASE_URL` exported and printed before start; confirm the host is localhost) and walk through Disciplines edit, locked field, chip colours in both themes, update dialog, Configure lesson, learner lesson page. Screenshots. If auth or seed data make this impractical, say so and leave it to the user.
- [ ] **Step 3:** `npx vitest run`, `npx tsc --noEmit`, `pnpm build`, and grep the client assets for `drizzle` and `lesson_versions` (must be absent).
- [ ] **Step 4:** Runbook: `! pnpm db:migrate-lesson-versions` → deploy → run it again → `! pnpm db:index-lesson-versions` → what to click to verify. `scripts/import-course.ts` and other scripts that insert placements directly write no pins: re-run the migration after any of them. Note that between steps 1 and 2 old code cannot regenerate debrief key points (the index it conflicts on is gone), so deploy straight after.
- [ ] **Step 5:** Commit `docs: lesson versions rollout`
