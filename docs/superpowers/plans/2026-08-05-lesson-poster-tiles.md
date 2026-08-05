# Lesson Poster Tiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each lesson's real video frame behind the play glyph on the admin course board, sourced from Mux and Synthesia.

**Architecture:** A new admin endpoint returns `Record<lessonId, posterUrl>` for a course. Mux URLs are signed locally (no network); Synthesia thumbnails come from one paginated sweep of its list endpoint, Redis-cached. The tile grows to 80×45 and renders the poster as a decorative `<img>` under a high-contrast play disc, falling back to today's grey icon purely through stacking order — no state, no `onError`.

**Tech Stack:** TanStack Start (file routes), TanStack Query, Drizzle, Zod, `@mux/mux-node`, Upstash Redis, Tailwind v4, Vitest + Testing Library.

Spec: `docs/superpowers/specs/2026-08-05-lesson-poster-tiles-design.md`

## Global Constraints

- **Imports under vitest:** `@/` does **not** resolve under this repo's vitest. Any module that must load in a test uses relative imports (`../../types`) or the `#/` subpath (`package.json` `imports` maps `#/*` → `./src/*`). New files in `src/lib/video-providers/` and `src/integrations/synthesia/` use **relative** imports, matching `resolve.server.ts`.
- **Presentational components are hookless.** react-compiler nulls the hook dispatcher for this repo's components under vitest, so `LessonCard` / `LessonVideoTile` get no `useState`, no `useRef`, no `useEffect`.
- **Logical CSS properties only.** Tailwind logical variants (`ms-*`, `ps-*`, `start-*`, `border-s`) — never `ml-*`, `left-*`. `inset-0` is symmetric and therefore fine.
- **Base UI first.** No new custom components where a Base UI primitive composes.
- **Colors** come from the generated Radix scale (`bg-gray-3`, `text-gray-8`, `ring-apple-9`). The one exception is the play disc's `bg-black/60` and `text-white`, justified in Task 4 — contrast against an arbitrary photograph cannot come from a themed scale step.
- **Mux poster constants:** TTL `6 * 60 * 60` seconds, `width` `'160'`, **no `time` parameter** (Mux defaults to mid-video, which the spec chose deliberately).
- **Synthesia sweep constants:** page size `100` (must match `getVideosByPage`'s `limit`), page cap `10`, cache TTL clamped to `[5 * 60, 6 * 60 * 60]` seconds.
- Run tests with `pnpm test`. Single file: `pnpm vitest run <path>`.
- Every test is verified **red** before its implementation is written.

---

## File Structure

**Create:**
- `src/integrations/synthesia/thumbnails.ts` — paginated thumbnail sweep + Redis-cached wrapper
- `src/integrations/synthesia/thumbnails.test.ts`
- `src/lib/video-providers/posters.server.ts` — provider-agnostic poster builder, dependency-injected
- `src/lib/video-providers/posters.server.test.ts`
- `src/routes/api/admin/courses.$courseId.lesson-posters.ts`
- `src/data-hooks/use-lesson-posters.ts`

**Modify:**
- `src/integrations/synthesia/videos.ts` — `apiKey` param on `getVideosByPage`, export page size
- `src/db/admin.ts` — `getCourseLessonPosters`
- `src/data-hooks/keys.ts` — `lessonPosters` key
- `src/components/admin/lesson-video-tile.tsx` — size + poster
- `src/components/admin/lesson-card.tsx` — `posterUrl` passthrough
- `src/components/admin/sortable-lesson-card.tsx` — `posterUrl` passthrough
- `src/components/admin/lesson-board-container.tsx` — `posters` passthrough
- `src/components/admin/module-column.tsx` — `posters` for the static fallback list
- `src/components/admin/sortable-module-column.tsx` — `posters` passthrough
- `src/components/admin/module-board-container.tsx` — fetches, feeds both drag overlays
- `src/components/admin/__tests__/lesson-video-tile.test.tsx`
- `src/components/admin/__tests__/lesson-card.test.tsx`

**Why the poster builder is not in `src/db/admin.ts`:** testing anything in `admin.ts` means rebuilding the Drizzle schema with real `pgTable` columns (see `src/db/__tests__/admin-course-cache-invalidation.test.ts`). Putting the branch logic behind a `loadCredentials` callback makes it testable with two `vi.mock`s, and leaves `admin.ts` holding only a query.

---

### Task 1: Synthesia thumbnail sweep

**Files:**
- Modify: `src/integrations/synthesia/videos.ts:52-70`
- Create: `src/integrations/synthesia/thumbnails.ts`
- Test: `src/integrations/synthesia/thumbnails.test.ts`

**Interfaces:**
- Consumes: `getVideosByPage`, `getVideoExpiry` from `./videos`; `cacheWithRedis` from `../upstash/redis`; `isVideoAvailable` from `../../types`
- Produces:
  - `SYNTHESIA_PAGE_SIZE: 100` (from `./videos`)
  - `getVideosByPage(page: number, apiKey?: string): Promise<VideosPage>`
  - `getVideoThumbnails(apiKey: string): Promise<Record<string, string>>` — video id → thumbnail URL
  - `getVideoThumbnailsWithCache: CachedFn<{ courseId: number; apiKey: string }, Record<string, string>>`

- [ ] **Step 1: Add the `apiKey` parameter and export the page size**

In `src/integrations/synthesia/videos.ts`, replace the existing `getVideosByPage`:

```ts
/** Synthesia's list page size. Exported so callers can tell a full page (more
 *  may follow) from a short one (the sweep is done) without duplicating 100. */
export const SYNTHESIA_PAGE_SIZE = 100;

/**
 * Fetches a page of videos from the Synthesia API.
 * @param page 1-based page number
 * @param apiKey Per-course credential. Defaults to the env key for the legacy
 *   single-account callers (`getAllVideos`); the admin board always passes the
 *   course's own key, because credentials are per-course everywhere else.
 * @returns VideosPage object
 */
export async function getVideosByPage(
  page: number,
  apiKey: string = env.SYNTHESIA_API_KEY,
): Promise<VideosPage> {
  const offset = (page - 1) * SYNTHESIA_PAGE_SIZE;
  const response = await fetch(
    `https://api.synthesia.io/v2/videos?limit=${SYNTHESIA_PAGE_SIZE}&offset=${offset}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: apiKey,
      },
      cache: 'no-store',
    },
  );
  if (!response.ok) {
    throw new Error('GET_VIDEOS_PAGE_ERROR');
  }
  const data = await response.json();
  return VideosPageSchema.parse(data);
}
```

Leave the rest of the file (`getVideosByPageIterator`, `getAllVideos`, `getAllVideosWithCache`, `getVideoExpiry`, `getVideoIdFromURL`) untouched — they keep using the default.

- [ ] **Step 2: Write the failing tests**

Create `src/integrations/synthesia/thumbnails.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getVideosByPage, getVideoExpiry } = vi.hoisted(() => ({
  getVideosByPage: vi.fn(),
  getVideoExpiry: vi.fn(),
}));

