# Shared Video Player — Design

**Date:** 2026-10-14
**Status:** Approved in conversation; awaiting written-spec review.
**Project:** 1 of 2. Project 2 (Mux auto-captions) gets its own spec.

## Goal

One video player used everywhere video plays: the learner lesson page,
admin previews, and any future page that has a video URL. It has the
existing custom controls, a CC toggle and the video-language menu.

## What the user asked for

- A shared player for admin and non-admin pages.
- Regular controls, a CC toggle, and a language selector.
- The language selector switches to the alternate-language **recording**,
  as it does today. It does not pick a caption language.
- Placements: the admin lesson video preview, other learner pages, and
  "anywhere a video URL is shown".

**Assumption:** "anywhere a video URL is shown" means a generic drop-in
that takes a URL plus optional captions and languages and knows nothing
about lessons. No page gets a video it doesn't have today.

## Current state

- `src/components/video-player/` already holds a full custom player.
  - **`VideoPlayer`** (presentational): seek bar, play/pause, time,
    volume, playback-rate menu, CC toggle, language menu, fullscreen,
    big-play, spinner and error overlay.
  - **`VideoPlayerContainer`** (stateful, jotai atom family keyed by
    `playerId`):
    - HLS via `attachMedia`;
    - recovery from 401/403, with up to 2 retries
      (`compute-recovery-action.ts`);
    - language-switch resume (`restore-point.ts`);
    - keyboard shortcuts.
- Only the learner lesson page uses it, through
  `lesson-main/parts/lesson-player-container.tsx`. That wrapper adds the
  lesson-specific features: progress tracking (`useMilestoneReporter`),
  the debrief and coverage overlays, and the global `videoLanguageAtom`.
- Admin (`admin/lesson-config/video-preview.tsx`) is a bare
  `<video controls>`. It has no captions and no language menu, and it
  previews the primary video only.
  - It is used by `video-section-container.tsx` and
    `lesson-video-modal-container.tsx`.
  - The modal's comment says it avoids the learner player because that
    player records progress. That is true of `LessonPlayerContainer`
    only; `VideoPlayerContainer` records nothing. The comment is stale.
- Captions: one WebVTT track, Synthesia only. Mux always returns
  `captions: null`.

## Design

### 1. Public API

