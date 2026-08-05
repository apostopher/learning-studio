# Lesson poster tiles on the admin board

Date: 2026-08-05

## Problem

`LessonVideoTile` on the admin course board draws a 56×32 grey rectangle with a
play glyph. Every lesson's tile is identical, so the tile carries exactly one
bit — "there is a video" — and the board already knows that from
`lesson.isConfigured`. An admin scanning a module of twelve lessons cannot tell
them apart by their tiles.

The component's own doc comment argues against posters, on two grounds:

1. At 56×32 a real video frame is an unreadable smudge.
2. Fetching posters would mean a provider resolution per lesson — an HTTP round
   trip each for Synthesia — on an unvirtualized board.

Both objections are addressed rather than overridden. The tile grows to 80×45,
where a frame is legible. And Synthesia turns out to expose thumbnails in its
paginated list endpoint (100 videos per call), so a whole course costs one or
two requests, not one per lesson.

## Scope

Admin board only. The learner-facing player already has its own poster path
through `Playback.poster` and is untouched.

## Data flow

```
useLessonPosters(courseId)                          [data-hooks]
  → GET /api/admin/courses/:courseId/lesson-posters [route, requireAdmin]
    → getCourseLessonPosters(courseId)              [db/admin.ts]
      ├─ Mux branch:       sign thumbnail tokens locally
      └─ Synthesia branch: getVideoThumbnailsWithCache(courseId, apiKey)
```

The response is `Record<lessonId, posterUrl>`. A lesson is **absent** from the
map when it has no video, its provider has no course credential, its provider
exposes no thumbnail, or the provider call failed. Absent means the tile falls
back to today's grey icon — there is no separate error state, because a missing
poster is not something an admin can act on.

### `getCourseLessonPosters(courseId): Promise<Record<number, string>>`

New export in `src/db/admin.ts`.

1. Select `{ id, videoProvider, videoRef }` for lessons in the course where
   `videoRef IS NOT NULL`, joined through `modulesTable` on `courseId` (same
   join `resolveLessonPlayback` uses).
2. Partition by `videoProvider`.
3. Run the two branches below concurrently, each wrapped in its own try/catch.
   **A failure in one branch returns the other branch's posters, not an error.**
   The board must never fail to load because decoration failed.
4. Merge into one object keyed by lesson id.

If the course has no lessons for a provider, that branch never runs — no
credential decrypt, no HTTP call.

#### Mux branch

Decrypt once via the existing `resolveCourseProvider(courseId, 'mux')`, parse
with `muxCredentialSchema`. Per ref:

```ts
const token = await mux.jwt.signPlaybackId(ref, {
  keyId, keySecret: privateKey,
  expiration: `${POSTER_TTL_SECONDS}s`,
  type: 'thumbnail',
  params: { width: '160' },
});
// https://image.mux.com/{ref}/thumbnail.jpg?width=160&token={token}
```

- `type: 'thumbnail'` because `image.mux.com` validates a `t` audience claim; a
  video-audience token 403s there. This is the same distinction
  `resolve.server.ts` already documents.
- `params` is required, not optional: for a signed playback ID every query
  parameter must also appear in the JWT claims, or Mux rejects the request.
  `width: '160'` is 2× the drawn 80px width; the full-resolution default is a
  ~1920px JPEG per lesson.
- **No `time` param.** Mux defaults to the middle of the video, which is a
  better poster than `time=0` — frame zero on a talking-head video is often a
  black frame or a title card.
- `POSTER_TTL_SECONDS = 6h`, deliberately longer than the 1h stream token. A
  thumbnail token is low-value, and 6h means a board tab left open all morning
  does not accumulate broken images.
- Signing is local RSA, so N lessons cost roughly N milliseconds and zero round
  trips. A per-ref signing failure omits that lesson and continues.

#### Synthesia branch

Decrypt via `resolveCourseProvider(courseId, 'synthesia')`, parse with
`synthesiaCredentialSchema`.

New in `src/integrations/synthesia/videos.ts`:

- `getVideosByPage(page, apiKey?)` — add an `apiKey` parameter defaulting to
  `env.SYNTHESIA_API_KEY`. It currently hardcodes the env key, while per-course
  credentials are the real path everywhere else in the admin flow.
- `getVideoThumbnails(apiKey): Promise<Record<string, string>>` — sweeps pages
  until a page comes back empty or a **page cap of 10** (1000 videos) is hit,
  mapping `video.id → video.thumbnail.image` for videos where
  `isVideoAvailable(v)` and `thumbnail.image` is non-null. The cap bounds a
  large account; hitting it logs, and the lessons not covered simply get no
  poster.
- `getVideoThumbnailsWithCache` — wraps the above in the existing
  `cacheWithRedis`, keyed per course so two courses with different Synthesia
  accounts cannot share an entry. TTL comes from `getVideoExpiry` on any
  thumbnail URL, clamped to `[5min, 6h]` — Synthesia thumbnail URLs are
  pre-signed and carry their own `Expires`, exactly like the download URLs
  `getAllVideosWithCache` already keys its TTL from.

`thumbnail.optimized` and `thumbnail.thumbHash` exist on the schema but are not
used. `optimized` is an untyped `Record<string, string>` whose keys we would be
guessing at, and `thumbHash` would need a decoder dependency for a placeholder
the grey tile already provides.

### Route

`src/routes/api/admin/courses.$courseId.lesson-posters.ts`, mirroring
`courses.$courseId.board.ts`: `requireAdmin` guard returning 403 on
`ForbiddenError`, integer validation on `courseId` returning 400, then
`Response.json(await getCourseLessonPosters(courseId))`.

