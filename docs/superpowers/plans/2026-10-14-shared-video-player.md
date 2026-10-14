# Shared Video Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `VideoPlayerContainer` the one player used everywhere video
plays: learner lesson page, admin lesson config section and admin lesson
video modal. It has typed captions, a video-language menu, and failure
callbacks.

**Architecture:**
- **Shared player.** `VideoPlayerContainer` (stateful) and `VideoPlayer`
  (presentational) in `src/components/video-player/` gain:
  - a typed `captions` prop, replacing raw `<track>` props;
  - an `onPlaybackFailed` callback;
  - handling for a caption file that fails to load.
- **Admin route.** It resolves an optional `?lang=` with the same
  `selectVideoForLang` the learner route uses, and returns
  `lang`/`languages`.
- **Admin UI.** It replaces its native `<video controls>` with
  `VideoPlayerContainer`. The preview language lives in a per-lesson jotai
  atom family that is never the learner's `videoLanguageAtom`.

**Tech Stack:** TanStack Start, React 19, jotai, TanStack Query, Base UI,
hls.js, Vitest (jsdom), Testing Library, zod.

**Spec:** `docs/superpowers/specs/2026-10-14-shared-video-player-design.md`

## Global Constraints

- Code only: no migration, no new env vars, **no new dependencies**.
- Naming: the drop-in stays `VideoPlayerContainer`
  (`video-player-container.tsx`); the presentational stays `VideoPlayer`.
- The core player never records progress. Only `LessonPlayerContainer`
  calls `useMilestoneReporter`.
- Admin preview language must never read or write `videoLanguageAtom`
  (`src/atoms/video-language.ts`).
