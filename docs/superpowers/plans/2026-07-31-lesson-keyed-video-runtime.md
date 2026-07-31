# Lesson-Keyed Video Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the learner video runtime off `videoId` onto lesson identity, and off the Synthesia-only fetch onto the provider-agnostic `resolvePlayback`, so a lesson configured through the admin UI plays, gates, and records progress regardless of provider.

**Architecture:** Three seams change together. (1) `Playback` grows from `{url, kind, expiresInSeconds}` into a superset carrying `poster`, `captions`, and `status`, so it can replace Synthesia's `VideoResponse` without losing subtitles, posters, or the still-rendering state. (2) `videos_progress` swaps its unkeyed `video_id varchar` for `lesson_id integer` with a real foreign key — the table is empty, so this is a schema change with nothing to migrate. (3) Every learner-side identifier becomes `lessonSlug` (client) or `lessonId` (server), retiring `getLessonByVideoId` and the `::text` join cast.

**Tech Stack:** TanStack Start + React 19, Drizzle + Postgres (Neon), TanStack Query, jotai, zod, Vitest, hls.js (lazy-loaded), Upstash Redis.

## Global Constraints

- **The database is greenfield for progress.** `videos_progress` holds 0 rows / 0 users (measured 2026-07-31 against `DATABASE_URL`, confirmed by the user as the only database that matters). No backfill, no dual-write, no compatibility window. 2 course subscriptions and 1 quiz answer exist, so accounts are real — do not truncate other tables.
- **Never regress captions.** Subtitles reaching `<track>` is an accessibility requirement, not a feature. Any provider that cannot supply them must say so explicitly, never render an uncaptioned player silently. Same for contrast/legibility rules in `CLAUDE.md`.
- **Signed URLs must never outlive their cache entry.** `cacheWithRedis`'s third argument is an `expiresExtractor`; every playback cache MUST pass one derived from the URL's own expiry. A cached expired URL is a broken player with no error path.
- **`lessons.video_id` is a `uuid` column; Mux playback ids are not uuids.** Nothing in this plan may attempt to store a Mux ref there.
- Imports in files touched by route tests use `#/`, never `@/` — vitest cannot resolve `@/`.
- Presentational components stay hookless; container components own state via jotai + TanStack Query.
- Logical CSS properties only (`ms-*`/`me-*`/`ps-*`/`pe-*`, `start-*`/`end-*`).
- Run `pnpm test`, `pnpm tsc --noEmit -p tsconfig.json`, and `pnpm biome check <files>` before every commit. Confirm each new test fails before implementing it.

## Security Note — Fix Lands in Task 2

`POST /api/user/report-video-progress` currently accepts **any** `videoId` string with no check that it belongs to a lesson the caller may watch. Any authenticated user can self-report full coverage for arbitrary videos and unlock every gated lesson. Re-keying onto `lessonId` is the natural moment to close this: Task 2 authorizes the report against the caller's subscription and the lesson's own gate. Do not skip that step — it is the reason this migration is a security improvement and not just a refactor.

## File Structure

| File | Responsibility after this plan |
| --- | --- |
| `src/lib/video-providers/resolve.server.ts` | Resolves `(provider, ref, creds)` → the full `Playback` superset. Single resolver for admin preview **and** learner player. |
| `src/lib/video-providers/playback-to-state.ts` | **New, pure.** `Playback` → `VideoFetchState`. Replaces `video-response-to-state.ts`. |
| `src/db/videos-progress.ts` | Progress read/write keyed on `lessonId`. |
| `src/db/lesson-playback.ts` | **New.** Resolves a lessonSlug → its course's credentials → cached `Playback`. |
| `src/routes/api/lesson/playback.ts` | **New.** Replaces `api/lesson/video.ts`. Session + gate + provider-agnostic playback. |
| `src/routes/api/user/{video-progress,report-video-progress}.ts` | Keyed on `lessonSlug`; report path is authorized. |
| `src/components/video-player/attach-media.ts` | **New.** Attaches a `file` or `hls` source to a `<video>`, lazy-loading hls.js. Extracted from the admin `video-preview.tsx` so both players share it. |
| `src/atoms/lesson-video.ts`, `src/hooks/data/use-lesson-video.ts` | Keyed on `lessonSlug`, typed `Playback`. |
| Sidebar + `lesson-main` read models | `lessonPercents` keyed by `lessonSlug`; `LessonLike.videoId` → `hasVideo: boolean`. |
| `src/lib/lesson-gating.ts` | `GateLesson.videoId` → `GateLesson.hasVideo`. |

**Deleted:** `src/components/lesson-main/video-response-to-state.ts`, `getLessonByVideoId` (`src/db/lesson-access.ts`), `src/routes/api/lesson/video.ts`.

---

### Task 1: Extend the Playback contract

**Files:**
- Modify: `src/lib/video-providers/resolve.server.ts:13-88`
- Create: `src/lib/video-providers/playback-to-state.ts`
- Create: `src/lib/video-providers/__tests__/playback-to-state.test.ts`
- Modify: `src/components/admin/lesson-config/video-preview.tsx` (consumes the widened type; no behaviour change)

**Interfaces:**
- Produces: `Playback = { url: string; kind: 'hls' | 'file'; expiresInSeconds: number | null; poster: string | null; captions: { vtt: string } | null; status: 'ready' }`, plus `PlaybackPending = { status: 'rendering' | 'failed' }` and `PlaybackResult = Playback | PlaybackPending`. Also `playbackToState(result: PlaybackResult | undefined, onRetry: () => void): VideoFetchState`.
- Consumes: `VideoFetchState` from `src/components/lesson-main/types.ts` (unchanged).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/video-providers/__tests__/playback-to-state.test.ts
import { describe, expect, it, vi } from 'vitest';
import { playbackToState } from '#/lib/video-providers/playback-to-state';

