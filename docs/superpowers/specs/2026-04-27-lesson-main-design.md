# Lesson Main — Design

**Date:** 2026-04-27
**Scope:** Replace `<LessonPlaceholder>` in the `/modules/$moduleSlug/lessons/$lessonSlug` route with a `LessonMain` view that shows the lesson title and the `VideoPlayerContainer` wired to that lesson's Synthesia-hosted video. Adds an on-demand `lessonVideoAtomFamily` and a new `/api/lesson/video` endpoint. Honors all loading/error/empty states with clear, screen-reader-friendly messaging. Animates lesson swaps with the React `<ViewTransition>` API.

## Goals

- Render the selected lesson's video in `main` when the user clicks a lesson in the sidebar.
- Fetch the video's `download` URL + VTT captions on demand, only when the lesson is opened.
- Communicate every state to the user clearly: course loading, course error, lesson not found, lesson with no video, video fetching, video errored, root with no lesson selected. Each state announces through ARIA so SR users get the same information sighted users do.
- Reuse the player's built-in spinner / error overlay for the in-player loading + error states; do not duplicate UI.
- Keep `LessonMain` itself a pure presentational component driven by a discriminated state union, so every state is unmissable in the type checker.
- Cross-fade lesson swaps via React 19 `<ViewTransition>`; honor `prefers-reduced-motion` (the browser API short-circuits automatically).
- Keep everything white-label: every color/spacing/font resolves through CSS vars; logical properties only (per project CLAUDE.md).

## Non-goals