- CSS: logical properties only (project CLAUDE.md).
- Vitest imports use `#/`, never `@/`.
- Fully stub internal modules in `vi.mock`; never `importOriginal` them.
- Tests assert on what the consumer received (project CLAUDE.md "Assert on
  What the Consumer Received").
- Before finalising a regression test, confirm it fails against the
  unfixed code.
- Run `pnpm biome check --write <changed files>` on **changed files only**,
  never the whole project.
- The working tree holds ~39 unrelated modified files plus an uncommitted
  hunk in `src/routes/api/tavus/v1/chat/completions.ts`. **Never stage,
  commit, revert or format them.** Stage only the files your task names.

## Review Focus

1. **Admin picks a language, then the signed URL refreshes on its timer.**
   The refetch must keep the chosen language, because the query key and URL
   include `lang`. It must not snap back to English. *Pinned in Task 4
   (hook URL/key test).*
2. **A Mux key that dies mid-preview.** Admin must still end up showing
   "stored key is no longer valid", now only after the player's 2 retries
   (`onPlaybackFailed`), not never. *Pinned in Task 2 (decision helper) and
   Task 5 (section container test).*
3. **A caption VTT whose signed URL expired.** The CC button must flip to
   its disabled "unavailable" state, not toggle a blank track. *Pinned in
   Task 2 (view `onError` test and state helper test).*
4. **The lesson page after the `tracks` → `captions` rename.**
   - Captions still render and default on.
   - The debrief transcript gate still reads `captionsUnavailable`.

   *Pinned in Task 1 (`playbackToState` and view tests).*
5. **Admin `?lang=` with junk** (`?lang=xx`, `?lang=`, or a language the
   lesson lacks). It must return the primary video, never 400 or 404.
   *Pinned in Task 3 (route and resolver tests).*

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/components/video-player/types.ts` | Adds `VideoCaption`. `VideoPlayerProps.captions` replaces `tracks`. Adds actions `onCaptionsError`. | 1, 2 |
| `src/components/video-player/video-player.tsx` | Renders `<track>` from `captions`; wires `onError`. | 1, 2 |
| `src/components/video-player/video-player-container.tsx` | Passes `captions` through. Adds `onPlaybackFailed` and caption-error state. Header comment says it never records progress. | 1, 2 |
| `src/components/video-player/media-failure.ts` (new) | Pure: fatal media error → state patch, retry flag and failed message. Caption-error state patch. | 2 |
| `src/components/lesson-main/types.ts` | `VideoFetchState.ready.captions: VideoCaption[]` replaces `tracks`. | 1 |
| `src/lib/video-providers/playback-to-state.ts` | Emits `captions`. | 1 |
| `src/lib/video-providers/playback-captions.ts` (new) | Pure `captionsForPlayback(captions, lang)`. | 1 |
| `src/components/lesson-main/parts/lesson-player-container.tsx` | Passes `captions`. | 1 |
| `src/components/video-player/video-player.stories.tsx` | Captions story and src-only story. | 1 |
| `src/db/admin.ts` | `resolveLessonPlayback(lessonId, courseId, lang)` returns `lang`/`languages`. | 3 |
| `src/routes/api/admin/lessons.$lessonId.video-playback.ts` | Parses `?lang=`. | 3 |
| `src/data-hooks/keys.ts`, `src/data-hooks/use-lesson-video-playback.ts` | `lang` in key and URL; parses `learnerPlaybackSchema`. | 4 |
| `src/components/admin/lesson-config/compute-video-preview-state.ts`, `src/components/admin/compute-video-modal-state.ts` | Typed on `LearnerPlayback`. | 4 |
| `src/atoms/admin.ts` | `adminPreviewLangAtomFamily`. | 5 |
| `src/components/admin/lesson-config/video-preview.tsx` | The ready branch renders `VideoPlayerContainer`. | 5 |
| `src/components/admin/lesson-config/video-section-container.tsx`, `src/components/admin/lesson-video-modal-container.tsx` | Wire language, refetch and failure. | 5 |
| `src/styles.css` | Narrow-width control bar. | 6 |

---

### Task 1: Typed `captions` through the player and the lesson page

**Files:**
- Modify:
  - `src/components/video-player/types.ts`
  - `src/components/video-player/video-player.tsx`
  - `src/components/video-player/video-player-container.tsx`
  - `src/components/lesson-main/types.ts`
  - `src/lib/video-providers/playback-to-state.ts`
  - `src/components/lesson-main/parts/lesson-player-container.tsx`
  - `src/components/video-player/video-player.stories.tsx`
- Create: `src/lib/video-providers/playback-captions.ts`
- Test:
  - `src/components/video-player/__tests__/video-player.test.tsx`
  - `src/lib/video-providers/__tests__/playback-to-state.test.ts`
  - `src/lib/video-providers/__tests__/playback-captions.test.ts`

**Interfaces:**
- Produces:
  - `export type VideoCaption = { src: string; lang: string; label: string }`
    in `#/components/video-player/types` (re-export from `index.ts`).
  - `VideoPlayerProps.captions?: VideoCaption[]`. The `tracks` prop is
    removed.
  - `VideoFetchState` ready branch: `captions: VideoCaption[]`. `tracks` is
    removed, and `TrackProps` is deleted from `lesson-main/types.ts`.
  - `captionsForPlayback(captions: { vtt: string } | null, lang: VideoLang): VideoCaption[]`
    in `#/lib/video-providers/playback-captions`.

- [ ] **Step 1: Write the failing tests**

`src/lib/video-providers/__tests__/playback-captions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { captionsForPlayback } from '#/lib/video-providers/playback-captions';

describe('captionsForPlayback', () => {
  it('labels the provider VTT with the language that is playing', () => {
    expect(captionsForPlayback({ vtt: 'https://cdn/c.vtt' }, 'fr')).toEqual([
      { src: 'https://cdn/c.vtt', lang: 'fr', label: 'French' },
    ]);
  });

  it('is empty when the provider has no captions', () => {
    expect(captionsForPlayback(null, 'en')).toEqual([]);
  });
});
```

(`label` must equal `labelForLang('fr')`. If `Intl.DisplayNames` gives
`'français'` in this environment, assert
`label: labelForLang('fr')` instead of a literal.)

In `playback-to-state.test.ts`, replace every `state.tracks` expectation with
`state.captions`. For example, the "carries the url…" test becomes:

```ts
    expect(state.captions).toEqual([
      { src: 'https://cdn/c.vtt', lang: 'en', label: 'English' },
    ]);
```

Do the same for the "no captions" test (`expect(state.captions).toEqual([])`)
and the language-label test (`state.captions[0]` matching `{ lang: <played lang> }`).

In `video-player.test.tsx`:
- Replace the `tracks={[...]}` fixture with
  `captions={[{ src: 'cap.vtt', lang: 'en', label: 'English' }]}`.
- Add:

```ts
  it('renders one subtitles <track> per caption, the first one default', () => {
    const ref = createRef<HTMLVideoElement>();
    const { container } = render(
      <VideoPlayer
        {...MIN_PROPS}
        videoRef={ref}
        captions={[
          { src: 'en.vtt', lang: 'en', label: 'English' },
          { src: 'fr.vtt', lang: 'fr', label: 'French' },
        ]}
      />,
    );
    const tracks = [...container.querySelectorAll('track')];
    expect(
      tracks.map((t) => [
        t.getAttribute('src'),
        t.getAttribute('srclang'),
        t.getAttribute('label'),
        t.getAttribute('kind'),
        t.hasAttribute('default'),
      ]),
    ).toEqual([
      ['en.vtt', 'en', 'English', 'subtitles', true],
      ['fr.vtt', 'fr', 'French', 'subtitles', false],
    ]);
  });

  it('a plain src (no captions, no languages) shows no CC button and no language menu', () => {
    const ref = createRef<HTMLVideoElement>();
    render(
      <VideoPlayer
        {...MIN_PROPS}
        videoRef={ref}
        actions={{ onCaptionsToggle: vi.fn(), onLanguageChange: vi.fn() }}
      />,
    );
    expect(screen.queryByRole('button', { name: /captions/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /language/i })).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm vitest run src/lib/video-providers/__tests__/playback-captions.test.ts src/lib/video-providers/__tests__/playback-to-state.test.ts src/components/video-player/__tests__/video-player.test.tsx
```

Expected: FAIL. Either the module is not found (`playback-captions`) or
`captions` is undefined, or there are no `<track>` elements.

- [ ] **Step 3: Implement**

`src/lib/video-providers/playback-captions.ts`:

```ts
import type { VideoCaption } from '#/components/video-player/types';
import { labelForLang, type VideoLang } from '#/lib/video-languages';

/** A provider's single caption file as the player's caption list, labelled
 * with the language actually playing (captions are in the video's language). */
export function captionsForPlayback(
  captions: { vtt: string } | null,
  lang: VideoLang,
): VideoCaption[] {
  return captions
    ? [{ src: captions.vtt, lang, label: labelForLang(lang) }]
    : [];
}
```

In `types.ts`:
- add `VideoCaption` (with a doc comment saying the player builds
  `kind="subtitles"` tracks and CC turns on the first);
- in `VideoPlayerProps`, replace
  `tracks?: React.ComponentPropsWithoutRef<'track'>[];` with
  `captions?: VideoCaption[];`.

In `video-player.tsx`:
- destructure `captions` instead of `tracks`;
- set `hasCaptions = (captions?.length ?? 0) > 0`;
- replace the track map with:

```tsx
          {captions?.map((c, i) => (
            <track
              key={`${c.src}-${c.lang}`}
              kind="subtitles"
              src={c.src}
              srcLang={c.lang}
              label={c.label}
              default={i === 0}
            />
          ))}
```

In `video-player-container.tsx`:
- the caption-mode effect's dependency `rest.tracks` becomes
  `rest.captions`;
- nothing else references `tracks`.

In `lesson-main/types.ts`:
- delete `TrackProps` and its import if now unused;
- ready branch: `captions: VideoCaption[];` with the doc comment
  "Caption files for this video, in the played language; empty when the
  provider has none."

In `playback-to-state.ts`, replace the `tracks` construction with
`captions: captionsForPlayback(result.captions, lang)`. Keep
`captionsUnavailable: result.captions === null`.

In `lesson-player-container.tsx`: `tracks={videoState.tracks}` becomes
`captions={videoState.captions}`.

In `video-player.stories.tsx`:
- replace any `tracks` arg with `captions`;
- add a story `PlainFile` with `args: { src: SAMPLE_SRC, videoRef: createRef<HTMLVideoElement>(), state: { status: 'ready' }, actions: noopActions }`
  and no captions or languages.

Then run `grep -rn "tracks" src/components/video-player src/components/lesson-main src/lib/video-providers`
and fix any remaining reference. `textTracks` (the DOM API) stays.

- [ ] **Step 4: Run tests and type check**

Run:

```bash
pnpm vitest run src/lib/video-providers src/components/video-player src/components/lesson-main && pnpm tsc --noEmit
```

Expected: PASS, and tsc clean.

- [ ] **Step 5: Commit**

```bash
pnpm biome check --write src/components/video-player src/components/lesson-main src/lib/video-providers
git add src/components/video-player src/components/lesson-main src/lib/video-providers
git commit -m "refactor(video-player): typed captions prop replaces raw track props"
```

---

### Task 2: Failure handling: `onPlaybackFailed` and a caption file that won't load

**Files:**
- Create: `src/components/video-player/media-failure.ts`
- Modify:
  - `src/components/video-player/types.ts`
  - `src/components/video-player/video-player.tsx`
  - `src/components/video-player/video-player-container.tsx`
- Test:
  - `src/components/video-player/__tests__/media-failure.test.ts`
  - `src/components/video-player/__tests__/video-player.test.tsx`

**Interfaces:**
- Consumes: `computeRecoveryDecision(attemptsSoFar)` from
  `./compute-recovery-action`.
- Produces:
  - `VideoPlayerActions.onCaptionsError?: () => void`.
  - The container prop `onPlaybackFailed?: (message: string) => void`.
  - In `media-failure.ts`:
    - `fatalMediaOutcome(attemptsSoFar: number): { patch: { status: 'error'; error: string }; retry: { attempt: number } | null; failedMessage: string | null }`
    - `captionLoadFailedPatch(): { hasCaptions: false; captionsEnabled: false; captionsUnavailable: true }`

- [ ] **Step 1: Write the failing tests**

`src/components/video-player/__tests__/media-failure.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MAX_RECOVERY_ATTEMPTS } from '#/components/video-player/compute-recovery-action';
import {
  captionLoadFailedPatch,
  fatalMediaOutcome,
} from '#/components/video-player/media-failure';

describe('fatalMediaOutcome', () => {
  it('retries while the budget lasts and reports no failure yet', () => {
    const out = fatalMediaOutcome(0);
    expect(out.retry).toEqual({ attempt: 1 });
    expect(out.failedMessage).toBeNull();
    expect(out.patch.status).toBe('error');
  });

  it('reports the failure exactly when the budget is spent', () => {
    const out = fatalMediaOutcome(MAX_RECOVERY_ATTEMPTS);
    expect(out.retry).toBeNull();
    expect(out.failedMessage).toBe(out.patch.error);
    expect(out.failedMessage).toMatch(/couldn't be played/i);
  });
});

describe('captionLoadFailedPatch', () => {
  it('turns captions off and marks them unavailable, so CC states why', () => {
    expect(captionLoadFailedPatch()).toEqual({
      hasCaptions: false,
      captionsEnabled: false,
      captionsUnavailable: true,
    });
  });
});
```

Add to `video-player.test.tsx`:

```ts
  it('reports a caption file that fails to load', () => {
    const ref = createRef<HTMLVideoElement>();
    const onCaptionsError = vi.fn();
    const { container } = render(
      <VideoPlayer
        {...MIN_PROPS}
        videoRef={ref}
        captions={[{ src: 'expired.vtt', lang: 'en', label: 'English' }]}
        actions={{ onCaptionsError }}
      />,
    );
    container.querySelector('track')?.dispatchEvent(new Event('error'));
    expect(onCaptionsError).toHaveBeenCalledTimes(1);
  });
```

(If React's synthetic `onError` does not fire for a native `dispatchEvent` on
`<track>` in jsdom, use `fireEvent.error(track)` from
`@testing-library/react`.)

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm vitest run src/components/video-player/__tests__/media-failure.test.ts src/components/video-player/__tests__/video-player.test.tsx
```

Expected: FAIL. `media-failure` is not found, and `onCaptionsError` is
never called.

- [ ] **Step 3: Implement**

`src/components/video-player/media-failure.ts`:

```ts
import { computeRecoveryDecision } from './compute-recovery-action';

/**
 * What the container does on a fatal media error (an expired or refused
 * signed URL): always show the error overlay; while the recovery budget
 * lasts, ask the caller for a fresh source; once it is spent, tell the
 * caller playback has failed for good (admin uses this to flag a dead key).
 */
export function fatalMediaOutcome(attemptsSoFar: number) {
  const decision = computeRecoveryDecision(attemptsSoFar);
  return {
    patch: { status: 'error' as const, error: decision.message },
    retry: decision.kind === 'retry' ? { attempt: decision.attempt } : null,
    failedMessage: decision.kind === 'terminal' ? decision.message : null,
  };
}

/** A caption file that failed to load (e.g. its signed URL expired) is
 * disclosed as unavailable rather than left as a CC toggle for a blank track. */
export function captionLoadFailedPatch() {
  return {
    hasCaptions: false as const,
    captionsEnabled: false as const,
    captionsUnavailable: true as const,
  };
}
```

`types.ts`: add `onCaptionsError?: () => void;` to `VideoPlayerActions`.

`video-player.tsx`: on the `<track>`, add `onError={a.onCaptionsError}`.

`video-player-container.tsx`:
- Add the prop `onPlaybackFailed?: (message: string) => void`. Document it:
  "fires once when automatic recovery is exhausted; the player still shows
  its own error overlay".
- Hold it in a ref, the same way as `onSourceExpiredRef`.
- Replace the body of the `attachMedia` error callback with:

```ts
      if (!fatal) return;
      const out = fatalMediaOutcome(recoveryAttemptsRef.current);
      setState((prev) => ({ ...prev, ...out.patch }));
      if (out.retry) {
        recoveryAttemptsRef.current = out.retry.attempt;
        pendingRestoreTimeRef.current = video.currentTime;
        onSourceExpiredRef.current?.();
      } else if (out.failedMessage !== null) {
        onPlaybackFailedRef.current?.(out.failedMessage);
      }
```

- Remove the now-unused `computeRecoveryDecision` import.
- Add to the `actions` object passed to `VideoPlayer`:
  `onCaptionsError: () => setState((prev) => ({ ...prev, ...captionLoadFailedPatch() }))`.
- Make sure the `captionsUnavailable` prop effect does not overwrite that
  patch when `captionsUnavailable` is `false`. Change the effect to only
  write when the prop is `true`, or reset on `captions` change. Rule: a new
  `captions` array (new `src`) resets `captionsUnavailable` to the prop
  value; a load error sets it `true` until the next `captions` change.
  Implement that with the effect depending on
  `[captionsUnavailable, rest.captions, setState]`.
- Add a header JSDoc on `VideoPlayerContainer`:

```ts
/**
 * The app's one video player: drop it on any page with a `src`. Optional
 * captions, a video-language menu, and callbacks for an expiring signed URL
 * (`onSourceExpired`) and for recovery giving up (`onPlaybackFailed`).
 *
 * It never records progress. Lesson progress, the debrief overlay and the
 * coverage notice belong to `LessonPlayerContainer`, which wraps this —
 * admin previews use this directly so an admin's viewing writes nothing.
 */
```

- [ ] **Step 4: Run tests and type check**

Run:

```bash
pnpm vitest run src/components/video-player && pnpm tsc --noEmit
```

Expected: PASS, and tsc clean.

- [ ] **Step 5: Commit**

```bash
pnpm biome check --write src/components/video-player
git add src/components/video-player
git commit -m "feat(video-player): onPlaybackFailed and disclose captions that fail to load"
```

---

### Task 3: Admin playback route resolves `?lang=`

**Files:**
- Modify:
  - `src/db/admin.ts` (`resolveLessonPlayback`)
  - `src/routes/api/admin/lessons.$lessonId.video-playback.ts`
- Test: `src/routes/api/admin/__tests__/lesson-video-playback.test.ts`

**Interfaces:**
- Consumes:
  - `selectVideoForLang` from `#/lib/video-providers/select-video-for-lang`;
  - `OtherVideoIdsSchema` from `#/types`;
  - `isVideoLang` and `PRIMARY_VIDEO_LANG` from `#/lib/video-languages`.
- Produces:
  - `resolveLessonPlayback(lessonId: number, courseId: number, lang: VideoLang): Promise<(PlaybackResult & { lang: VideoLang; languages: VideoLang[] }) | null>`
  - The route body matches `learnerPlaybackSchema` from
    `#/lib/admin-schemas`.

- [ ] **Step 1: Write the failing tests**

In `lesson-video-playback.test.ts`:
- Update the `resolveLessonPlayback` mock type to
  `vi.fn<() => Promise<(PlaybackResult & { lang: VideoLang; languages: VideoLang[] }) | null>>()`.
- Update every `mockResolvedValue({...})` fixture to add
  `lang: 'en', languages: ['en']`.
- Update `toHaveBeenCalledWith(1, 99)` to `toHaveBeenCalledWith(1, 99, 'en')`.
- Change the test that parses with `lessonPlaybackSchema` to parse with
  `learnerPlaybackSchema`.
- Add:

```ts
  it('passes a requested language through to the resolver', async () => {
    resolveLessonPlayback.mockResolvedValue({
      status: 'rendering',
      lang: 'fr',
      languages: ['en', 'fr'],
    });
    const res = await getVideoPlaybackHandler(
      new Request(
        'http://test/api/admin/lessons/1/video-playback?courseId=42&lang=fr',
      ),
      '1',
    );
    expect(resolveLessonPlayback).toHaveBeenCalledWith(1, 42, 'fr');
    expect(learnerPlaybackSchema.parse(await res.json())).toMatchObject({
      lang: 'fr',
      languages: ['en', 'fr'],
    });
  });

  it.each(['xx', '', 'EN'])(
    'treats an unknown lang (%j) as the primary language, never an error',
    async (lang) => {
      resolveLessonPlayback.mockResolvedValue({
        status: 'rendering',
        lang: 'en',
        languages: ['en'],
      });
      const res = await getVideoPlaybackHandler(
        new Request(
          `http://test/api/admin/lessons/1/video-playback?courseId=42&lang=${lang}`,
        ),
        '1',
      );
      expect(res.status).toBe(200);
      expect(resolveLessonPlayback).toHaveBeenCalledWith(1, 42, 'en');
    },
  );