The drop-in is the existing **`VideoPlayerContainer`** (exported from
`#/components/video-player`), kept under that name: the project's naming
rule is `foo-container.tsx` / `FooContainer` for stateful components, so
renaming it `VideoPlayer` would break convention and churn every import.
The presentational `VideoPlayer` keeps its name too. *(Revised from the
conversation's "rename to VideoPlayer" for that reason.)*

```ts
type VideoCaption = { src: string; lang: string; label: string };

type VideoPlayerContainerProps = {
  src: string;                         // required
  kind?: 'hls' | 'file';               // default 'file'
  poster?: string;
  captions?: VideoCaption[];           // omitted or [] → no CC button
  captionsUnavailable?: boolean;       // disabled CC button stating why
  languages?: VideoLanguageOption[];   // menu renders only with 2+
  activeLanguage?: string;
  onLanguageChange?: (code: string) => void;
  onSourceExpired?: () => void;        // mid-play 401/403 → caller re-resolves
  onPlaybackFailed?: (message: string) => void; // recovery exhausted (new)
  onEnded?: () => void;
  overlay?: React.ReactNode;
  playerId?: string;                   // lets a wrapper read player state
  labels?: Partial<VideoPlayerLabels>;
  playbackRates?: number[];
};
```

- **Captions:** `captions` replaces passing raw `<track>` props. The
  player builds the `<track>` elements itself (`kind="subtitles"`, with
  the first one `default`). CC turns on the first track, as today.
  - `TrackProps` in `lesson-main/types.ts` and `playbackToState` change to
    produce `VideoCaption[]`.
- **`onPlaybackFailed`:** a new callback. It fires once when
  `computeRecoveryDecision` returns `terminal`, with that decision's
  message. The player still shows its own error overlay.
- **The core player never records progress.** A header comment says so.
  Lesson features stay in `LessonPlayerContainer`, which wraps
  `VideoPlayer` and is otherwise unchanged.
- **Plain MP4:** `src` alone (`kind` `'file'`, no captions, no languages)
  must work. A story and a render test cover it.

### 2. Admin

- `VideoPreview`'s `<video controls>` is replaced by `VideoPlayerContainer` in both
  places:
  - the lesson config video section (`video-section-container.tsx`);
  - the lesson video modal (`lesson-video-modal-container.tsx`).
- The empty, rendering and failed placeholders are kept, either moved
  into the admin container or kept as a small presentational component.
- **Language preview:**
  - `GET /api/admin/lessons/$lessonId/video-playback` accepts an optional
    `?lang=`.
  - An unknown or unattached `lang` falls back to the primary video,
    matching the learner route's behaviour, and is never an error.
  - `resolveLessonPlayback(lessonId, courseId, lang)` in `src/db/admin.ts`
    picks the video with `selectVideoForLang`, the same helper the
    learner route uses.
  - The route returns `lang` and `languages` with the playback, so the
    admin response reuses `learnerPlaybackSchema`'s language fields.
- **Admin language state:**
  - Kept in a jotai atom family keyed by lesson id. It is per page and not
    persisted.
  - It is never `videoLanguageAtom`: previewing in French must not change
    the admin's own learner language preference.
  - The data hook's query key includes the language.
- **Captions:** they follow the playback. Synthesia videos show CC. Mux
  videos show the disabled CC button with its reason until Project 2.
- **Dead Mux key:**
  - Today a 401/403 sets `playbackForbidden` immediately (`onForbidden`).
  - Now the player's recovery runs first: `onSourceExpired` refetches the
    admin playback, up to 2 tries.
  - On `onPlaybackFailed`, admin sets `playbackForbidden` and shows the
    existing "stored key is no longer valid" notice.
  - Synthesia's server-side `PROVIDER_AUTH_REJECTED` path is unchanged.
- **No progress from admin:** admin never renders
  `LessonPlayerContainer`. The stale comment in
  `lesson-video-modal-container.tsx` is corrected, and a test pins that
  admin previews never call the progress reporter.

### 3. Edge cases

| Case | Behaviour |
|---|---|
| `src` changes mid-play (language switch, re-resolved URL) | Position restored on `loadedmetadata`. Playing resumes; paused stays paused (existing `restore-point.ts`). |
| Two players on one page | Independent state, because each `playerId` keys its own atom. |
| Caption file fails to load (expired signed VTT) | The `<track>` `error` event sets `captionsUnavailable`. CC shows its disabled "unavailable" state; it is never silently blank. |
| No captions and no languages | No CC button and no language menu. |
| Fewer than 2 languages | No language menu (existing rule). |

### 4. Accessibility and UX

- Keep what exists:
  - accessible names on every control;
  - the disabled CC button states its reason, visibly and in its
    accessible name (see memory: locked states state their reason);
  - keyboard-navigable Base UI menus;
  - the existing shortcuts.
- Overlay controls meet WCAG AA, 4.5:1 for text.
- The player fits the half-width admin column: the control bar wraps or
  collapses secondary controls instead of overflowing. Check at 320px
  player width.
- CSS changes use logical properties (project CLAUDE.md).

### 5. Testing

The repo can't render-test components that use hooks under Vitest (see
`hooks.ts` header). Logic therefore stays in pure functions, and the
stateful player is verified in the browser.

- **`VideoPlayer` (presentational) render tests** (jsdom, existing pattern in
  `video-player.test.tsx`):
  - captions → one `<track>` per caption, CC enabled;
  - `captionsUnavailable` → disabled CC with its reason;
  - 2+ languages → menu shown; 1 language → no menu;
  - `src` only → no CC button and no menu.
- **Pure functions:**
  - captions → track props;
  - recovery decision → `onPlaybackFailed` firing exactly once on
    `terminal`;
  - the admin preview state, including the language.
- **Admin route:**
  - `?lang=fr` with a French alternate returns that video plus `lang` and
    `languages`;
  - an unknown or unattached `lang` returns the primary video;
  - the existing guards are unchanged.
- **No admin progress:** admin preview code paths never import or call
  `useMilestoneReporter`.
- **Browser walkthrough** on port 5001:
  - learner lesson, including language switch, CC and the debrief
    overlay;
  - admin video section: language preview, CC, and a narrow column;
  - admin lesson modal.

## Out of scope

- Mux auto-captions (Project 2).
- Choosing a caption language separately from the video language.
- Adding video to pages that have none today.
- Resuming playback across reloads.

## Rollout

Code-only. No migration, no new environment variables, no new
dependencies.