No 404 case — a course with no posters is `{}`, which is a real answer.

### Hook

`src/data-hooks/use-lesson-posters.ts`, plus `lessonPosters(courseId)` in
`dataKeys`. Parses with `z.record(z.string(), z.string())` and uses
`staleTime: 30 * 60_000`.

JSON object keys are strings, but `posters[lesson.id]` with a numeric id
resolves identically at runtime, so no key transform is needed.

A 30-minute `staleTime` can outlive a Synthesia URL whose `Expires` was short,
leaving the client holding a dead URL for up to half an hour. That is accepted
rather than engineered around: the failure mode is a grey tile, it self-heals
on the next refetch, and tightening `staleTime` would trade a real cost on
every board load against a cosmetic one that may never occur.

## Component changes

### `LessonVideoTile`

New optional prop `posterUrl?: string | null`. Size goes from
`h-8 w-[3.5rem]` to `aspect-video w-20` — exactly 80×45.

Layout when a poster exists:

- `<img src={posterUrl} alt="" />` absolutely positioned, `object-cover`, over
  the existing `bg-gray-3`.
- The play glyph sits in a centred `bg-black/60` disc, white fill.

Two decisions worth stating:

**The disc, not a full-bleed scrim.** Contrast against an arbitrary photograph
cannot be guaranteed by a translucent overlay — the maths depends on the frame.
A near-opaque disc gives white ≥4.5:1 against any frame *and* against the grey
fallback beneath it.

**No `onError` handler.** If a token expires and the image 403s, the `<img>`
simply fails to paint and the `bg-gray-3` beneath it shows through — a tile
that looks like today's. This is deliberate: presentational components in this
codebase must stay hookless (react-compiler nulls the dispatcher under vitest),
so a stateful fallback is not available. Building the fallback out of stacking
order instead of state costs nothing and cannot break.

`alt=""` because the poster is decorative — the button already carries
`Play {lessonName} video`.

The `-m-1.5 p-1.5` hit-area trick is **removed**. It existed to push a 32px
tile past the 44px target; at 45px tall the tile clears it unaided.

The no-video branch (`Video` icon, `role="img"`, `aria-label`) is unchanged.

### Plumbing

`ModuleBoardContainer` already receives `courseId`, so it calls the hook once
and passes `posters` down. There are three render paths that reach a tile, and
all three must be fed or tiles grey out mid-drag:

```
ModuleBoardContainer                    calls useLessonPosters(courseId)
  ├─ SortableModuleColumn   posters     normal board
  │    ├─ ModuleColumn                  (lessonsSlot filled; its own
  │    │                                 LessonCard fallback unused here)
  │    └─ LessonBoardContainer posters   ← passed as lessonsSlot
  │         └─ SortableLessonCard posterUrl
  │              └─ LessonCard posterUrl
  │                   └─ LessonVideoTile posterUrl
  ├─ ModuleColumn           posters     module drag overlay — lessonsSlot is
  │    └─ LessonCard posterUrl           omitted, so its static list renders
  └─ LessonCard             posterUrl   lesson drag overlay
```

Note `LessonBoardContainer` is constructed inside `SortableModuleColumn` and
injected into `ModuleColumn` as `lessonsSlot`, so `posters` reaches it through
`SortableModuleColumn` — *not* through `ModuleColumn`. `ModuleColumn`'s own
`posters` prop serves only its static fallback list on the module-drag path.

`LessonCard` and `LessonVideoTile` stay presentational — one optional string
prop each, no hooks, no fetching.

`LessonCard` and `LessonVideoTile` stay presentational — one optional string
prop each, no hooks, no fetching.

### Layout impact

Lesson card row height goes 48px → 61px (`py-2` plus a 45px tile). Module
columns are `w-80` and already scroll vertically, so nothing else moves.

## Testing

Per the repo's testing rule, every test asserts on what the consumer received,
not on what a producer stored.

**`lesson-video-tile.test.tsx`** — the existing five tests stay unchanged. Add:

- Given a `posterUrl`, the rendered output contains an `<img>` with that `src`.
- Given none, there is no `<img>` at all.

**`lesson-card.test.tsx`** — rendering `LessonCard` with a `posterUrl` produces
that `<img src>`. This is the wiring test: it fails the moment `LessonCard`
stops handing the URL to the tile, which a prop-existence assertion would not.

**`getCourseLessonPosters`** — following `resolve.server.test.ts`'s
`vi.hoisted` mock of `signPlaybackId`:

- Mux refs are signed with `type: 'thumbnail'` and `params: { width: '160' }`,
  and the returned URL carries both `width=160` and the token.
- No `time` parameter appears in the URL.
- Synthesia lessons map to their `thumbnail.image`.
- A course with both providers returns entries for both.
- When the Synthesia sweep throws, the Mux posters still come back — and the
  mirror case.
- A ref whose signing throws is omitted rather than failing the whole map.
- A course with no provider credentials returns `{}` and makes no provider call.

**`getVideoThumbnails`** — stops at an empty page; stops at the page cap;
skips videos that are not `isVideoAvailable`; skips a null `thumbnail.image`;
passes the supplied `apiKey` rather than the env key.

Each new test is verified red against unfixed code before being kept.

## Out of scope

- Learner-facing surfaces. `Playback.poster` already serves those.
- Persisting poster URLs in the database. Both providers' URLs expire, so a
  stored column would need its own refresh path; Redis plus a client cache
  covers the same ground without a migration.
- Virtualizing the board.