```

(Import `learnerPlaybackSchema` and `type VideoLang`. Before relying on it,
check whether `isVideoLang('EN')` is false. If it is true, drop `'EN'` from
the list.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/routes/api/admin/__tests__/lesson-video-playback.test.ts`
Expected: FAIL. The resolver is called with 2 arguments, not 3.

- [ ] **Step 3: Implement**

In the route, after the `courseId` parse:

```ts
  // Same rule as the learner route: an unknown or unattached language is
  // never a refusal — the resolver falls back to the primary video and says
  // which language it played.
  const rawLang = new URL(request.url).searchParams.get('lang');
  const lang = isVideoLang(rawLang) ? rawLang : PRIMARY_VIDEO_LANG;
```

Then call `resolveLessonPlayback(lessonId, courseId, lang)`.

In `src/db/admin.ts` `resolveLessonPlayback`:
- add a `lang: VideoLang` parameter;
- select `otherVideoIds: lessonsTable.otherVideoIds` too;
- after the null check, mirror `resolveLessonPlaybackUncached` in
  `src/db/lesson-playback.ts:75-108`:

```ts
  // A column that fails the schema offers no alternates rather than taking
  // the primary video down (same rule as the learner resolver).
  const alternates = OtherVideoIdsSchema.safeParse(lesson.otherVideoIds);
  const selection = selectVideoForLang({
    primary: { provider: lesson.videoProvider as ProviderId, ref: lesson.videoRef },
    alternates: alternates.success ? alternates.data : [],
    requested: lang,
  });
  const creds = await resolveCourseProvider(courseId, selection.provider);
  if (!creds) {
    throw new PlaybackError(
      'PROVIDER_NOT_CONFIGURED',
      `This course has no ${selection.provider} credentials configured.`,
    );
  }
  const playback = await resolvePlayback(selection.provider, selection.ref, creds);
  return { ...playback, lang: selection.lang, languages: selection.languages };
```