// Relative specifier, matching the module under test — and mocked wholesale so
// videos.ts (which imports `@/env`, unresolvable under this repo's vitest)
// never loads. Same reason resolve.server.test.ts stubs it.
vi.mock('./videos', () => ({
  getVideosByPage,
  getVideoExpiry,
  SYNTHESIA_PAGE_SIZE: 100,
}));

// redis.ts calls Redis.fromEnv() at import time. The cache wrapper is a
// pass-through here; the sweep is what these tests are about.
vi.mock('../upstash/redis', () => ({
  cacheWithRedis: (
    _prefix: string,
    fn: (args: unknown) => unknown,
  ) => Object.assign(fn, { invalidate: vi.fn() }),
}));

import { getVideoThumbnails } from './thumbnails';

const available = (id: string, image: string | null) => ({
  id,
  status: 'complete' as const,
  download: 'https://cdn.synthesia.io/v.mp4',
  captions: { srt: null, vtt: null },
  thumbnail: { gif: null, image },
});

/** A full page, so the sweep believes more may follow. */
const fullPage = (videos: unknown[]) => ({
  videos: [
    ...videos,
    ...Array.from({ length: 100 - videos.length }, (_, i) =>
      available(`filler-${i}`, null),
    ),
  ],
});

describe('getVideoThumbnails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps each available video id to its thumbnail image', async () => {
    getVideosByPage.mockResolvedValue({
      videos: [
        available('vid_1', 'https://cdn.synthesia.io/1.jpg'),
        available('vid_2', 'https://cdn.synthesia.io/2.jpg'),
      ],
    });

    expect(await getVideoThumbnails('sk_course')).toEqual({
      vid_1: 'https://cdn.synthesia.io/1.jpg',
      vid_2: 'https://cdn.synthesia.io/2.jpg',
    });
  });

  it('skips videos that are not ready and videos with no thumbnail', async () => {
    getVideosByPage.mockResolvedValue({
      videos: [
        available('vid_1', 'https://cdn.synthesia.io/1.jpg'),
        available('vid_2', null),
        { id: 'vid_3', status: 'in_progress' as const },
      ],
    });

    expect(await getVideoThumbnails('sk_course')).toEqual({
      vid_1: 'https://cdn.synthesia.io/1.jpg',
    });
  });

  it('uses the supplied key, never the env key', async () => {
    getVideosByPage.mockResolvedValue({ videos: [] });

    await getVideoThumbnails('sk_course');

    expect(getVideosByPage).toHaveBeenCalledWith(1, 'sk_course');
  });

  it('stops as soon as a page comes back short', async () => {
    // A short page means Synthesia has nothing more. Asking for page 2 would
    // be a wasted round trip on every board load.
    getVideosByPage.mockResolvedValue({
      videos: [available('vid_1', 'https://cdn.synthesia.io/1.jpg')],
    });

    await getVideoThumbnails('sk_course');

    expect(getVideosByPage).toHaveBeenCalledTimes(1);
  });

  it('keeps paging while pages come back full', async () => {
    getVideosByPage
      .mockResolvedValueOnce(
        fullPage([available('vid_1', 'https://cdn.synthesia.io/1.jpg')]),
      )
      .mockResolvedValueOnce({
        videos: [available('vid_2', 'https://cdn.synthesia.io/2.jpg')],
      });

    const thumbnails = await getVideoThumbnails('sk_course');

    expect(getVideosByPage).toHaveBeenCalledTimes(2);
    expect(getVideosByPage).toHaveBeenNthCalledWith(2, 2, 'sk_course');
    expect(thumbnails.vid_2).toBe('https://cdn.synthesia.io/2.jpg');
  });

  it('gives up at the page cap rather than sweeping an account forever', async () => {
    getVideosByPage.mockResolvedValue(fullPage([]));

    await getVideoThumbnails('sk_course');

    expect(getVideosByPage).toHaveBeenCalledTimes(10);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run src/integrations/synthesia/thumbnails.test.ts`
Expected: FAIL — `Failed to resolve import "./thumbnails"`.

- [ ] **Step 4: Write the implementation**

Create `src/integrations/synthesia/thumbnails.ts`:

```ts
import { isVideoAvailable } from '../../types';
import { cacheWithRedis } from '../upstash/redis';
import {
  getVideoExpiry,
  getVideosByPage,
  SYNTHESIA_PAGE_SIZE,
} from './videos';

/**
 * Bounds the sweep at 1000 videos. A Synthesia account can hold far more than
 * one course's worth, and an unbounded loop on a board request is a hang
 * waiting to happen. Lessons past the cap simply get no poster.
 */
const MAX_PAGES = 10;

/** Never cache so briefly that the board re-sweeps on every load... */
const MIN_TTL_SECONDS = 5 * 60;
/** ...nor so long that a rotated credential keeps serving dead URLs all day. */
const MAX_TTL_SECONDS = 6 * 60 * 60;

/**
 * Every thumbnail URL Synthesia will hand out for this API key, as
 * `videoId → url`.
 *
 * One request per 100 videos rather than one per lesson: the list endpoint
 * already carries `thumbnail`, so a whole course costs one or two round trips.
 * Videos still rendering, and videos with no thumbnail, are absent — a missing
 * key is the caller's signal to fall back, not an error.
 */
export async function getVideoThumbnails(
  apiKey: string,
): Promise<Record<string, string>> {
  const thumbnails: Record<string, string> = {};

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { videos } = await getVideosByPage(page, apiKey);
    for (const video of videos) {
      if (!isVideoAvailable(video)) continue;
      if (video.thumbnail.image) thumbnails[video.id] = video.thumbnail.image;
    }
    // A short page is the last page. Checking length beats fetching one more
    // page to discover it is empty.
    if (videos.length < SYNTHESIA_PAGE_SIZE) return thumbnails;
  }

  console.warn(
    `Synthesia thumbnail sweep stopped at the ${MAX_PAGES}-page cap; lessons beyond it get no poster.`,
  );
  return thumbnails;
}

/**
 * Cached per course, so a board reload does not re-sweep Synthesia.
 *
 * The TTL follows the thumbnails themselves: their URLs are pre-signed and
 * carry an `Expires`, so caching past it would serve URLs that 403. Clamped at
 * both ends — Redis rejects a non-positive TTL, and an already-expired URL
 * would otherwise compute one.
 */
export const getVideoThumbnailsWithCache = cacheWithRedis<
  { courseId: number; apiKey: string },
  Record<string, string>
>(
  'synthesia-thumbnails',
  ({ apiKey }) => getVideoThumbnails(apiKey),
  (thumbnails) => {
    const expiries = Object.values(thumbnails)
      .map((url) => getVideoExpiry(url))
      .filter((seconds): seconds is number => seconds !== null);
    if (expiries.length === 0) return MAX_TTL_SECONDS;
    return Math.min(
      MAX_TTL_SECONDS,
      Math.max(MIN_TTL_SECONDS, Math.min(...expiries)),
    );
  },
  // Keyed on the course alone. The API key must never reach a Redis key.
  ({ courseId }) => String(courseId),
);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run src/integrations/synthesia/thumbnails.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Confirm nothing else regressed**

Run: `pnpm vitest run src/lib/video-providers/`
Expected: PASS — `getVideosByPage`'s new parameter is optional, so `getAllVideos` is unaffected.

- [ ] **Step 7: Commit**

```bash
git add src/integrations/synthesia/thumbnails.ts src/integrations/synthesia/thumbnails.test.ts src/integrations/synthesia/videos.ts
git commit -m "feat(synthesia): sweep video thumbnails for a course's API key"
```

---

### Task 2: Provider-agnostic poster builder

**Files:**
- Create: `src/lib/video-providers/posters.server.ts`
- Test: `src/lib/video-providers/posters.server.test.ts`

**Interfaces:**
- Consumes: `getVideoThumbnailsWithCache` (Task 1); `muxCredentialSchema` from `./mux`; `synthesiaCredentialSchema` from `./synthesia`; `ProviderId` from `./types`
- Produces:
  - `interface PosterLesson { id: number; provider: ProviderId; ref: string }`
  - `buildLessonPosters(input: { courseId: number; lessons: PosterLesson[]; loadCredentials: (provider: ProviderId) => Promise<unknown | null> }): Promise<Record<number, string>>`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/video-providers/posters.server.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { signPlaybackId } = vi.hoisted(() => ({ signPlaybackId: vi.fn() }));

vi.mock('@mux/mux-node', () => ({
  default: vi.fn().mockImplementation(() => ({
    jwt: { signPlaybackId },
  })),
}));

const { getVideoThumbnailsWithCache } = vi.hoisted(() => ({
  getVideoThumbnailsWithCache: vi.fn(),
}));

vi.mock('../../integrations/synthesia/thumbnails', () => ({
  getVideoThumbnailsWithCache,
}));

import { buildLessonPosters } from './posters.server';

const muxCreds = { keyId: 'key_123', privateKey: 'priv_abc' };
const synthesiaCreds = { apiKey: 'sk_course' };

/** Hands each provider its own credential, as resolveCourseProvider does. */
const credsFor =
  (available: Record<string, unknown>) => async (provider: string) =>
    available[provider] ?? null;

describe('buildLessonPosters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signPlaybackId.mockResolvedValue('thumb-token');
    getVideoThumbnailsWithCache.mockResolvedValue({});
  });

  it('signs Mux posters with a thumbnail-audience token and the width claim', async () => {
    // image.mux.com validates a `t` audience claim, and for a signed playback
    // id every query param must also appear in the JWT claims — an unsigned
    // `width` 403s just as a video-audience token would.
    await buildLessonPosters({
      courseId: 7,
      lessons: [{ id: 1, provider: 'mux', ref: 'playback123' }],
      loadCredentials: credsFor({ mux: muxCreds }),
    });

    expect(signPlaybackId).toHaveBeenCalledWith('playback123', {
      keyId: 'key_123',
      keySecret: 'priv_abc',
      expiration: '21600s',
      type: 'thumbnail',
      params: { width: '160' },
    });
  });

  it('builds a Mux url carrying both the width and the token', async () => {
    const posters = await buildLessonPosters({
      courseId: 7,
      lessons: [{ id: 1, provider: 'mux', ref: 'playback123' }],
      loadCredentials: credsFor({ mux: muxCreds }),
    });

    expect(posters[1]).toBe(
      'https://image.mux.com/playback123/thumbnail.jpg?width=160&token=thumb-token',
    );
  });

  it('asks Mux for no particular time, so it picks mid-video', async () => {
    // time=0 on a talking-head video is a black frame or a title card.
    const posters = await buildLessonPosters({
      courseId: 7,
      lessons: [{ id: 1, provider: 'mux', ref: 'playback123' }],
      loadCredentials: credsFor({ mux: muxCreds }),
    });

    expect(posters[1]).not.toContain('time=');
  });

  it('maps Synthesia lessons to the swept thumbnail for their ref', async () => {
    getVideoThumbnailsWithCache.mockResolvedValue({
      vid_a: 'https://cdn.synthesia.io/a.jpg',
    });

    const posters = await buildLessonPosters({
      courseId: 7,
      lessons: [{ id: 2, provider: 'synthesia', ref: 'vid_a' }],
      loadCredentials: credsFor({ synthesia: synthesiaCreds }),
    });

    expect(posters[2]).toBe('https://cdn.synthesia.io/a.jpg');
    expect(getVideoThumbnailsWithCache).toHaveBeenCalledWith({
      courseId: 7,
      apiKey: 'sk_course',
    });
  });

  it('serves both providers in one map for a mixed course', async () => {
    getVideoThumbnailsWithCache.mockResolvedValue({
      vid_a: 'https://cdn.synthesia.io/a.jpg',
    });

    const posters = await buildLessonPosters({
      courseId: 7,
      lessons: [
        { id: 1, provider: 'mux', ref: 'playback123' },
        { id: 2, provider: 'synthesia', ref: 'vid_a' },
      ],
      loadCredentials: credsFor({ mux: muxCreds, synthesia: synthesiaCreds }),
    });

    expect(Object.keys(posters).sort()).toEqual(['1', '2']);
  });

  it('still returns Mux posters when the Synthesia sweep throws', async () => {
    // A poster is decoration. One provider being down must not cost the board
    // the other provider's posters.
    getVideoThumbnailsWithCache.mockRejectedValue(new Error('synthesia down'));

    const posters = await buildLessonPosters({
      courseId: 7,
      lessons: [
        { id: 1, provider: 'mux', ref: 'playback123' },
        { id: 2, provider: 'synthesia', ref: 'vid_a' },
      ],
      loadCredentials: credsFor({ mux: muxCreds, synthesia: synthesiaCreds }),
    });

    expect(posters[1]).toContain('image.mux.com');
    expect(posters[2]).toBeUndefined();
  });

  it('still returns Synthesia posters when the Mux key is unusable', async () => {
    signPlaybackId.mockRejectedValue(new Error('invalid key format'));
    getVideoThumbnailsWithCache.mockResolvedValue({
      vid_a: 'https://cdn.synthesia.io/a.jpg',
    });

    const posters = await buildLessonPosters({
      courseId: 7,
      lessons: [
        { id: 1, provider: 'mux', ref: 'playback123' },
        { id: 2, provider: 'synthesia', ref: 'vid_a' },
      ],
      loadCredentials: credsFor({ mux: muxCreds, synthesia: synthesiaCreds }),
    });

    expect(posters[1]).toBeUndefined();
    expect(posters[2]).toBe('https://cdn.synthesia.io/a.jpg');
  });

  it('omits only the ref whose signing failed, not the whole course', async () => {
    signPlaybackId.mockImplementation(async (ref: string) => {
      if (ref === 'bad') throw new Error('nope');
      return 'thumb-token';
    });

    const posters = await buildLessonPosters({
      courseId: 7,
      lessons: [
        { id: 1, provider: 'mux', ref: 'good' },
        { id: 2, provider: 'mux', ref: 'bad' },
      ],
      loadCredentials: credsFor({ mux: muxCreds }),
    });

    expect(posters[1]).toContain('image.mux.com');
    expect(posters[2]).toBeUndefined();
  });

  it('returns nothing, and calls no provider, when the course has no credentials', async () => {
    const posters = await buildLessonPosters({
      courseId: 7,
      lessons: [
        { id: 1, provider: 'mux', ref: 'playback123' },
        { id: 2, provider: 'synthesia', ref: 'vid_a' },
      ],
      loadCredentials: credsFor({}),
    });

    expect(posters).toEqual({});
    expect(signPlaybackId).not.toHaveBeenCalled();
    expect(getVideoThumbnailsWithCache).not.toHaveBeenCalled();
  });

  it('never touches a provider the course has no lessons for', async () => {
    // A Mux-only course must not decrypt a Synthesia credential or sweep it.
    await buildLessonPosters({
      courseId: 7,
      lessons: [{ id: 1, provider: 'mux', ref: 'playback123' }],
      loadCredentials: credsFor({ mux: muxCreds, synthesia: synthesiaCreds }),
    });

    expect(getVideoThumbnailsWithCache).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/lib/video-providers/posters.server.test.ts`
Expected: FAIL — `Failed to resolve import "./posters.server"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/video-providers/posters.server.ts`:

```ts
import Mux from '@mux/mux-node';
import { getVideoThumbnailsWithCache } from '../../integrations/synthesia/thumbnails';
import { muxCredentialSchema } from './mux';
import { synthesiaCredentialSchema } from './synthesia';
import type { ProviderId } from './types';

const mux = new Mux();

/**
 * 6h — deliberately longer than the 1h stream token in resolve.server.ts. A
 * thumbnail token is low-value, and a board tab left open across a morning
 * should not fill with broken images.
 */
const POSTER_TTL_SECONDS = 6 * 60 * 60;

/** 2x the 80px the board draws. The unsized default is a ~1920px JPEG. */
const POSTER_WIDTH = '160';

export interface PosterLesson {
  id: number;
  provider: ProviderId;
  ref: string;
}

/**
 * Poster frames for a course's lessons, as `lessonId → url`.
 *
 * A lesson is ABSENT rather than null when it has no poster — no credential,
 * no thumbnail, or a provider that refused. Absence is the tile's cue to draw
 * its grey icon, and there is no error state because a missing poster is not
 * something an admin can act on.
 *
 * Credentials arrive through `loadCredentials` rather than a courseId lookup so
 * this stays testable without rebuilding the Drizzle schema.
 */
export async function buildLessonPosters({
  courseId,
  lessons,
  loadCredentials,
}: {
  courseId: number;
  lessons: PosterLesson[];
  loadCredentials: (provider: ProviderId) => Promise<unknown | null>;
}): Promise<Record<number, string>> {
  const muxLessons = lessons.filter((l) => l.provider === 'mux');
  const synthesiaLessons = lessons.filter((l) => l.provider === 'synthesia');

  // Concurrent and independently guarded: neither provider can take the other
  // down, and a course using one never pays for the other.
  const [muxPosters, synthesiaPosters] = await Promise.all([
    muxLessons.length > 0 ? signMuxPosters(muxLessons, loadCredentials) : {},
    synthesiaLessons.length > 0
      ? fetchSynthesiaPosters(courseId, synthesiaLessons, loadCredentials)
      : {},
  ]);

  return { ...muxPosters, ...synthesiaPosters };
}

async function signMuxPosters(
  lessons: PosterLesson[],
  loadCredentials: (provider: ProviderId) => Promise<unknown | null>,
): Promise<Record<number, string>> {
  try {
    const creds = await loadCredentials('mux');
    if (!creds) return {};
    const { keyId, privateKey } = muxCredentialSchema.parse(creds);

    const entries = await Promise.all(
      lessons.map(async (lesson) => {
        try {
          // Signing is local, so this is N milliseconds and zero round trips.
          const token = await mux.jwt.signPlaybackId(lesson.ref, {
            keyId,
            keySecret: privateKey,
            expiration: `${POSTER_TTL_SECONDS}s`,
            // `t` audience: image.mux.com rejects the `v` token the stream URL
            // carries. Same split resolve.server.ts documents.
            type: 'thumbnail',
            // For a signed playback id every query param must be in the claims
            // too, or Mux refuses the request.
            params: { width: POSTER_WIDTH },
          });
          // No `time` param: Mux defaults to mid-video, which beats the black
          // frame or title card that time=0 usually lands on.
          return [
            lesson.id,
            `https://image.mux.com/${lesson.ref}/thumbnail.jpg?width=${POSTER_WIDTH}&token=${token}`,
          ] as const;
        } catch {
          // One unusable ref must not cost the rest of the board its posters.
          return null;
        }
      }),
    );

    return Object.fromEntries(entries.filter((entry) => entry !== null));
  } catch (error) {
    console.error('Mux poster signing failed for the course', error);
    return {};
  }
}

async function fetchSynthesiaPosters(
  courseId: number,
  lessons: PosterLesson[],
  loadCredentials: (provider: ProviderId) => Promise<unknown | null>,
): Promise<Record<number, string>> {
  try {
    const creds = await loadCredentials('synthesia');
    if (!creds) return {};
    const { apiKey } = synthesiaCredentialSchema.parse(creds);
    const thumbnails = await getVideoThumbnailsWithCache({ courseId, apiKey });

    return Object.fromEntries(
      lessons
        .map((lesson) => [lesson.id, thumbnails[lesson.ref]] as const)
        .filter((entry): entry is readonly [number, string] =>
          Boolean(entry[1]),
        ),
    );
  } catch (error) {
    console.error('Synthesia thumbnail sweep failed for the course', error);
    return {};
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/lib/video-providers/posters.server.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/video-providers/posters.server.ts src/lib/video-providers/posters.server.test.ts
git commit -m "feat(video): build lesson poster urls for mux and synthesia"
```

---

### Task 3: Endpoint and data hook

**Files:**
- Modify: `src/db/admin.ts` (imports at top; new export beside `resolveLessonPlayback` around line 598)
- Create: `src/routes/api/admin/courses.$courseId.lesson-posters.ts`
- Create: `src/data-hooks/use-lesson-posters.ts`
- Modify: `src/data-hooks/keys.ts:6-9`

**Interfaces:**
- Consumes: `buildLessonPosters`, `PosterLesson` (Task 2); existing `resolveCourseProvider`, `requireAdmin`, `ForbiddenError`
- Produces:
  - `getCourseLessonPosters(courseId: number): Promise<Record<number, string>>`
  - `GET /api/admin/courses/:courseId/lesson-posters` → `Record<string, string>`
  - `useLessonPosters(courseId: number)` → TanStack Query result of `Record<string, string>`
  - `dataKeys.lessonPosters(courseId)`

- [ ] **Step 1: Add the query key**

In `src/data-hooks/keys.ts`, after the `lessonPlayback` entry:

```ts
  lessonPosters: (courseId: number) =>
    ['admin', 'lesson-posters', courseId] as const,
```

- [ ] **Step 2: Add `getCourseLessonPosters` to the db layer**

In `src/db/admin.ts`, add `isNotNull` to the existing `drizzle-orm` import list (it is alphabetical: between `inArray` and `like`), and add this import beside the other video-provider imports:

```ts
import { buildLessonPosters } from '#/lib/video-providers/posters.server';
```

Then add this export immediately after `resolveLessonPlayback` (which ends at line 598):

```ts
/**
 * Poster frames for every lesson in a course that has a video, as
 * `lessonId → url`. Lessons with no poster are absent — see
 * `buildLessonPosters`.
 */
export async function getCourseLessonPosters(
  courseId: number,
): Promise<Record<number, string>> {
  const rows = await db
    .select({
      id: lessonsTable.id,
      provider: lessonsTable.videoProvider,
      ref: lessonsTable.videoRef,
    })
    .from(lessonsTable)
    .innerJoin(modulesTable, eq(modulesTable.id, lessonsTable.moduleId))
    .where(
      and(
        eq(modulesTable.courseId, courseId),
        isNotNull(lessonsTable.videoProvider),
        isNotNull(lessonsTable.videoRef),
      ),
    );

  // The SQL guards both columns, but the column types stay nullable, so this
  // narrows rather than asserting.
  const lessons = rows.flatMap((row) =>
    row.provider && row.ref
      ? [{ id: row.id, provider: row.provider as ProviderId, ref: row.ref }]
      : [],
  );
  if (lessons.length === 0) return {};

  return buildLessonPosters({
    courseId,
    lessons,
    loadCredentials: (provider) => resolveCourseProvider(courseId, provider),
  });
}
```

- [ ] **Step 3: Create the route**

Create `src/routes/api/admin/courses.$courseId.lesson-posters.ts`:

```ts
import { createFileRoute } from '@tanstack/react-router';
import { getCourseLessonPosters } from '@/db/admin';
import { ForbiddenError, requireAdmin } from '@/lib/admin-functions.server';

export const Route = createFileRoute(
  '/api/admin/courses/$courseId/lesson-posters',
)({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          await requireAdmin(request.headers);
        } catch (error) {
          if (error instanceof ForbiddenError) {
            return new Response('Forbidden', { status: 403 });
          }
          throw error;
        }
        const courseId = Number(params.courseId);
        if (!Number.isInteger(courseId) || courseId <= 0) {
          return Response.json({ error: 'Invalid course id' }, { status: 400 });
        }
        // No 404 branch: a course with no posters is `{}`, a real answer. The
        // board route already reports a missing course.
        return Response.json(await getCourseLessonPosters(courseId));
      },
    },
  },
});
```

- [ ] **Step 4: Create the data hook**

Create `src/data-hooks/use-lesson-posters.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { dataKeys } from './keys';