const ready = {
  status: 'ready' as const,
  url: 'https://cdn/v.mp4',
  kind: 'file' as const,
  expiresInSeconds: 600,
  poster: 'https://cdn/p.jpg',
  captions: { vtt: 'https://cdn/c.vtt' },
};

describe('playbackToState', () => {
  it('is fetching until a result arrives', () => {
    expect(playbackToState(undefined, vi.fn()).status).toBe('fetching');
  });

  it('carries the url, poster and a default English track', () => {
    const state = playbackToState(ready, vi.fn());
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.src).toBe('https://cdn/v.mp4');
    expect(state.poster).toBe('https://cdn/p.jpg');
    expect(state.tracks).toEqual([
      { src: 'https://cdn/c.vtt', srcLang: 'en', label: 'English', kind: 'subtitles', default: true },
    ]);
  });

  it('emits no tracks when the provider has no captions', () => {
    const state = playbackToState({ ...ready, captions: null }, vi.fn());
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.tracks).toEqual([]);
  });

  it('maps a still-rendering video to the rendering state', () => {
    expect(playbackToState({ status: 'rendering' }, vi.fn()).status).toBe('rendering');
  });

  it('maps a failed render to an error with a retry', () => {
    const onRetry = vi.fn();
    const state = playbackToState({ status: 'failed' }, onRetry);
    if (state.status !== 'error') throw new Error('expected error');
    expect(state.onRetry).toBe(onRetry);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/video-providers/__tests__/playback-to-state.test.ts`
Expected: FAIL — collection error, `playback-to-state` does not exist.

- [ ] **Step 3: Widen the Playback types in `resolve.server.ts`**

Replace the `Playback` interface (currently lines 13–26) with:

```ts
export interface Playback {
  status: 'ready';
  url: string;
  kind: 'hls' | 'file';
  /** TTL in seconds from resolution time, not an absolute stamp. Null when the provider gives no expiry. */
  expiresInSeconds: number | null;
  /** Poster frame, or null when the provider has none. */
  poster: string | null;
  /**
   * Subtitle track, or null when the provider has none configured.
   *
   * Null is a real answer, not a placeholder: the caller must surface the
   * absence rather than render an uncaptioned player as if it were complete.
   */
  captions: { vtt: string } | null;
}

/** A video the provider holds but cannot serve yet. */
export interface PlaybackPending {
  status: 'rendering' | 'failed';
}

export type PlaybackResult = Playback | PlaybackPending;
```

In the Mux branch, return:

```ts
return {
  status: 'ready',
  url: `https://stream.mux.com/${ref}.m3u8?token=${token}`,
  kind: 'hls',
  expiresInSeconds: MUX_TTL_SECONDS,
  poster: `https://image.mux.com/${ref}/thumbnail.jpg?token=${token}`,
  // Mux text tracks are not configured on this account; null is honest.
  captions: null,
};
```

In the Synthesia branch, replace the `VIDEO_NOT_AVAILABLE` throw and the return with:

```ts
if (isVideoNotReady(details)) {
  return { status: details.status === 'in_progress' ? 'rendering' : 'failed' };
}
if (!isVideoAvailable(details) || !details.download) {
  throw new PlaybackError('VIDEO_NOT_AVAILABLE', 'VIDEO_NOT_AVAILABLE');
}
const remaining = getVideoExpiry(details.download);
return {
  status: 'ready',
  url: details.download,
  kind: details.download.endsWith('.m3u8') ? 'hls' : 'file',
  expiresInSeconds: remaining === null ? null : Math.max(0, remaining),
  poster: details.thumbnail.image ?? null,
  captions: details.captions.vtt ? { vtt: details.captions.vtt } : null,
};
```

Change the signature to `Promise<PlaybackResult>` and add `isVideoNotReady` to the existing `#/types` import.

- [ ] **Step 4: Write `playback-to-state.ts`**

```ts
import type { PlaybackResult } from './resolve.server';
import type { TrackProps, VideoFetchState } from '#/components/lesson-main/types';

/**
 * Playback → player state. Pure, and the only place a provider's absence of
 * captions turns into an empty track list — so that absence is visible in one
 * place rather than implied across the player.
 */
export const playbackToState = (
  result: PlaybackResult | undefined,
  onRetry: () => void,
): VideoFetchState => {
  if (!result) return { status: 'fetching' };
  if (result.status === 'rendering') return { status: 'rendering' };
  if (result.status === 'failed') {
    return { status: 'error', message: 'This video failed to render', onRetry };
  }
  const tracks: TrackProps[] = result.captions
    ? [{ src: result.captions.vtt, srcLang: 'en', label: 'English', kind: 'subtitles', default: true }]
    : [];
  return { status: 'ready', src: result.url, poster: result.poster ?? undefined, tracks };
};
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm test src/lib/video-providers/ && pnpm tsc --noEmit -p tsconfig.json`
Expected: PASS. Fix any `video-preview.tsx` type errors by reading `playback.status === 'ready'` before `playback.url`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/video-providers src/components/admin/lesson-config/video-preview.tsx
git commit -m "feat(video): widen Playback to carry poster, captions and render status"
```

---

### Task 2: Re-key progress storage onto lessonId, and authorize reporting

**Files:**
- Modify: `src/db/schema.ts:207-239`
- Modify: `src/db/videos-progress.ts` (whole file)
- Modify: `src/routes/api/user/video-progress.ts`, `src/routes/api/user/report-video-progress.ts`
- Modify: `src/routes/api/user/__tests__/video-progress.test.ts`, `src/routes/api/user/__tests__/report-video-progress.test.ts`

**Interfaces:**
- Consumes: `evaluateLessonGate({ userId, lessonSlug })` from `#/lib/lesson-gating.server` (existing; returns `{ subscribed, lessonLock } | null`).
- Produces: `getLessonProgress({ userId, lessonId })`, `recordLessonProgress({ userId, lessonId, progress })`, `hasWatchedLesson({ userId, lessonId })`, all from `#/db/videos-progress`. API routes take `?lessonSlug=` / `{ lessonSlug, progress }`.

- [ ] **Step 1: Write the failing authorization test**

```ts
// append to src/routes/api/user/__tests__/report-video-progress.test.ts
it('refuses to record progress for a lesson the caller cannot watch', async () => {
  getSession.mockResolvedValue({ user: { id: 'u1' } });
  evaluateLessonGate.mockResolvedValue({
    subscribed: false,
    lessonLock: { kind: 'open' },
  });
  const res = await reportVideoProgressHandler(
    new Request('http://t', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lessonSlug: 'l1', progress: 25 }),
    }),
  );
  expect(res.status).toBe(403);
  // The point: nothing reached the database. Without this the caller can
  // self-report full coverage for any lesson and unlock the whole course.
  expect(recordLessonProgress).not.toHaveBeenCalled();
});
```

Add `evaluateLessonGate`, `recordLessonProgress`, and `getLessonIdBySlug` to the file's `vi.hoisted` block and `vi.mock` calls, mirroring the existing `recordVideoProgress` mock.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/routes/api/user/__tests__/report-video-progress.test.ts`
Expected: FAIL — handler still accepts `videoId` and never calls the gate.

- [ ] **Step 3: Swap the schema column**

In `src/db/schema.ts`, replace `videoId: varchar("video_id", { length: 255 }).notNull()` with:

```ts
    lessonId: integer("lesson_id")
      .notNull()
      .references(() => lessonsTable.id, { onDelete: "cascade" }),
```

and replace the `videos_progress_user_video_idx` index with:

```ts
    index("videos_progress_user_lesson_idx").on(table.userId, table.lessonId),
```

The foreign key is the point: progress rows for a deleted lesson previously survived forever, and every join needed a `::text` cast because a uuid was being compared to a varchar.

- [ ] **Step 4: Rewrite `src/db/videos-progress.ts`**

Rename all three functions and swap the predicate. `hasWatchedVideo` → `hasWatchedLesson`, `getVideoProgress` → `getLessonProgress`, `recordVideoProgress` → `recordLessonProgress`; in each, replace `eq(videoProgressTable.videoId, videoId)` with `eq(videoProgressTable.lessonId, lessonId)` and the `videoId: string` parameter with `lessonId: number`. Keep every doc comment, retargeting "video" to "lesson". Keep the `VideoProgress` return type and rename it `LessonProgress`.

- [ ] **Step 5: Authorize and re-key both routes**

`report-video-progress.ts` — schema becomes `z.object({ lessonSlug: z.string().min(1), progress: z.number().int().min(0).max(100) })`, and after parsing:

```ts
  const gate = await evaluateLessonGate({
    userId: session.user.id,
    lessonSlug: parsed.data.lessonSlug,
  });
  // Uniform 403 for "no such lesson", "not subscribed" and "locked" alike —
  // distinguishing them hands an enumeration oracle to any signed-in caller,
  // the same rule the playback route follows.
  if (!gate || !gate.subscribed || gate.lessonLock.kind !== 'open') {
    return new Response('Forbidden', { status: 403 });
  }
  const lessonId = await getLessonIdBySlug(parsed.data.lessonSlug);
  if (lessonId === null) return new Response('Forbidden', { status: 403 });
  await recordLessonProgress({ userId: session.user.id, lessonId, progress: parsed.data.progress });
```

`video-progress.ts` — read `?lessonSlug=`, resolve via `getLessonIdBySlug`, return 403 when it resolves to nothing. Reading own progress needs no gate check: a locked lesson's progress is zero and leaks nothing.

Add `getLessonIdBySlug(slug: string): Promise<number | null>` to `src/db/lesson-access.ts`, mirroring `getLessonByVideoId`'s query shape but selecting `lessonsTable.id` and matching on `lessonsTable.slug`.

- [ ] **Step 6: Update the two existing route tests**

Replace every `videoId: 'v1'` fixture with `lessonSlug: 'l1'`, and in each test's `beforeEach` add `evaluateLessonGate.mockResolvedValue({ subscribed: true, lessonLock: { kind: 'open' } })` and `getLessonIdBySlug.mockResolvedValue(10)`. Assert `recordLessonProgress` was called with `{ userId: 'u1', lessonId: 10, progress: 25 }` — the resolved id, not the slug.

- [ ] **Step 7: Push the schema and verify**

```bash
pnpm db:push
pnpm test src/routes/api/user src/db && pnpm tsc --noEmit -p tsconfig.json
```

Expected: PASS. `db:push` will report dropping `video_id` and adding `lesson_id`; the table is empty so accept it.

- [ ] **Step 8: Commit**

```bash
git add src/db/schema.ts src/db/videos-progress.ts src/db/lesson-access.ts src/routes/api/user
git commit -m "feat(progress): key video progress on lesson_id and authorize reporting"
```

---

### Task 3: Re-key progress aggregation

**Files:**
- Modify: `src/db/course-progress.ts:30-58`, `src/db/course.ts` (`getMyCourses` join, ~lines 212-222)
- Modify: `src/lib/course-progress-agg.ts:15-28`
- Modify: `src/lib/__tests__/course-progress-agg.test.ts`, `src/lib/__tests__/course-card-resume.test.ts`

**Interfaces:**
- Produces: `LessonProgressRow` and `LessonProgress` lose `videoId` and gain nothing — lessons are already identified by `lessonId`. `CourseProgress.lessons[].lessonId` is now the only lesson key consumers get.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/course-progress-agg.test.ts — replace the videoId fixtures
it('rolls a lesson up by its id, with no video identifier involved', () => {
  const result = aggregateCourseProgress('c', [
    { moduleId: 1, lessonId: 10, watchedHits: 18 },
    { moduleId: 1, lessonId: 11, watchedHits: 9 },
  ]);
  expect(result.lessons.map((l) => l.lessonId)).toEqual([10, 11]);
  expect(result.lessons[0]).not.toHaveProperty('videoId');
  expect(result.percent).toBe(75);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/__tests__/course-progress-agg.test.ts`
Expected: FAIL — `videoId` is still a required property of `LessonProgressRow`.

- [ ] **Step 3: Drop `videoId` from the aggregation types**

In `src/lib/course-progress-agg.ts`, delete `videoId: string | null;` from both `LessonProgressRow` and `LessonProgress`, and delete the line that copies it through in the mapping.

- [ ] **Step 4: Re-key both DB joins**

In `src/db/course-progress.ts`, drop `videoId: lessonsTable.videoId` from the select, drop `lessonsTable.videoId` from `groupBy`, and replace the join predicate with:

```ts
      and(
        eq(videoProgressTable.userId, userId),
        eq(videoProgressTable.lessonId, lessonsTable.id),
        inArray(videoProgressTable.progress, watchedMilestones),
      ),
```

Delete the `::text` cast comment above it — the cast existed only because a uuid was being compared to a varchar. Apply the identical change to `getMyCourses` in `src/db/course.ts`, dropping `lessonsTable.videoId` from its select and `groupBy` too.

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm test src/lib src/db && pnpm tsc --noEmit -p tsconfig.json`
Expected: PASS. `course-card-resume.test.ts` fixtures need `videoId` removed from their row literals.

- [ ] **Step 6: Commit**

```bash
git add src/db/course-progress.ts src/db/course.ts src/lib/course-progress-agg.ts src/lib/__tests__
git commit -m "feat(progress): aggregate progress by lesson id, dropping the videoId join"
```

---

### Task 4: Lesson-scoped playback endpoint

**Files:**
- Create: `src/db/lesson-playback.ts`
- Create: `src/routes/api/lesson/playback.ts`
- Create: `src/routes/api/lesson/__tests__/playback-route.test.ts`
- Delete: `src/routes/api/lesson/video.ts`

**Interfaces:**
- Consumes: `resolvePlayback` + `PlaybackResult` (Task 1), `evaluateLessonGate` (existing), `getCourseCredentials` (existing, `src/db/admin.ts`).
- Produces: `getLessonPlayback(lessonSlug: string): Promise<PlaybackResult | null>` from `#/db/lesson-playback`; `GET /api/lesson/playback?lessonSlug=` returning a `PlaybackResult` JSON body.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  evaluateLessonGate: vi.fn(),
  getLessonPlayback: vi.fn(),
}));
vi.mock('#/lib/auth', () => ({ auth: { api: { getSession: m.getSession } } }));
vi.mock('#/lib/lesson-gating.server', () => ({ evaluateLessonGate: m.evaluateLessonGate }));
vi.mock('#/db/lesson-playback', () => ({ getLessonPlayback: m.getLessonPlayback }));

import { getLessonPlaybackHandler } from '../playback';

const req = (slug: string) => new Request(`http://t/api/lesson/playback?lessonSlug=${slug}`);

beforeEach(() => {
  vi.clearAllMocks();
  m.getSession.mockResolvedValue({ user: { id: 'u1' } });
  m.evaluateLessonGate.mockResolvedValue({ subscribed: true, lessonLock: { kind: 'open' } });
  m.getLessonPlayback.mockResolvedValue({ status: 'ready', url: 'https://cdn/v.mp4', kind: 'file', expiresInSeconds: 60, poster: null, captions: null });
});

describe('getLessonPlaybackHandler', () => {
  it('401s an anonymous caller before resolving anything', async () => {
    m.getSession.mockResolvedValueOnce(null);
    expect((await getLessonPlaybackHandler(req('l1'))).status).toBe(401);
    expect(m.getLessonPlayback).not.toHaveBeenCalled();
  });

  it('403s a locked lesson without resolving a signed URL', async () => {
    m.evaluateLessonGate.mockResolvedValueOnce({
      subscribed: true,
      lessonLock: { kind: 'module-locked', moduleSlug: 'm', moduleName: 'M' },
    });
    expect((await getLessonPlaybackHandler(req('l1'))).status).toBe(403);
    // Resolving would mint a playable URL for content the caller cannot reach.
    expect(m.getLessonPlayback).not.toHaveBeenCalled();
  });

  it('403s an unsubscribed caller', async () => {
    m.evaluateLessonGate.mockResolvedValueOnce({ subscribed: false, lessonLock: { kind: 'open' } });
    expect((await getLessonPlaybackHandler(req('l1'))).status).toBe(403);
  });

  it('returns the playback body for an open lesson', async () => {
    const res = await getLessonPlaybackHandler(req('l1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ready', url: 'https://cdn/v.mp4' });
    expect(m.getLessonPlayback).toHaveBeenCalledWith('l1');
  });

  it('403s a lesson with no video, never 404', async () => {
    m.getLessonPlayback.mockResolvedValueOnce(null);
    expect((await getLessonPlaybackHandler(req('nope'))).status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/routes/api/lesson/__tests__/playback-route.test.ts`
Expected: FAIL — `../playback` does not exist.

- [ ] **Step 3: Write `src/db/lesson-playback.ts`**

```ts
import { eq } from 'drizzle-orm';
import { db } from '#/db';
import { coursesTable, lessonsTable, modulesTable } from '#/db/schema';
import { getCourseCredentials } from '#/db/admin';
import { cacheWithRedis } from '#/integrations/upstash/redis';
import { resolvePlayback, type PlaybackResult } from '#/lib/video-providers/resolve.server';
import type { ProviderId } from '#/lib/video-providers/types';

/**
 * Playback for a lesson, resolved through the course's stored provider
 * credentials. Null when the lesson does not exist or has no video assigned —
 * callers deliberately render that as the same refusal as "locked", so the
 * route never confirms which slugs are real.
 */
async function resolveLessonPlaybackUncached(
  lessonSlug: string,
): Promise<PlaybackResult | null> {
  const [lesson] = await db
    .select({
      videoProvider: lessonsTable.videoProvider,
      videoRef: lessonsTable.videoRef,
      courseId: coursesTable.id,
    })
    .from(lessonsTable)
    .innerJoin(modulesTable, eq(modulesTable.id, lessonsTable.moduleId))
    .innerJoin(coursesTable, eq(coursesTable.id, modulesTable.courseId))
    .where(eq(lessonsTable.slug, lessonSlug));
  if (!lesson?.videoProvider || !lesson.videoRef) return null;

  const provider = lesson.videoProvider as ProviderId;
  const creds = await getCourseCredentials(lesson.courseId, provider);
  if (!creds) return null;
  return resolvePlayback(provider, lesson.videoRef, creds);
}

/**
 * Cached per lesson, with the TTL bounded by the signed URL's OWN expiry —
 * never the default 6h. A cached URL that outlives its signature is a player
 * that fails with no error path, so the extractor is load-bearing, not tuning.
 * Pending (rendering/failed) results are not cached: they change on their own.
 */
export const getLessonPlayback = cacheWithRedis<string, PlaybackResult | null>(
  'lesson-playback',
  resolveLessonPlaybackUncached,
  (result) =>
    result && result.status === 'ready' && result.expiresInSeconds !== null
      ? Math.max(1, result.expiresInSeconds - 30)
      : null,
);
```

Note the 30-second safety margin: a URL handed to a client at the instant its cache entry expires must still play long enough to start.

- [ ] **Step 4: Write `src/routes/api/lesson/playback.ts`**

```ts
import { createFileRoute } from '@tanstack/react-router';
import { getLessonPlayback } from '#/db/lesson-playback';
import { auth } from '#/lib/auth';
import { evaluateLessonGate } from '#/lib/lesson-gating.server';

/**
 * Provider-agnostic playback for the learner player.
 *
 * The session and gate checks are not optional: the response embeds a signed,
 * directly-playable URL. One uniform 403 covers "no such lesson", "not
 * subscribed", "locked" and "no video" alike — distinguishing them hands an
 * enumeration oracle to any signed-in caller.
 */
export async function getLessonPlaybackHandler(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response('Unauthorized', { status: 401 });

  const lessonSlug = new URL(request.url).searchParams.get('lessonSlug');
  if (!lessonSlug) return new Response('lessonSlug is required', { status: 400 });

  try {
    const gate = await evaluateLessonGate({ userId: session.user.id, lessonSlug });
    if (!gate || !gate.subscribed || gate.lessonLock.kind !== 'open') {
      return new Response('Forbidden', { status: 403 });
    }
    const playback = await getLessonPlayback(lessonSlug);
    if (!playback) return new Response('Forbidden', { status: 403 });
    return Response.json(playback);
  } catch (error) {
    console.error('Failed to resolve lesson playback:', error);
    return new Response('Playback lookup failed', { status: 502 });
  }
}

export const Route = createFileRoute('/api/lesson/playback')({
  server: { handlers: { GET: ({ request }) => getLessonPlaybackHandler(request) } },
});
```

- [ ] **Step 5: Delete the old route and run tests**

```bash
rm src/routes/api/lesson/video.ts
pnpm test src/routes/api/lesson && pnpm tsc --noEmit -p tsconfig.json
```

Expected: PASS. `tsc` will flag `src/atoms/lesson-video.ts` as still fetching the deleted route — Task 5 fixes it. If that blocks the commit, do Task 5 before committing.

- [ ] **Step 6: Commit**

```bash
git add src/db/lesson-playback.ts src/routes/api/lesson
git commit -m "feat(video): add a gated, provider-agnostic lesson playback endpoint"
```

---

### Task 5: Re-key the client playback data layer

**Files:**
- Modify: `src/atoms/lesson-video.ts`, `src/hooks/data/use-lesson-video.ts`, `src/hooks/data/keys.ts`
- Modify: `src/components/lesson-main/lesson-main-wrapper.tsx:27-28,63-65`

**Interfaces:**
- Produces: `lessonPlaybackAtomFamily(lessonSlug: string)` and `queryKeys.lessonPlayback(lessonSlug: string)`. Query data type is `PlaybackResult`.

- [ ] **Step 1: Re-key the atom and query key**

In `src/hooks/data/keys.ts`, replace `lessonVideo: (videoId: string) => ['lesson-video', videoId]` with `lessonPlayback: (lessonSlug: string) => ['lesson-playback', lessonSlug] as const`.

In `src/atoms/lesson-video.ts`, rename the family to `lessonPlaybackAtomFamily`, key it on `lessonSlug`, fetch `/api/lesson/playback?lessonSlug=${encodeURIComponent(lessonSlug)}`, and type the result `PlaybackResult`. Keep the `atomFamily` import from `jotai-family` as-is.

- [ ] **Step 2: Update the wrapper**

In `lesson-main-wrapper.tsx`, replace `const videoId = lesson?.videoId ?? ''` / `useLessonVideo(videoId)` with the lesson slug already in scope, and change the retry invalidation at lines 63–65 to `queryKeys.lessonPlayback(lessonSlug)`, guarded by `if (!lessonSlug) return;`.

- [ ] **Step 3: Typecheck**

Run: `pnpm tsc --noEmit -p tsconfig.json`
Expected: errors only in `compute-lesson-main-state.ts` and the sidebar — Tasks 6–8 clear those.

- [ ] **Step 4: Commit**

```bash
git add src/atoms/lesson-video.ts src/hooks/data src/components/lesson-main/lesson-main-wrapper.tsx
git commit -m "feat(video): key the client playback query on lesson slug"
```

---

### Task 6: Shared media attachment with HLS support

**Files:**
- Create: `src/components/video-player/attach-media.ts`
- Modify: `src/components/video-player/video-player.tsx` (accept `kind`, attach via the helper)
- Modify: `src/components/admin/lesson-config/video-preview.tsx` (use the shared helper)

**Interfaces:**
- Produces: `attachMedia(video: HTMLVideoElement, src: string, kind: 'hls' | 'file', onError?: (fatal: boolean) => void): () => void` — returns a teardown function.

- [ ] **Step 1: Extract the helper**

Move the hls.js attach/teardown logic out of `video-preview.tsx` (currently ~lines 55–95) into `attach-media.ts` verbatim, preserving its comments — particularly the notes on Safari's native HLS, on lazy-loading hls.js to keep it out of the main bundle, and on Mux rejecting a revoked token only at manifest fetch. Signature as above; for `kind === 'file'` it sets `video.src` and returns a no-op teardown.

- [ ] **Step 2: Use it in both players**

`video-preview.tsx` calls `attachMedia(...)` inside its existing effect and returns the teardown. `video-player.tsx` takes a new `kind: 'hls' | 'file'` prop (default `'file'`) and does the same. Thread `kind` through `lesson-player-container.tsx` from the playback result.

- [ ] **Step 3: Verify both players still work**

Run: `pnpm test && pnpm tsc --noEmit -p tsconfig.json && pnpm build`
Then manually: start the dev server, open a Synthesia lesson (plays as `file`) and the Mux lesson (plays as `hls`). Both must show the poster and, for Synthesia, the subtitle track.

- [ ] **Step 4: Commit**

```bash
git add src/components/video-player/attach-media.ts src/components/video-player/video-player.tsx src/components/admin/lesson-config/video-preview.tsx src/components/lesson-main/parts/lesson-player-container.tsx
git commit -m "feat(video): share HLS attachment between the admin preview and learner player"
```

---

### Task 7: Re-key the milestone reporter and player atoms

**Files:**
- Modify: `src/components/video-player/use-milestone-reporter.ts`, `milestone-tick.ts`, `reconcile-coverage.ts`, `atoms.ts`
- Modify: `src/components/lesson-main/parts/lesson-player-atoms.ts`, `lesson-player-container.tsx`
- Modify: `src/data-hooks/use-video-progress.ts`, `use-report-video-progress.ts`, `src/data-hooks/keys.ts`
- Modify: `src/components/video-player/__tests__/milestone-tick.test.ts`

**Interfaces:**
- Produces: `useMilestoneReporter(playerId: string, lessonSlug: string): void` (the `videoId` parameter is gone — `lessonSlug` replaces both). `MilestoneReporterState.lessonSlug` replaces `.videoId`. `dataKeys.lessonProgress(lessonSlug)`.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/video-player/__tests__/milestone-tick.test.ts — add
it('resets its cursor when the lesson changes, not merely the video', () => {
  const seeded = computeMilestoneTick(initialMilestoneReporterState, {
    lessonSlug: 'a', currentTime: 0, duration: 100, milestonesHit: [10],
  }).state;
  const next = computeMilestoneTick(seeded, {
    lessonSlug: 'b', currentTime: 0, duration: 100, milestonesHit: undefined,
  });
  expect(next.state.lessonSlug).toBe('b');
  expect(next.state.reported.size).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/video-player/__tests__/milestone-tick.test.ts`
Expected: FAIL — the state field is `videoId`.

- [ ] **Step 3: Rename the key through the reporter chain**

Rename `videoId` → `lessonSlug` in `milestone-tick.ts` (`MilestoneReporterState`, `MilestoneTickInput`, the reset comparison at ~line 81, and the guard at ~line 98), in `reconcile-coverage.ts` (its `videoId` param and the `report` callback payload), and in `use-milestone-reporter.ts` (drop the `videoId` parameter, use `lessonSlug` for both the progress query and the report payload). Preserve every existing comment — especially `computeMilestoneTick`'s note on why all four inputs share one effect.

Update `use-video-progress.ts` to fetch `?lessonSlug=` and `use-report-video-progress.ts` to POST `{ lessonSlug, progress }`. Rename `dataKeys.videoProgress` → `dataKeys.lessonProgress`, keyed on slug.

- [ ] **Step 4: Re-key the player atoms and switch the deprecated import**

In `src/components/video-player/atoms.ts` and `src/components/lesson-main/parts/lesson-player-atoms.ts`, change `import { atomFamily } from 'jotai/utils'` to `from 'jotai-family'` — these are the last two files on the deprecated path, and jotai logs a v3 removal warning for it. Rename `videoReachedEndAtomFamily`'s parameter from `_videoId` to `_lessonSlug` and update `lesson-player-container.tsx` accordingly.

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm test src/components/video-player src/data-hooks && pnpm tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/video-player src/components/lesson-main/parts src/data-hooks
git commit -m "feat(progress): key milestone reporting on lesson slug"
```

---

### Task 8: Re-key the read models and sidebar

**Files:**
- Modify: `src/components/lesson-main/compute-lesson-main-state.ts:10,138,154`, `compute-lesson-header-state.ts:7`, `find-lesson.ts:1`, `types.ts:37`
- Modify: `src/components/sidebar/course-sidebar-wrapper.tsx:11,36-48`, `course-sidebar.tsx:9`, `lesson-list.tsx:4,33`, `lesson-link.tsx:6`, `module-item.tsx:9`, `module-accordion.tsx:6`
- Modify: `src/components/lesson-main/__tests__/*`, `src/components/sidebar/__tests__/*`

**Interfaces:**
- Produces: `LessonLike = { slug: string; name: string; hasVideo: boolean }` across every read model. `LessonMainState`'s `ready` variant drops `videoId`. `lessonPercents` is `Record<lessonSlug, number>`.

- [ ] **Step 1: Write the failing test**

Change the file's shared fixture at the top from
`const baseLesson = { slug: 'l-1', name: 'Lesson One', videoId: 'v1' };` to
`const baseLesson = { slug: 'l-1', name: 'Lesson One', hasVideo: true };`, then add:

```ts
it('reports no-video from hasVideo, not from a missing videoId', () => {
  const state = computeLessonMainState({
    course: {
      data: { modules: [{ slug: 'm-1', lessons: [{ ...baseLesson, hasVideo: false }] }] },
      isLoading: false,
      isError: false,
    },
    courseSlug: 'course-1',
    moduleSlug: 'm-1',
    lessonSlug: 'l-1',
    video: { data: undefined, isError: false },
    material: { data: { locked: false, adminBypass: false, material: {} }, isLoading: false, isError: false },
    onRetryCourse,
    onRetryVideo,
  });
  expect(state).toEqual({ kind: 'no-video', lessonName: 'Lesson One' });
});
```

If the existing tests in this file pass a `material` query shape with different
property names, copy theirs verbatim rather than the block above — the point of
the test is the `hasVideo: false` branch, not the surrounding fixture.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/lesson-main`
Expected: FAIL — `hasVideo` is not a property of `LessonLike`.

- [ ] **Step 3: Swap the field across the read models**

Replace `videoId: string | null` with `hasVideo: boolean` in all six `LessonLike` declarations. In `compute-lesson-main-state.ts` change line 138 to `if (!lesson.hasVideo)` and delete `videoId: lesson.videoId` from the `ready` return (line 154) and from `types.ts`.

- [ ] **Step 4: Re-key the sidebar percent map**

In `course-sidebar-wrapper.tsx`, replace the `lessonPercents` build (lines 41–43) with a slug lookup. The progress rows now carry `lessonId`, and the sidebar renders by slug, so map through the course details already in scope:

```ts
      const slugByLessonId = new Map<number, string>();
      for (const mod of detailsQuery.data?.modules ?? []) {
        for (const l of mod.lessons) slugByLessonId.set(l.id, l.slug);
      }
      for (const lesson of data.lessons) {
        const slug = slugByLessonId.get(lesson.lessonId);
        if (slug) lessonPercents[slug] = lesson.percent;
      }
```

Add `detailsQuery.data` to that `useMemo`'s dependency array — omitting it leaves every percent at zero on first paint. In `lesson-list.tsx:33`, replace `(lesson.videoId && lessonPercents[lesson.videoId]) || 0` with `lessonPercents[lesson.slug] ?? 0`.

- [ ] **Step 5: Update `api/course/details.ts` and its lesson shape**

Have the course-details payload expose `hasVideo: l.videoProvider !== null && l.videoRef !== null` per lesson instead of `videoId`, and update `CourseLessonSchema` in `src/types.ts` to match (`videoId: z.string()` → `hasVideo: z.boolean()`).

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm test && pnpm tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/lesson-main src/components/sidebar src/routes/api/course/details.ts src/types.ts
git commit -m "feat(video): expose hasVideo instead of videoId across the read models"
```

---

### Task 9: Re-key gating and remove the dead videoId surface

**Files:**
- Modify: `src/lib/lesson-gating.ts:19-26,83-91`, `src/lib/lesson-gating-inputs.ts:33-40`
- Modify: `src/lib/__tests__/lesson-gating.test.ts`, `src/lib/module-dependency-graph.ts`, `src/lib/__tests__/module-dependency-graph.test.ts`
- Modify: `src/db/schema.ts` (drop `lessons.video_id`), `src/db/admin.ts` (drop `hasVideoId` / `isConfigured` duplication), `src/lib/admin-schemas.ts`
- Delete: `getLessonByVideoId` from `src/db/lesson-access.ts`, `src/components/lesson-main/video-response-to-state.ts`

**Interfaces:**
- Produces: `GateLesson.hasVideo: boolean` replacing `videoId: string | null`. `DepLesson.hasVideoId` becomes `hasVideo`. `boardLessonSchema.hasVideoId` becomes redundant with `isConfigured` and is removed.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/lesson-gating.test.ts — replace the videoId cases
it('is satisfied when the lesson has no video at all', () => {
  expect(isLessonSatisfied(lesson({ hasVideo: false }), new Set())).toBe(true);
});

it('blocks a lesson that has a video and requires watching', () => {
  // The regression this whole migration exists for: a lesson configured
  // through the admin UI has a video_ref but no video_id, and used to fall
  // through this predicate as satisfied.
  expect(isLessonSatisfied(lesson({ hasVideo: true }), new Set())).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/__tests__/lesson-gating.test.ts`
Expected: FAIL — `hasVideo` is not on `GateLesson`.

- [ ] **Step 3: Swap the gating field**

In `lesson-gating.ts`, replace `videoId: string | null` with `hasVideo: boolean` on `GateLesson`, and line 89's `if (!lesson.videoId) return true;` with `if (!lesson.hasVideo) return true;`. Update the doc comment: the escape is now "a lesson with no video has nothing to watch", with no mention of a null id. In `lesson-gating-inputs.ts`, map `hasVideo: l.hasVideo`.

- [ ] **Step 4: Collapse the admin-side duplication**

`boardLessonSchema.hasVideoId` existed only because `isConfigured` answered the wrong question while gating keyed on `video_id`. With gating on `(provider, ref)` the two are the same question: delete `hasVideoId` from `src/lib/admin-schemas.ts` and `src/db/admin.ts`, and in `src/lib/module-dependency-graph.ts` rename `DepLesson.hasVideoId` → `hasVideo`, updating `module-dependencies-container.tsx` to pass `l.isConfigured`. Update both test files' fixtures.

- [ ] **Step 5: Drop the dead column and lookups**

Remove `videoId: uuid("video_id")` from `lessonsTable` in `src/db/schema.ts`, delete `getLessonByVideoId` from `src/db/lesson-access.ts`, and delete `src/components/lesson-main/video-response-to-state.ts` plus its test. Leave `other_video_ids` alone — it is 68 lessons of FR/JP alternates that nothing plays today, and retiring it is its own decision.

Run `pnpm db:push` and accept the `video_id` drop.

- [ ] **Step 6: Evict the stale Redis course-details entries**

The cached `getCourseDetailsWithCache` payloads still carry the old lesson shape with `videoId`, and a client parsing them against the new `CourseLessonSchema` will fail. Flush them once after deploy:

```bash
pnpm dotenv -e .env -- tsx -e "import {redis} from './src/integrations/upstash/redis'; const keys = await redis.keys('course-details*'); if (keys.length) await redis.del(...keys); console.log('evicted', keys.length); process.exit(0)"
```

- [ ] **Step 7: Full verification**

Run: `pnpm test && pnpm tsc --noEmit -p tsconfig.json && pnpm biome check src/ && pnpm build`
Then manually, on a dev server: play a Synthesia lesson end to end and confirm the milestone rows land in `videos_progress` with the right `lesson_id`; confirm the sidebar percent moves; confirm the Mux lesson now plays; confirm a locked lesson's playback request 403s.

- [ ] **Step 8: Commit**

```bash
git add -u src/
git commit -m "feat(video): gate on video presence and retire the videoId surface"
```

---

## Self-Review

**Spec coverage.** Playback superset → Task 1. Progress re-key + the self-report authorization hole → Task 2. Aggregation → Task 3. Provider-agnostic gated endpoint → Task 4. Client data layer → Task 5. HLS in the learner player → Task 6. Milestone reporter + the deprecated `jotai/utils` import → Task 7. Read models and sidebar → Task 8. Gating field, dead column, Redis eviction → Task 9. No spec requirement is unassigned.

**Type consistency.** `PlaybackResult` is defined in Task 1 and consumed by Tasks 4, 5, 6. `hasVideo` is introduced in Task 8's read models and reaches gating in Task 9 — Task 8 must land first, which the ordering enforces. `lessonSlug` is the client key throughout Tasks 4–8; `lessonId` is the DB key in Tasks 2–3, bridged by `getLessonIdBySlug` (added in Task 2, used in Task 2 only). `dataKeys.lessonProgress` and `queryKeys.lessonPlayback` are distinct on purpose — different query-key factories, matching the existing split.

**Known ordering constraint.** Task 4 deletes `api/lesson/video.ts` while `src/atoms/lesson-video.ts` still references it; `tsc` is red between Task 4 step 5 and Task 5. The plan flags this inline. If a reviewer requires green between every commit, merge Tasks 4 and 5.

## Out of Scope

- `other_video_ids` (68 lessons of FR/JP alternates) — inert today, and making them playable is a language-selection feature, not this migration.
- Mux text tracks / captions for Mux — requires configuring them on the Mux side first. Task 1 makes their absence explicit rather than silent.
- The 6-hour cache of a `rendering` Synthesia response (`expiresExtractor` returns null → default TTL). Pre-existing; Task 4's new cache sidesteps it by not caching pending results.