The credentials are now looked up for the **selected** video's provider,
since an alternate may use a different provider. Update the return type.
Update the stale comment in `admin-schemas.ts` above
`learnerPlaybackSchema` ("The admin preview route keeps
`lessonPlaybackSchema`") to say both routes now return it.

- [ ] **Step 4: Run tests and type check**

Run:

```bash
pnpm vitest run src/routes/api/admin src/db && pnpm tsc --noEmit
```

Expected: the route tests PASS. tsc may now fail in
`use-lesson-video-playback.ts` and its consumers. That's fixed in Task 4, so
it's acceptable **only** if every tsc error is in a Task 4 file. If tsc
fails anywhere else, fix it here.

- [ ] **Step 5: Commit**

```bash
pnpm biome check --write src/db/admin.ts "src/routes/api/admin/lessons.\$lessonId.video-playback.ts" src/routes/api/admin/__tests__/lesson-video-playback.test.ts src/lib/admin-schemas.ts
git add src/db/admin.ts "src/routes/api/admin/lessons.\$lessonId.video-playback.ts" src/routes/api/admin/__tests__/lesson-video-playback.test.ts src/lib/admin-schemas.ts
git commit -m "feat(admin): video-playback route previews a requested language"
```

---

### Task 4: Admin data hook carries the language

**Files:**
- Modify:
  - `src/data-hooks/keys.ts`
  - `src/data-hooks/use-lesson-video-playback.ts`
  - `src/components/admin/lesson-config/compute-video-preview-state.ts`
  - `src/components/admin/compute-video-modal-state.ts`
- Test:
  - `src/data-hooks/__tests__/use-lesson-video-playback-fetch.test.tsx`
  - `src/components/admin/lesson-config/__tests__/compute-video-preview-state.test.ts`
  - `src/components/admin/__tests__/compute-video-modal-state.test.ts`

**Interfaces:**
- Consumes: the Task 3 route (`?lang=` and a `learnerPlaybackSchema` body).
- Produces:
  - `LessonInCourse = { lessonId: number; courseId: number; lang?: VideoLang }`
    (omitted means `'en'`).
  - `dataKeys.lessonPlayback(lessonId, courseId, lang = PRIMARY_VIDEO_LANG)`
    returns `[...lessonPlaybacks(lessonId), courseId, lang]`.
    `lessonPlaybacks(lessonId)` stays the invalidation prefix.
  - `useLessonVideoPlayback` returns `LearnerPlayback | null` data.
  - `computeVideoPreviewState(playback: LearnerPlayback | null | undefined)`.
    Its ready branch carries `Extract<LearnerPlayback, { status: 'ready' }>`.

- [ ] **Step 1: Write the failing tests**

In `use-lesson-video-playback-fetch.test.tsx`:
- In the first test, change the mocked body to
  `{ status: 'rendering', lang: 'en', languages: ['en'] }`.
- In the same test, change the expected URL to
  `'/api/admin/lessons/10/video-playback?courseId=7&lang=en'`.
- Change the cached value expectation to the same body.
- Add:

```ts
  it('asks for the previewed language and caches each language separately', async () => {
    const body = { status: 'rendering', lang: 'fr', languages: ['en', 'fr'] };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body }),
    );
    const { client, wrapper } = harness();

    const { result } = renderHook(
      () => useLessonVideoPlayback({ lessonId: 10, courseId: 7, lang: 'fr' }, true),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/admin/lessons/10/video-playback?courseId=7&lang=fr',
    );
    // A signed-URL refetch re-reads THIS entry, so the preview stays French;
    // the English entry is a different video and must not be reused for it.
    expect(client.getQueryData(dataKeys.lessonPlayback(10, 7, 'fr'))).toEqual(body);
    expect(client.getQueryData(dataKeys.lessonPlayback(10, 7, 'en'))).toBeUndefined();
  });
```

In `compute-video-preview-state.test.ts`:
- parse fixtures with `learnerPlaybackSchema`;
- add `lang: 'en', languages: ['en']` to every body.

Make the same fixture change in `compute-video-modal-state.test.ts`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/data-hooks src/components/admin`
Expected: FAIL. The URL lacks `&lang=`, or the key has no lang.

- [ ] **Step 3: Implement**

`keys.ts`:

```ts
  lessonPlayback: (
    lessonId: number,
    courseId: number,
    lang: VideoLang = PRIMARY_VIDEO_LANG,
  ) => [...dataKeys.lessonPlaybacks(lessonId), courseId, lang] as const,
```

`use-lesson-video-playback.ts`:
- `LessonInCourse` gains `lang?: VideoLang`;
- key `dataKeys.lessonPlayback(target?.lessonId ?? 0, target?.courseId ?? 0, target?.lang)`;
- fetch `` `/api/admin/lessons/${target.lessonId}/video-playback?courseId=${target.courseId}&lang=${target.lang ?? PRIMARY_VIDEO_LANG}` ``;
- parse with `learnerPlaybackSchema`.

Retype `computeVideoPreviewState` and `computeVideoModalState` from
`LessonPlayback` to `LearnerPlayback`. Fix any remaining tsc errors in
consumers. `video-preview.tsx` is fully rewritten in Task 5, so give its
`playback` prop the `LearnerPlayback` type now.

- [ ] **Step 4: Run tests and type check**

Run:

```bash
pnpm vitest run src/data-hooks src/components/admin src/routes/api/admin && pnpm tsc --noEmit
```

Expected: PASS, and tsc clean.

- [ ] **Step 5: Commit**

```bash
pnpm biome check --write <each file changed in this task>
git add <each file changed in this task>
git commit -m "feat(admin): playback hook keys and fetches by preview language"
```

---

### Task 5: Admin previews use the shared player

**Files:**
- Modify:
  - `src/atoms/admin.ts`
  - `src/components/admin/lesson-config/video-preview.tsx`
  - `src/components/admin/lesson-config/video-section-container.tsx`
  - `src/components/admin/lesson-video-modal-container.tsx`
- Test:
  - `src/components/admin/lesson-config/__tests__/video-preview.test.tsx`
    (create)
  - `src/components/admin/lesson-config/__tests__/video-section-container.test.tsx`
  - `src/components/admin/__tests__/admin-preview-records-no-progress.test.ts`
    (create)

**Interfaces:**
- Consumes:
  - `VideoPlayerContainer` and `VideoCaption` (Tasks 1 and 2);
  - `captionsForPlayback` (Task 1);
  - `useLessonVideoPlayback({ lessonId, courseId, lang })` (Task 4);
  - `badgeForLang` and `labelForLang` from `#/lib/video-languages`.
- Produces:
  - `adminPreviewLangAtomFamily: (lessonId: number) => PrimitiveAtom<VideoLang>`,
    defaulting to `PRIMARY_VIDEO_LANG`. Built with `atomFamily` from
    `jotai-family`, as `courseStaffDialogOpenAtomFamily` in the same file
    is.
  - `VideoPreview` props:

```ts
interface VideoPreviewProps {
  playback: LearnerPlayback | null;
  /** Previewed language changed; caller re-queries playback for it. */
  onLanguageChange?: (code: string) => void;
  /** Signed URL refused mid-play; caller refetches playback. */
  onSourceExpired?: () => void;
  /** Recovery exhausted — for Mux this means the stored key is dead. */
  onPlaybackFailed?: (message: string) => void;
}
```

`onForbidden` is removed.

- [ ] **Step 1: Write the failing tests**

`video-preview.test.tsx` (jsdom). Stub the player so the test reads exactly
what it was given:

```tsx
// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const player = vi.hoisted(() => vi.fn((_p: Record<string, unknown>) => null));
vi.mock('#/components/video-player', () => ({ VideoPlayerContainer: player }));

import { learnerPlaybackSchema } from '#/lib/admin-schemas';
import { VideoPreview } from '../video-preview';

const ready = learnerPlaybackSchema.parse({
  status: 'ready',
  url: 'https://stream.mux.com/abc.m3u8?token=t',
  kind: 'hls',
  expiresInSeconds: 3600,
  poster: null,
  captions: { vtt: 'https://cdn/fr.vtt' },
  lang: 'fr',
  languages: ['en', 'fr'],
});

describe('VideoPreview', () => {
  it('hands the shared player the source, captions and language menu', () => {
    const onLanguageChange = vi.fn();
    const onSourceExpired = vi.fn();
    const onPlaybackFailed = vi.fn();
    render(
      <VideoPreview
        playback={ready}
        onLanguageChange={onLanguageChange}
        onSourceExpired={onSourceExpired}
        onPlaybackFailed={onPlaybackFailed}
      />,
    );
    const props = player.mock.calls.at(-1)?.[0];
    expect(props).toMatchObject({
      src: 'https://stream.mux.com/abc.m3u8?token=t',
      kind: 'hls',
      captions: [{ src: 'https://cdn/fr.vtt', lang: 'fr' }],
      captionsUnavailable: false,
      activeLanguage: 'fr',
      onLanguageChange,
      onSourceExpired,
      onPlaybackFailed,
    });
    expect(
      (props?.languages as { code: string }[]).map((l) => l.code),
    ).toEqual(['en', 'fr']);
  });

  it('discloses a video with no captions instead of hiding CC', () => {
    render(<VideoPreview playback={{ ...ready, captions: null }} />);
    expect(player.mock.calls.at(-1)?.[0]).toMatchObject({
      captions: [],
      captionsUnavailable: true,
    });
  });

  it('shows the placeholder, not a player, when nothing is ready', () => {
    player.mockClear();
    const { container } = render(<VideoPreview playback={null} />);
    expect(player).not.toHaveBeenCalled();
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
```

In `video-section-container.test.tsx`:
- Change its `../video-preview` stub to capture props:

```tsx
const preview = vi.hoisted(() => vi.fn((_p: Record<string, unknown>) => <div data-testid="video-preview" />));
vi.mock('../video-preview', () => ({ VideoPreview: preview }));
```

- Add a test: picking a language re-queries playback for it, and the
  learner's own language preference is untouched. Render the section with a
  ready playback, then
  `act(() => preview.mock.calls.at(-1)[0].onLanguageChange('fr'))`. Assert
  that the last `hooks.playback` call's first argument is
  `{ lessonId: <fixture id>, courseId: <fixture course>, lang: 'fr' }`.
- Add a test: when recovery gives up, the section shows the dead-key notice.
  Call `preview.mock.calls.at(-1)[0].onPlaybackFailed('x')` inside `act`,
  then assert the existing "stored key is no longer valid" text is on
  screen. Find the exact copy in the container.

Follow this file's existing render setup (QueryClientProvider, hook stubs).
If it renders without a jotai `Provider`, atoms use the default store: add
`afterEach` resetting `adminPreviewLangAtomFamily` the way the file already
resets other atoms, or wrap the render in a fresh `<Provider>`.

`admin-preview-records-no-progress.test.ts` (node). It's a static guard,
because the admin modules can't be rendered with the real player:

```ts
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ADMIN_PLAYER_FILES = [
  'src/components/admin/lesson-config/video-preview.tsx',
  'src/components/admin/lesson-config/video-section-container.tsx',
  'src/components/admin/lesson-video-modal-container.tsx',
];

describe('admin video previews', () => {
  it.each(ADMIN_PLAYER_FILES)(
    '%s never wires lesson progress (an admin watching must write no videos_progress)',
    (file) => {
      const src = readFileSync(file, 'utf8');
      expect(src).not.toMatch(/use-milestone-reporter|useMilestoneReporter/);
      expect(src).not.toMatch(/LessonPlayerContainer|lesson-player-container/);
      expect(src).not.toMatch(/videoLanguageAtom|atoms\/video-language/);
    },
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/components/admin`
Expected: FAIL. `VideoPreview` still renders `<video controls>` and the
player stub is never called; there's no `onLanguageChange`. The static
guard passes already: that's fine, it is a regression guard.

- [ ] **Step 3: Implement**

`src/atoms/admin.ts`:

```ts
/**
 * The language an admin is previewing a lesson's video in. Per lesson, page
 * lifetime only — and deliberately NOT `videoLanguageAtom`: previewing the
 * French cut must not switch the admin's own learner videos to French.
 */
export const adminPreviewLangAtomFamily = atomFamily((_lessonId: number) =>
  atom<VideoLang>(PRIMARY_VIDEO_LANG),
);
```

`atomFamily` comes from `jotai-family`, already imported at the top of
`src/atoms/admin.ts`.

`video-preview.tsx`: rewrite as presentational.
- Keep the placeholder branch as it is.
- Delete the `<video>`, `attachMedia`, `useRef`/`useEffect` and the biome
  ignore.
- The ready branch:

```tsx
  const lang = playback.lang;
  return (
    <VideoPlayerContainer
      src={playback.url}
      kind={playback.kind}
      poster={playback.poster ?? undefined}
      captions={captionsForPlayback(playback.captions, lang)}
      captionsUnavailable={playback.captions === null}
      languages={playback.languages.map((code) => ({
        code,
        badge: badgeForLang(code),
        label: labelForLang(code),
      }))}
      activeLanguage={lang}
      onLanguageChange={onLanguageChange}
      onSourceExpired={onSourceExpired}
      onPlaybackFailed={onPlaybackFailed}
    />
  );
```

Do **not** put a `key` on the player inside `VideoPreview`:
- keying on the URL would remount on every token refresh, and on a
  language switch, which throws away the restore point that resumes at
  the same spot;
- the per-**lesson** remount belongs to the callers. The section renders
  `<VideoPreview key={lesson.id} …/>` and the modal renders
  `<VideoPreview key={play.lessonId} …/>`.

This is the same reason `LessonPlayerContainer` keys on `lessonSlug`: the
recovery budget and pending restore must not leak across lessons.
- Update the header comment: it is now a presentational wrapper choosing
  placeholder vs shared player.

`video-section-container.tsx`:

```ts
  const [previewLang, setPreviewLang] = useAtom(
    adminPreviewLangAtomFamily(lesson.id),
  );
  const playback = useLessonVideoPlayback(
    courseId === null ? null : { lessonId: lesson.id, courseId, lang: previewLang },
    playbackEnabled,
  );
```

and on `<VideoPreview>`:

```tsx
          <VideoPreview
            key={lesson.id}
            playback={thumbnailPlayback}
            onLanguageChange={(code) => {
              if (isVideoLang(code)) setPreviewLang(code);
            }}
            onSourceExpired={() => void playback.refetch()}
            onPlaybackFailed={() => setPlaybackForbidden(true)}
          />
```

Update the comment above `keyRejection` to say Mux's refusal now arrives
via `onPlaybackFailed` after the player's retries.

`lesson-video-modal-container.tsx`:
- Read `adminPreviewLangAtomFamily(play.lessonId)`. When `play` is null,
  use a stable fallback; for example, read the family with `play?.lessonId ?? 0`.
- Pass `{ ...play, lang }` to `useLessonVideoPlayback`.
- Wire `onLanguageChange`, `onSourceExpired` (refetch) and
  `onPlaybackFailed`. The modal has no dead-key notice today, so on failure
  let the player's own error overlay show. Pass nothing, or a no-op, for
  `onPlaybackFailed`.
- Replace the stale comment block above `LessonVideoModalContainer`
  ("Reuses `VideoPreview`… the learner container runs
  `useMilestoneReporter`…") with:

```
 * Plays through the shared `VideoPlayerContainer` (via `VideoPreview`), never
 * `LessonPlayerContainer`: only the latter records `videos_progress`, so an
 * admin previewing from the board writes nothing against their own account.
```

- [ ] **Step 4: Run tests and type check**

Run:

```bash
pnpm vitest run src/components/admin src/data-hooks && pnpm tsc --noEmit
```

Expected: PASS, and tsc clean.

- [ ] **Step 5: Commit**

```bash
pnpm biome check --write src/atoms/admin.ts src/components/admin/lesson-config/video-preview.tsx src/components/admin/lesson-config/video-section-container.tsx src/components/admin/lesson-video-modal-container.tsx src/components/admin/lesson-config/__tests__/video-preview.test.tsx src/components/admin/lesson-config/__tests__/video-section-container.test.tsx src/components/admin/__tests__/admin-preview-records-no-progress.test.ts
git add <same files>
git commit -m "feat(admin): lesson video previews use the shared player with captions and languages"
```

---

### Task 6: Narrow-width control bar

The admin config column is half width, and the bar's fixed-width volume
slider plus menus overflow around 320px.

**Files:**
- Modify: `src/styles.css` (the `.video-player` block, around line 578,
  and `.vp-controls-row`, around line 672)
- Modify: `src/components/video-player/parts/volume-control.tsx`. Give the
  `Slider.Root` the class `vp-volume-slider`, keeping its inline
  `inlineSize: 80`.
- Modify: `src/components/video-player/parts/time-display.tsx`, only if a
  wrapper class is needed (it already has `vp-time`).
- Test: `src/components/video-player/__tests__/video-player.test.tsx`

**Interfaces:** none new.

- [ ] **Step 1: Write the failing test**

```ts
  it('marks the volume slider so narrow players can drop it (mute stays)', () => {
    const ref = createRef<HTMLVideoElement>();
    const { container } = render(
      <VideoPlayer
        {...MIN_PROPS}
        videoRef={ref}
        actions={{ onVolumeChange: vi.fn(), onMuteToggle: vi.fn() }}
      />,
    );
    expect(container.querySelector('.vp-volume-slider')).toBeTruthy();
    expect(screen.getByRole('button', { name: /mute/i })).toBeTruthy();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/components/video-player/__tests__/video-player.test.tsx`
Expected: FAIL. There's no `.vp-volume-slider`.

- [ ] **Step 3: Implement**

Add `className="vp-volume-slider"` to the volume `Slider.Root`. In
`styles.css`:
- add `container-type: inline-size; container-name: vp;` to the
  `.video-player` rule;
- after `.vp-controls-row`, add:

```css
  /* Half-width admin columns and phones: drop the volume slider (mute stays)
     and the elapsed/total readout before the row can overflow. */
  @container vp (max-width: 420px) {
    .video-player .vp-volume-slider,
    .video-player .vp-time {
      display: none;
    }
    .video-player .vp-controls-row {
      gap: calc(var(--spacing) * 1);
    }
  }
```

Check that `.video-player` gaining `container-type` doesn't break the
fullscreen layout. `inline-size` containment only affects intrinsic inline
size, and the player is already `inline-size: 100%`.

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm vitest run src/components/video-player && pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm biome check --write src/components/video-player/parts/volume-control.tsx src/components/video-player/__tests__/video-player.test.tsx
git add src/styles.css src/components/video-player/parts/volume-control.tsx src/components/video-player/__tests__/video-player.test.tsx
git commit -m "fix(video-player): control bar fits narrow admin columns"
```

---

### Task 7: Full verification

- [ ] **Step 1:** Run `pnpm vitest run`. Expected: every file passes.
  Compare the count with main's: 459 files.
- [ ] **Step 2:** Run `pnpm tsc --noEmit`. Expected: clean.
- [ ] **Step 3:** Run `pnpm build`. Expected: exit 0.
- [ ] **Step 4:** Run `grep -rn "<video" src --include=*.tsx`. Expected:
  only `video-player.tsx` and `video-call/video-call-stage.tsx` (the Tavus
  WebRTC streams are out of scope).
- [ ] **Step 5:** Hand the browser walkthrough to the user, on port 5001:
  - **Learner lesson:** play; toggle CC on a Synthesia lesson; switch
    language mid-play and confirm it resumes at the same spot; check the
    debrief overlay.
  - **Admin lesson config:** preview in each language; CC; resize to a
    narrow column.
  - **Admin board modal:** open, play, switch language.