const lessonPostersSchema = z.record(z.string(), z.string());

/**
 * Poster frames for a course's lessons, keyed by lesson id.
 *
 * 30 minutes can outlive a short-lived Synthesia URL, leaving the client
 * holding one that 403s. Accepted rather than engineered around: the failure
 * mode is the grey tile the board drew before posters existed, it self-heals
 * on the next refetch, and a shorter staleTime would cost every board load to
 * prevent something cosmetic.
 */
export function useLessonPosters(courseId: number) {
  return useQuery({
    queryKey: dataKeys.lessonPosters(courseId),
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/courses/${courseId}/lesson-posters`,
      );
      if (!res.ok) throw new Error(`Failed to load posters (${res.status})`);
      return lessonPostersSchema.parse(await res.json());
    },
    staleTime: 30 * 60_000,
  });
}
```

- [ ] **Step 5: Regenerate the route tree and typecheck**

Run: `pnpm build`
Expected: succeeds, and `src/routes/api/admin/courses.$courseId.lesson-posters.ts` appears in `src/routeTree.gen.ts`.

This step is not optional. A route that typechecks can still break the build (see the `.server.ts` import rule in the repo's notes), and `routeTree.gen.ts` is generated — only a build produces it.

- [ ] **Step 6: Run the full suite**

Run: `pnpm test`
Expected: PASS — no existing test imports the new modules.

- [ ] **Step 7: Commit**

```bash
git add src/db/admin.ts src/data-hooks/keys.ts src/data-hooks/use-lesson-posters.ts src/routes/api/admin/courses.\$courseId.lesson-posters.ts src/routeTree.gen.ts
git commit -m "feat(admin): serve lesson poster urls for a course board"
```

Note: `git add` with explicit paths only. Do not `git add -A` — this working tree holds unrelated uncommitted work.

---

### Task 4: Poster on the tile

**Files:**
- Modify: `src/components/admin/lesson-video-tile.tsx` (whole file)
- Test: `src/components/admin/__tests__/lesson-video-tile.test.tsx`

**Interfaces:**
- Produces: `LessonVideoTile` gains `posterUrl?: string | null`

- [ ] **Step 1: Write the failing tests**

Append to the existing `describe('LessonVideoTile', ...)` in `src/components/admin/__tests__/lesson-video-tile.test.tsx`. Leave the five existing tests untouched:

```ts
  it('draws the poster frame it was given', () => {
    const { container } = render(
      <LessonVideoTile
        hasVideo
        lessonName="Crosswind landings"
        posterUrl="https://image.mux.com/abc/thumbnail.jpg?token=t"
        onPlay={vi.fn()}
      />,
    );

    const poster = container.querySelector('img');
    expect(poster?.getAttribute('src')).toBe(
      'https://image.mux.com/abc/thumbnail.jpg?token=t',
    );
  });

  it('leaves the poster decorative, so the button keeps the only name', () => {
    // The button already announces "Play {lesson} video". An alt text here
    // would make a screen reader read the lesson twice.
    const { container } = render(
      <LessonVideoTile
        hasVideo
        lessonName="Crosswind landings"
        posterUrl="https://image.mux.com/abc/thumbnail.jpg"
        onPlay={vi.fn()}
      />,
    );

    expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
    expect(
      screen.getByRole('button', { name: /play crosswind landings video/i }),
    ).toBeTruthy();
  });

  it('draws no image at all when there is no poster', () => {
    const { container } = render(
      <LessonVideoTile hasVideo lessonName="A" onPlay={vi.fn()} />,
    );

    expect(container.querySelector('img')).toBeNull();
  });

  it('keeps the poster on the drag overlay, where there is no play handler', () => {
    // Without this the tile greys out the instant a card is picked up.
    const { container } = render(
      <LessonVideoTile
        hasVideo
        lessonName="A"
        posterUrl="https://image.mux.com/abc/thumbnail.jpg"
      />,
    );

    expect(container.querySelector('img')).toBeTruthy();
  });

  it('shows no poster for a lesson with no video', () => {
    const { container } = render(
      <LessonVideoTile
        hasVideo={false}
        lessonName="A"
        posterUrl="https://image.mux.com/abc/thumbnail.jpg"
      />,
    );

    expect(container.querySelector('img')).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/components/admin/__tests__/lesson-video-tile.test.tsx`
Expected: FAIL — the first new test errors on an unknown `posterUrl` prop / finds no `img`.

- [ ] **Step 3: Rewrite the component**

Replace the whole of `src/components/admin/lesson-video-tile.tsx`:

```tsx
import { Play, Video } from 'lucide-react';

type LessonVideoTileProps = {
  /** Whether a video is assigned to this lesson. */
  hasVideo: boolean;
  /** Lesson name, for the play control's accessible name. */
  lessonName: string;
  /** Poster frame from the video provider. Absent for a lesson whose provider
   *  exposes none, or before the posters query resolves. */
  posterUrl?: string | null;
  /** Omitted when the board has no way to play (e.g. the drag overlay). */
  onPlay?: () => void;
};

const TILE =
  'relative flex aspect-video w-20 shrink-0 items-center justify-center overflow-hidden rounded bg-gray-3';

/**
 * The frame itself. Decorative — the play button already carries the lesson
 * name, and alt text here would announce it twice.
 *
 * There is no `onError` handler and no loading state. If the provider token
 * has expired the request 403s, the image never paints, and the tile's own
 * `bg-gray-3` shows through — which is exactly the tile the board drew before
 * posters existed. Building the fallback out of stacking order rather than
 * state is not a shortcut: presentational components here must stay hookless
 * (react-compiler nulls the dispatcher under vitest), and a fallback that
 * cannot run is a fallback that cannot break.
 */
const PosterFrame = ({ src }: { src: string }) => (
  <img
    src={src}
    alt=""
    className="absolute inset-0 h-full w-full object-cover"
  />
);

/**
 * The glyph, on a disc when it sits over a frame.
 *
 * A translucent scrim cannot guarantee contrast over an arbitrary photograph —
 * the maths depends on the frame. A near-opaque disc holds white at ≥4.5:1
 * against any frame AND against the grey tile beneath it, which is what makes
 * the silent image failure above safe. This is the one place the themed Radix
 * scale can't be used: no scale step is defined against unknown imagery.
 */
const PlayGlyph = ({ onPoster }: { onPoster: boolean }) =>
  onPoster ? (
    <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition-colors group-hover:bg-black/75">
      <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
    </span>
  ) : (
    <Play className="h-4 w-4 fill-current" aria-hidden="true" />
  );

/**
 * 16:9 video tile on a lesson card, 80×45.
 *
 * It used to be a deliberately blank 56×32 marker, on the grounds that a frame
 * that small is an unreadable smudge and that posters would cost a provider
 * round trip per lesson. Both held. Both were addressed rather than overruled:
 * 80×45 is legible, Mux thumbnails are signed locally, and Synthesia exposes
 * thumbnails through its list endpoint (100 videos a call), so a course costs
 * one or two requests rather than one per lesson.
 *
 * With no video this is a plain element rather than a disabled button: there
 * is nothing to play, so a control that looks pressable and opens an empty
 * modal would be an affordance that lies.
 *
 * At 45px tall the tile clears the 44px hit target on its own, so the
 * `-m-1.5 p-1.5` trick that used to grow it is gone.
 */
export const LessonVideoTile = ({
  hasVideo,
  lessonName,
  posterUrl,
  onPlay,
}: LessonVideoTileProps) => {
  const poster = hasVideo && posterUrl ? posterUrl : null;

  if (!hasVideo || !onPlay) {
    return (
      <span
        className={`${TILE} text-gray-8`}
        // Not `aria-hidden`: "no video" is real information about the lesson,
        // and the dot this replaced was invisible to screen readers entirely.
        role="img"
        aria-label={hasVideo ? 'Has a video' : 'No video'}
      >
        {poster && <PosterFrame src={poster} />}
        {/* `alt=""` makes the frame presentational, so this stays the only
            element with an img role and the label above still resolves. */}
        {hasVideo ? (
          <PlayGlyph onPoster={Boolean(poster)} />
        ) : (
          <Video className="h-4 w-4" aria-hidden="true" />
        )}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label={`Play ${lessonName} video`}
      className="shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
    >
      <span
        className={`${TILE} group text-gray-11 transition-colors hover:bg-gray-4 hover:text-primary`}
      >
        {poster && <PosterFrame src={poster} />}
        <PlayGlyph onPoster={Boolean(poster)} />
      </span>
    </button>
  );
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run src/components/admin/__tests__/lesson-video-tile.test.tsx`
Expected: PASS — 5 existing + 5 new.

If the existing test `states the video state to a screen reader either way` fails on an ambiguous `img` role, the poster's `alt=""` is missing — `<img alt="">` is presentational and must not match `getByRole('img')`.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/lesson-video-tile.tsx src/components/admin/__tests__/lesson-video-tile.test.tsx
git commit -m "feat(admin): draw the video poster frame on lesson tiles"
```

---

### Task 5: Wire posters through the board

**Files:**
- Modify: `src/components/admin/lesson-card.tsx:8-28`
- Modify: `src/components/admin/sortable-lesson-card.tsx:14-20,50-57`
- Modify: `src/components/admin/lesson-board-container.tsx:16-43`
- Modify: `src/components/admin/module-column.tsx:9-24,82-92`
- Modify: `src/components/admin/sortable-module-column.tsx:14-19,46-64`
- Modify: `src/components/admin/module-board-container.tsx:285-301`
- Test: `src/components/admin/__tests__/lesson-card.test.tsx`

**Interfaces:**
- Consumes: `useLessonPosters` (Task 3); `LessonVideoTile`'s `posterUrl` (Task 4)
- Produces: `posters: Record<string, string>` flows from `ModuleBoardContainer` to every tile

- [ ] **Step 1: Write the failing wiring test**

Append to `describe('LessonCard', ...)` in `src/components/admin/__tests__/lesson-card.test.tsx`:

```tsx
  it('hands the poster it was given to the video tile', () => {
    // The wiring test. A prop-existence check would pass while the card
    // quietly dropped the url on the floor; this fails the moment the tile
    // stops receiving it.
    const { container } = render(
      <LessonCard
        lesson={lesson({ isConfigured: true })}
        posterUrl="https://image.mux.com/abc/thumbnail.jpg"
        onPlay={vi.fn()}
      />,
    );

    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://image.mux.com/abc/thumbnail.jpg',
    );
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/components/admin/__tests__/lesson-card.test.tsx`
Expected: FAIL — TypeScript rejects the unknown `posterUrl` prop and no `img` renders.

- [ ] **Step 3: Add the prop to `LessonCard`**

In `src/components/admin/lesson-card.tsx`, add to the destructured params and the type:

```tsx
export const LessonCard = ({
  lesson,
  posterUrl,
  dragHandleProps,
  onEdit,
  onDelete,
  onPlay,
}: {
  lesson: BoardLesson;
  /** Poster frame for this lesson's video, when its provider exposes one. */
  posterUrl?: string | null;
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Opens the preview modal. Omitted where there is nowhere to open it. */
  onPlay?: () => void;
}) => {
```

and pass it through:

```tsx
      <LessonVideoTile
        hasVideo={lesson.isConfigured}
        lessonName={lesson.name}
        posterUrl={posterUrl}
        onPlay={onPlay}
      />
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/components/admin/__tests__/lesson-card.test.tsx`
Expected: PASS — 4 existing + 1 new.

- [ ] **Step 5: Thread `posterUrl` through `SortableLessonCard`**

In `src/components/admin/sortable-lesson-card.tsx`:

```tsx
export const SortableLessonCard = ({
  lesson,
  moduleId,
  posterUrl,
}: {
  lesson: BoardLesson;
  moduleId: number;
  posterUrl?: string | null;
}) => {
```

and on the rendered card, add `posterUrl={posterUrl}` beside `lesson={lesson}`.

- [ ] **Step 6: Thread `posters` through `LessonBoardContainer`**

In `src/components/admin/lesson-board-container.tsx`:

```tsx
export const LessonBoardContainer = ({
  moduleId,
  lessons,
  posters,
}: {
  moduleId: number;
  lessons: BoardLesson[];
  /** lessonId → poster url, from `useLessonPosters`. Missing ids draw the
   *  grey tile. */
  posters: Record<string, string>;
}) => {
```

and in the map:

```tsx
            <SortableLessonCard
              key={lesson.id}
              lesson={lesson}
              moduleId={moduleId}
              posterUrl={posters[lesson.id]}
            />
```

`posters[lesson.id]` indexes a string-keyed object with a number — JavaScript coerces it, so no key transform is needed.

- [ ] **Step 7: Thread `posters` through `ModuleColumn`**

In `src/components/admin/module-column.tsx`, add to the params and type:

```tsx
  posters,
```

```tsx
  /** Only used by the static fallback list below, i.e. the module drag
   *  overlay — when `lessonsSlot` is supplied it carries its own posters. */
  posters?: Record<string, string>;
```

and in the fallback list:

```tsx
            mod.lessons.map((lesson) => (
              <LessonCard
                key={lesson.id}
                lesson={lesson}
                posterUrl={posters?.[lesson.id]}
              />
            ))
```

- [ ] **Step 8: Thread `posters` through `SortableModuleColumn`**

In `src/components/admin/sortable-module-column.tsx`:

```tsx
export const SortableModuleColumn = ({
  module: mod,
  posters,
}: {
  module: BoardModule;
  posters: Record<string, string>;
}) => {
```

and in the rendered `ModuleColumn`, change the `lessonsSlot` line:

```tsx
        lessonsSlot={
          <LessonBoardContainer
            moduleId={mod.id}
            lessons={mod.lessons}
            posters={posters}
          />
        }
```

Note `ModuleColumn` itself is *not* given `posters` here — its slot is filled, so its static fallback list never renders on this path.

- [ ] **Step 9: Fetch once in `ModuleBoardContainer` and feed all three paths**

In `src/components/admin/module-board-container.tsx`, add the import:

```tsx
import { useLessonPosters } from '@/data-hooks/use-lesson-posters';
```

Add near the other hooks in the component body (it already receives `courseId`):

```tsx
  // One fetch for the whole board. Every tile reads from this map, including
  // both drag overlays below — otherwise a tile greys out the moment it is
  // picked up.
  const { data: posters } = useLessonPosters(courseId);
  const postersById = posters ?? {};
```

Then update the three render sites, at roughly lines 289–300:

```tsx
              <SortableModuleColumn
                key={mod.id}
                module={mod}
                posters={postersById}
              />
```

```tsx
          <ModuleColumn module={activeModule} posters={postersById} />
        ) : activeLesson ? (
          <LessonCard
            lesson={activeLesson}
            posterUrl={postersById[activeLesson.id]}
          />
```

- [ ] **Step 10: Typecheck and run the full suite**

Run: `pnpm build && pnpm test`
Expected: both PASS. The build is what catches a missed prop on any of the six touched components.

- [ ] **Step 11: Lint**

Run: `pnpm check`
Expected: clean. If Biome flags the `img` element for a missing `alt`, confirm `alt=""` is present — an empty alt is the correct decorative marking and Biome accepts it.

- [ ] **Step 12: Commit**

```bash
git add src/components/admin/lesson-card.tsx src/components/admin/sortable-lesson-card.tsx src/components/admin/lesson-board-container.tsx src/components/admin/module-column.tsx src/components/admin/sortable-module-column.tsx src/components/admin/module-board-container.tsx src/components/admin/__tests__/lesson-card.test.tsx
git commit -m "feat(admin): feed poster frames to every lesson tile on the board"
```

---

## Manual verification

After Task 5, the change is only proven in the real app:

- [ ] Run `pnpm dev`, open `/admin/<courseId>/editor` for a course with Mux videos. Tiles show real frames.
- [ ] Check a course with Synthesia videos, and one with both — mixed tiles are expected.
- [ ] Drag a lesson card. The tile keeps its frame throughout the drag.
- [ ] Drag a whole module column. Its lesson tiles keep their frames.
- [ ] Confirm a lesson with no video still shows the grey `Video` icon and reads as "No video" to a screen reader.
- [ ] In devtools, block `image.mux.com` and reload. Tiles fall back to the grey icon; nothing throws and the board still loads.
- [ ] Check the network tab: exactly one request to `/lesson-posters` for the whole board.