- Watch-progress persistence (the player's `timeupdate` event is not yet wired into `useCourseProgress` — separate spec).
- Locked-lesson UI (subscription gating). Sidebar already doesn't render locked lessons.
- Lesson navigation (next / prev arrows, or "next lesson" auto-advance).
- Lesson material (key points, quiz, attachments) — the rest of the lesson page below the player. Future spec.
- Default-lesson redirect from `/`. Root shows an empty state instead.
- Eager prefetching of all videos in `getCourseDetails`. Video URL fetches stay lazy per lesson (matches existing atomFamily pattern; Synthesia rate limits would otherwise spike).
- Forward/backward navigation transition variants (just a base cross-fade for v1).

## Decisions (locked during brainstorm)

| # | Question | Decision |
| --- | --- | --- |
| 1 | How the video URL is fetched | **A** — on-demand `lessonVideoAtomFamily` via new `/api/lesson/video?videoId=…` endpoint, lazy per lesson. |
| 2 | Main-section composition | **B** — lesson title (`<h1>`) above the player. No material panel yet. |
| 3 | States to handle | All seven: course-loading, course-error, lesson-not-found, no-video, video-fetching, video-errored, root-empty. |
| 4 | Route param reading | **A** — TanStack Router's `Route.useParams()` (path params, not query strings). nuqs is for search params and not used here. |
| 5 | Lesson-swap animation | React 19 `<ViewTransition name="lesson-content">` wrapping title + player. Browser default cross-fade; reduced-motion handled by the API. |
| 6 | API endpoint shape | New `GET /api/lesson/video?videoId=…` returning `VideoResponse`. Server calls `getVideoDetailsWithCache(videoId)`. Redis-backed `Expires`-aware cache already handles TTL. |

## Architecture

### File layout

```text
src/atoms/
└── lesson-video.ts                       # lessonVideoAtomFamily(videoId)

src/hooks/data/
├── use-lesson-video.ts                   # thin hook over the atom family
└── keys.ts                               # append `lessonVideo: (id) => ['lesson-video', id]`

src/routes/api/lesson/
└── video.ts                              # GET /api/lesson/video?videoId=…

src/components/lesson-main/
├── lesson-main-wrapper.tsx               # WRAPPER — reads params, fetches, computes LessonMainState
├── lesson-main.tsx                       # pure — receives state union, renders right slot
├── video-response-to-state.ts            # mapper: VideoResponse → VideoFetchState
└── parts/
    ├── lesson-skeleton.tsx               # 16:9 shimmer for course-loading
    ├── lesson-error.tsx                  # course-error card with retry
    ├── lesson-not-found.tsx              # bad lesson slug card
    ├── lesson-no-video.tsx               # lesson exists but no videoId
    ├── lesson-empty.tsx                  # root '/' empty state
    └── lesson-title.tsx                  # <h1> presentational

src/routes/
├── modules.$moduleSlug.lessons.$lessonSlug.tsx   # MODIFY — main = <LessonMainWrapper />
└── index.tsx                             # MODIFY — main = <LessonEmpty />
```

**Modified files:**

- `src/styles.css` — append `@layer components { .lesson-main, .lesson-title, .lesson-player, .lesson-card, .lesson-skeleton-shimmer { … } }`. All token-driven.

### State ownership

| Concern | Lives in |
| --- | --- |
| Route params (`moduleSlug`, `lessonSlug`) | TanStack Router via `Route.useParams()` in `lesson-main-wrapper.tsx`. |
| Course details (modules + lessons) | Existing `courseDetailsAtomFamily` via `useCourseDetails('3d-airmanship')`. |
| Video details for the current lesson | New `lessonVideoAtomFamily(videoId)` via `useLessonVideo(videoId)`. |
| Video playback state | `VideoPlayerContainer` (already shipped) — owns its own atom family. |
| `LessonMainState` discriminated union | Computed in the wrapper, passed to the pure component. |

The wrapper is the only stateful unit; everything below it is presentational.

### Discriminated state union

```ts
import type { ComponentPropsWithoutRef } from 'react';

export type LessonMainState =
  | { kind: 'course-loading' }
  | { kind: 'course-error'; message: string; onRetry: () => void }
  | { kind: 'not-found'; lessonSlug: string }
  | { kind: 'no-video'; lessonName: string }
  | { kind: 'ready'; lessonName: string; videoId: string; videoState: VideoFetchState };

export type VideoFetchState =
  | { status: 'fetching' }
  | { status: 'rendering' }   // Synthesia "in_progress"
  | { status: 'error'; message: string; onRetry: () => void }
  | { status: 'ready'; src: string; poster?: string; tracks: TrackProps[] };

export type TrackProps = ComponentPropsWithoutRef<'track'>;
```

The pure `LessonMain` component switches on `state.kind`. For `kind === 'ready'`, it renders the player; for everything else, it renders the matching part. The compiler enforces exhaustiveness via a `never` check on the default branch.

### `VideoResponse` → `VideoFetchState` mapping

`src/components/lesson-main/video-response-to-state.ts`:

```ts
import { isVideoAvailable, isVideoNotReady, type VideoResponse } from '@/types';
import type { TrackProps, VideoFetchState } from './lesson-main';

export const videoResponseToState = (
  v: VideoResponse | undefined,
  onRetry: () => void,
): VideoFetchState => {
  if (!v) return { status: 'fetching' };
  if (isVideoAvailable(v)) {
    if (!v.download) {
      return { status: 'error', message: 'Video is unavailable', onRetry };
    }
    return {
      status: 'ready',
      src: v.download,
      poster: v.thumbnail.image ?? undefined,
      tracks: vttToTracks(v.captions.vtt),
    };
  }
  if (isVideoNotReady(v)) {
    if (v.status === 'in_progress') return { status: 'rendering' };
    return {
      status: 'error',
      message: 'This video failed to render',
      onRetry,
    };
  }
  return { status: 'error', message: 'Unexpected video response', onRetry };
};

const vttToTracks = (vtt: string | null): TrackProps[] =>
  vtt
    ? [
        {
          src: vtt,
          srcLang: 'en',
          label: 'English',
          kind: 'subtitles',
          default: true,
        },
      ]
    : [];
```

The `'fetching'` and `'rendering'` cases both feed the player as `state.status === 'loading'`; the player's existing `Spinner` part renders. `'rendering'` swaps the spinner label so the user knows the issue is server-side, not network.

### Wrapper logic outline

```ts
export const LessonMainWrapper = ({ moduleSlug, lessonSlug }: Props) => {
  const course = useCourseDetails('3d-airmanship');
  const lesson = findLesson(course.data, moduleSlug, lessonSlug);
  const video = useLessonVideo(lesson?.videoId);
  const state = computeLessonMainState({ course, lesson, lessonSlug, video });
  return <LessonMain state={state} />;
};
```

`computeLessonMainState` is a pure function in the wrapper file (or its own module if it grows). It picks one of the seven kinds based on the inputs. Pure → unit-testable without React.

### `<ViewTransition>` placement

```tsx
// inside LessonMain
<ViewTransition name="lesson-content">
  <article className="lesson-main">
    <LessonTitle name={...} />
    <div className="lesson-player">{/* state-switched content */}</div>
  </article>
</ViewTransition>
```

The transition keys off the surrounding fiber identity. When `lessonSlug` changes, React schedules the swap inside `document.startViewTransition`, the browser snapshots the old subtree, mounts the new one, and cross-fades. Reduced motion is honored by the API automatically.

If `<ViewTransition>` is gated behind an experimental export in the installed React build, the implementation falls back to wrapping the router navigation in `document.startViewTransition(() => router.navigate(...))` from a router subscriber, achieving the same effect with the bare browser API.

## Visual layout

```text
main (inside <ScrollArea>)
└── article.lesson-main (centered, max-inline-size: min(100%, 1100px))
    ├── h1.lesson-title
    └── div.lesson-player (16:9 surface)
        └── <VideoPlayerContainer />  OR  state-card  OR  skeleton
```

### Tokens (white-label, CSS-var-driven)

| Element | Token |
| --- | --- |
| `.lesson-main` outer padding (block + inline) | `calc(var(--spacing) * 6)` |
| Vertical gap (title → player) | `calc(var(--spacing) * 4)` |
| `.lesson-main` `max-inline-size` | `min(100%, 1100px)` |
| `.lesson-title` color | `var(--color-gray-12)` |
| `.lesson-title` font | `var(--font-sans)` (quieter than display; matches body chrome) |
| `.lesson-title` size | `clamp(1.25rem, 2.5vw, 1.75rem)` |
| `.lesson-title` weight | `600` |
| `.lesson-player` aspect | `aspect-ratio: 16/9` |
| Skeleton bg | `var(--color-gray-a4)` |
| Card bg (error / not-found / no-video / empty) | `var(--color-gray-2)` |
| Card text | `var(--color-gray-11)` |
| Card title text | `var(--color-gray-12)` |
| Card border | `1px solid var(--color-gray-a6)` |
| Card padding | `calc(var(--spacing) * 6)` |
| Card border radius | `var(--radius-lg, 0.5rem)` |
| Retry button focus ring | `outline: 2px solid var(--color-accent-9); outline-offset: 2px` |
| Cross-fade duration | browser default (≈ 250 ms); user agent honors reduced motion |

### State component visuals

- **`LessonSkeleton`** — same shell shape as ready (so layout doesn't jump). Title pill: `block-size: 1.5rem; inline-size: 60%; background: var(--color-gray-a4); border-radius: var(--radius-md, 0.375rem)`. Player slot: solid 16:9 box in `--color-gray-a4`. Both pulse via the existing motion shimmer pattern (matching `sidebar-skeleton.tsx`). `aria-busy="true"` on the article.
- **`LessonError`** — centered card, `role="alert"`, `<AlertCircle>` icon (lucide), heading "Couldn't load the course", body "{message}", retry button (real `<button>`, white-label hover via `--color-gray-a4`, focus ring via `--color-accent-9`).
- **`LessonNotFound`** — centered card, `role="status"`, `<SearchX>` icon, heading "Lesson not found", body "We couldn't find a lesson matching `{slug}` in this course."
- **`LessonNoVideo`** — centered card, `role="status"`, `<VideoOff>` icon, heading "No video for this lesson yet", body "This lesson is published, but the video hasn't been uploaded."
- **`LessonEmpty`** (root `/`) — centered card without an outer border, `role="status"`, body "Pick a lesson from the sidebar to begin." Subtle by design.
- **`LessonTitle`** — `<h1 className="lesson-title">{name}</h1>`. Pure.

### Logical CSS only

All spacing/insets/borders use logical properties (`padding-inline`, `padding-block`, `inset-inline`, `margin-inline`, `inline-size`, `block-size`, `border-inline-start`, `text-align: start/end`). No `padding-left`, `margin-top`, `width`, etc.

## Accessibility

- Title: real `<h1>` so SRs land on it after navigation; the SR live region inside the player ("Loading…", "Buffering…", "Captions on/off") was already added in the previous spec.
- Each state card uses an appropriate role: `role="alert"` for hard failures (`LessonError`), `role="status"` for soft informational states (`LessonNotFound`, `LessonNoVideo`, `LessonEmpty`).
- Retry buttons are real `<button type="button">` with explicit `aria-label`s, focus rings via `--color-accent-9`, and Enter/Space activation by default.
- `aria-busy="true"` on the article when `state.kind === 'course-loading'` or when `videoState.status === 'fetching' | 'rendering'` (so SRs announce loading politely without pre-empting current content).
- The view transition is a visual nicety — no a11y impact (the DOM swap is the same; the cross-fade just animates pixels).

## Data flow

```text
sidebar lesson-link click
  → TanStack Router navigates to /modules/X/lessons/Y
  → LessonRoute renders <LessonMainWrapper moduleSlug=X lessonSlug=Y />
  → wrapper reads params + course details
  → wrapper looks up the lesson; if found, calls useLessonVideo(lesson.videoId)
      → atom triggers fetch /api/lesson/video?videoId=…
      → server calls getVideoDetailsWithCache(videoId) → Synthesia (cached in Redis until Expires)
      → returns VideoResponse
  → wrapper computes LessonMainState
  → <LessonMain state={state} /> wrapped in <ViewTransition>
  → renders the right child (player / skeleton / card)
```

## API endpoint

`src/routes/api/lesson/video.ts`:

```ts
import { createFileRoute } from '@tanstack/react-router';
import { getVideoDetailsWithCache } from '#/integrations/synthesia/videos';

export const Route = createFileRoute('/api/lesson/video')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { searchParams } = new URL(request.url);
        const videoId = searchParams.get('videoId');
        if (!videoId) {
          return new Response('videoId is required', { status: 400 });
        }
        try {
          const details = await getVideoDetailsWithCache(videoId);
          return Response.json(details);
        } catch {
          return new Response('Video lookup failed', { status: 502 });
        }
      },
    },
  },
});
```

Response is `VideoResponse` (zod-validated server-side via the existing schema in `getVideoDetails`). Client validates again with `VideoResponseSchema.parse` to catch any drift.

## Atom + hook

```ts
// src/atoms/lesson-video.ts
import { atomFamily } from 'jotai-family';
import { atomWithQuery } from 'jotai-tanstack-query';
import { VideoResponseSchema, type VideoResponse } from '@/types';
import { queryKeys } from '@/hooks/data/keys';

export const lessonVideoAtomFamily = atomFamily((videoId: string) =>
  atomWithQuery<VideoResponse>(() => ({
    queryKey: queryKeys.lessonVideo(videoId),
    queryFn: async () => {
      const r = await fetch(
        `/api/lesson/video?videoId=${encodeURIComponent(videoId)}`,
      );
      if (!r.ok) throw new Error('Failed to fetch video');
      return VideoResponseSchema.parse(await r.json());
    },
    enabled: !!videoId,
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
    retry: 1,
  })),
);
```

```ts
// src/hooks/data/use-lesson-video.ts
import { useAtomValue } from 'jotai';
import { lessonVideoAtomFamily } from '@/atoms/lesson-video';

export const useLessonVideo = (videoId?: string) =>
  useAtomValue(lessonVideoAtomFamily(videoId ?? ''));
```

```ts
// src/hooks/data/keys.ts (append to existing object)
lessonVideo: (videoId: string) => ['lesson-video', videoId] as const,
```

## Testing strategy

vitest + @testing-library/react + jsdom (matches project pattern).

| File | Coverage |
| --- | --- |
| `__tests__/video-response-to-state.test.ts` | All 6 mapper branches (undefined, available+download, available+null download, in_progress, error, rejected). Pure function — easy unit tests. |
| `__tests__/compute-lesson-main-state.test.ts` | All 7 state kinds (course-loading, course-error, not-found, no-video, ready × {fetching, rendering, error, ready}). Pure function — drive with fixtures. |
| `__tests__/lesson-main.test.tsx` | Renders the right child for each `state.kind`; ARIA roles correct (alert vs status); `aria-busy` toggles correctly; retry button fires `onRetry`. |
| `__tests__/lesson-main-wrapper.integration.test.tsx` | Smoke test: provide a mocked atom store, render the wrapper, assert it renders the expected pure component for a happy path. Uses jotai's `Provider` with `createStore` (existing pattern from `course-progress.test.ts`). |

Storybook stories: `lesson-main.stories.tsx` with one story per `state.kind` for visual regression.

## Out of scope (deferred to later specs)

- Watch progress: hook `VideoPlayer.onTimeUpdate` → write to `useCourseProgress`. Needs a backend endpoint and conflict resolution rules.
- Lesson navigation: prev/next buttons in the lesson header.
- Lesson material panel: key points, quiz, attachments below the player.
- Default-lesson redirect on `/`: pick the first available lesson and `router.navigate` to it. Not done because it's opinionated; the empty-state card is friendlier.
- Subscription gating: lock UI when the user lacks the required subscription. Sidebar already filters locked lessons out of the list; the route is a deeper enforcement point we'll add when auth lands.

## Dependencies

All already installed: `@tanstack/react-router`, `@tanstack/react-query`, `jotai`, `jotai-family`, `jotai-tanstack-query`, `zod`, `motion`, `lucide-react`, React 19. No new deps.
