# Video Player — Design

**Date:** 2026-04-27
**Scope:** A presentational `VideoPlayer` with custom controls (play/pause, scrubber, time, volume/mute, captions, playback rate, fullscreen), driven by a `VideoPlayerContainer` that owns state in jotai atoms and syncs the native `<video>` element via a forwarded ref. Fully white-label (every color, radius, spacing, easing references a CSS var), fully accessible (WCAG AA, complete keyboard map, reduced-motion aware), and keyed off Synthesia-hosted MP4s with VTT captions already produced by `getVideoDetails`.

## Goals

- Render a course lesson video with a custom-styled control bar over a native `<video>` element.
- Keep `video-player.tsx` strictly presentational — no internal state, no hooks, no data fetching, no logic. Only `videoRef` and `rootRef` for DOM wiring.
- Keep the consumer's required surface tiny: `src` and `videoRef` are the only required props. Everything else has sensible defaults applied inside the component.
- Be fully accessible: real `<button>`s, ARIA labels and `aria-pressed`, complete keyboard map, focus rings via `--color-accent-9`, screen-reader live region for major state changes.
- Be fully white-label: no hardcoded hex/Tailwind palette classes; every visual token resolves through `--color-accent-*`, `--color-gray-*`, `--font-*` variables already shipped by `scripts/generate-theme-css.ts`.
- Use logical properties (`ms-*`/`me-*`/`ps-*`/`pe-*`/`start-*`/`end-*`/`inline-size`/`block-size`) per project CLAUDE.md.
- Reach for Base UI `Slider` and `Menu` before writing custom equivalents.

## Non-goals

- Picture-in-picture, quality selector, skip ±10s buttons, chapters/cue points (deferred — "B + later" decision).
- HLS / DASH / adaptive streaming. Synthesia serves plain MP4.
- Server-rendered first frame. Synthesia thumbnails are passed as `poster`.
- Analytics events, watch-progress persistence (the container exposes hooks but the existing course-progress atom integration is out of scope for this spec).
- Chromecast / AirPlay.

## Decisions (locked during brainstorm)

| # | Question | Decision |
| --- | --- | --- |
| 1 | Control set scope | **B (Standard)** — play/pause, scrubber + time, volume/mute, captions toggle, playback rate, fullscreen. |
| 2 | Prop API shape | **A (Fully controlled)** — runtime state lives in props; container owns atoms and syncs via `videoRef`. |
| 3 | Captions rendering | Native `<track>` elements; container toggles `textTrack.mode` via `videoRef.current.textTracks`. |
| 4 | Keyboard support | Full set: `Space`/`K`, `←`/`→`, `↑`/`↓`, `M`, `C`, `F`, `0`–`9`, `Home`, `End`. |
| 5 | Auto-hide controls | On while playing; off while paused/buffering/error/focus-inside; honors `prefers-reduced-motion`. |
| 6 | Loading + error | Spinner during `loading`/`buffering`; error overlay with retry button on `error`. |
| 7 | Poster + first-play overlay | Show poster + big centered play button until `hasPlayedOnce === true`. |
| 8 | Buffered ranges | YouTube-style lighter fill behind played fill. |
| 9 | Time display | `mm:ss` always; switches to `hh:mm:ss` when `duration >= 3600`. |
| 10 | Required props | Only `src` and `videoRef`. All other props optional with internal defaults; missing actions → corresponding control is hidden or disabled. |
| 11 | Native attribute pass-through | `VideoPlayerProps` extends `Omit<React.ComponentPropsWithoutRef<"video">, "controls" \| "muted" \| "onPlay" \| "onPause" \| "ref" \| "children">`, so `poster`, `preload`, `crossOrigin`, `autoPlay`, `loop`, `playsInline`, `className`, `style`, `aria-*`, `data-*` all flow through to `<video>`. |

## Architecture

### File layout

```
src/components/video-player/
├── video-player.tsx                 # presentational
├── video-player-container.tsx       # stateful (jotai + videoRef)
├── atoms.ts                         # video-player atoms (atomFamily by playerId)
├── hooks.ts                         # useVideoPlayer (wires native events → atoms)
├── format-time.ts                   # mm:ss / hh:mm:ss formatter
├── parts/
│   ├── play-pause-button.tsx
│   ├── scrubber.tsx
│   ├── time-display.tsx
│   ├── volume-control.tsx
│   ├── playback-rate-menu.tsx
│   ├── captions-button.tsx
│   ├── fullscreen-button.tsx
│   ├── big-play-button.tsx
│   ├── spinner.tsx
│   └── error-overlay.tsx
└── __tests__/
    ├── video-player.test.tsx
    ├── format-time.test.ts
    └── hooks.test.ts
```

Each part is its own kebab-case file, single responsibility, all presentational. `video-player.tsx` composes them.

### State ownership

| Concern | Lives in |
| --- | --- |
| `<video>` DOM element + custom controls UI | `video-player.tsx` |
| Internal state (paused, currentTime, duration, buffered, volume, muted, playbackRate, captionsEnabled, fullscreen, status, hasPlayedOnce, controlsVisible) | `video-player-container.tsx` via jotai atoms |
| Native event sync (`timeupdate`, `play`, `pause`, `volumechange`, `progress`, `ended`, `waiting`, `canplay`, `error`, `loadedmetadata`, `ratechange`) | container, attached via `videoRef` inside `useVideoPlayer` |
| Imperative actions (`play()`, `pause()`, `seek`, `setVolume`, `mute`, `requestFullscreen()`, `textTracks[i].mode`) | container, called from prop callbacks |
| Keyboard shortcut mapping | container; presentational only emits `onKeyboardShortcut(key)` |
| Auto-hide timer | container; jotai atom + `setTimeout` ref |

The presentational component is pure — every thing it knows comes through props, every thing it does is forwarded through callbacks. The only stateful escape hatch is the forwarded `videoRef`, which the container uses for imperative DOM calls (`play`, `pause`, seek, fullscreen, text-track mode). This complies with the project rule that "presentational components may use refs for direct DOM manipulation."

### Atoms (`atoms.ts`)

```ts
export const videoPlayerStateAtomFamily = atomFamily((id: string) =>
  atom<VideoPlayerState>({
    paused: true,
    currentTime: 0,
    duration: 0,
    bufferedEnd: 0,
    volume: 1,
    muted: false,
    playbackRate: 1,
    captionsEnabled: false,
    hasCaptions: false,
    fullscreen: false,
    status: "idle",
    hasPlayedOnce: false,
    controlsVisible: true,
  })
);
```

Each container instantiates with its own `playerId` so multiple players coexist on a page.

### Prop shape

```ts
type VideoPlayerState = {
  paused: boolean;
  currentTime: number;
  duration: number;
  bufferedEnd: number;
  volume: number;            // 0–1
  muted: boolean;
  playbackRate: number;
  captionsEnabled: boolean;
  hasCaptions: boolean;
  fullscreen: boolean;
  status: "idle" | "loading" | "ready" | "buffering" | "error";
  error?: string;
  hasPlayedOnce: boolean;
  controlsVisible: boolean;
};

type VideoPlayerActions = {
  onPlay?: () => void;
  onPause?: () => void;
  onSeek?: (time: number) => void;
  onSeekRelative?: (delta: number) => void;
  onVolumeChange?: (volume: number) => void;
  onMuteToggle?: () => void;
  onPlaybackRateChange?: (rate: number) => void;
  onCaptionsToggle?: () => void;
  onFullscreenToggle?: () => void;
  onRetry?: () => void;
  onPointerActivity?: () => void;
  onKeyboardShortcut?: (key: string) => void;
};

type VideoPlayerProps = Omit<
  React.ComponentPropsWithoutRef<"video">,
  "controls" | "muted" | "onPlay" | "onPause" | "ref" | "children"
> & {
  // Required
  src: string;
  videoRef: React.Ref<HTMLVideoElement>;

  // Optional
  rootRef?: React.Ref<HTMLDivElement>;
  tracks?: React.ComponentPropsWithoutRef<"track">[];
  state?: Partial<VideoPlayerState>;
  actions?: VideoPlayerActions;
  playbackRates?: number[];      // default [0.5, 0.75, 1, 1.25, 1.5, 2]
  labels?: Partial<Record<
    | "play" | "pause" | "mute" | "unmute"
    | "captionsOn" | "captionsOff"
    | "fullscreenEnter" | "fullscreenExit"
    | "volume" | "seek" | "playbackRate"
    | "retry" | "loading" | "buffering",
    string
  >>;
};
```

Defaults applied inside the component:

```ts
const {
  paused = true,
  currentTime = 0,
  duration = 0,
  bufferedEnd = 0,
  volume = 1,
  muted = false,
  playbackRate = 1,
  captionsEnabled = false,
  hasCaptions = (tracks?.length ?? 0) > 0,
  fullscreen = false,
  status = "idle",
  hasPlayedOnce = false,
  controlsVisible = true,
} = state ?? {};
```

Behavior when actions are missing:
- Missing `onCaptionsToggle` or empty `tracks` → captions button not rendered.
- Missing `onFullscreenToggle` → fullscreen button not rendered.
- Missing `onPlaybackRateChange` → rate menu not rendered.
- Missing `onPlay` / `onPause` → big-play overlay + play button still render but are `disabled`.
- Missing `onRetry` → retry button hidden in error overlay; error message still shown.

Default labels (English) are baked in but every entry is overridable via `labels`.

Minimum usage:
```tsx
<VideoPlayer src={url} videoRef={ref} />
```

Full usage:
```tsx
<VideoPlayer
  src={url}
  videoRef={ref}
  rootRef={rootRef}
  tracks={[{ src: vttUrl, srclang: "en", label: "English", kind: "subtitles", default: true }]}
  state={state}
  actions={actions}
  playbackRates={[0.75, 1, 1.5, 2]}
/>
```

## DOM tree

```
<div ref={rootRef} role="region" aria-label={labels.player} class="video-player"
     data-controls-visible data-status>
  <video ref={videoRef} src={src} {...nativeRest}>
    {tracks?.map(t => <track key={t.src} {...t} />)}
  </video>

  {/* click-to-toggle play layer (covers video, sits under controls).
      tabIndex={-1} so it does not duplicate the dedicated play/pause button in tab order. */}
  <button class="surface" type="button" tabIndex={-1}
          aria-label={paused ? labels.play : labels.pause} />

  {/* big centered play button — visible only when !hasPlayedOnce */}
  {!hasPlayedOnce && <BigPlayButton />}

  {/* loading / buffering spinner */}
  {(status === "loading" || status === "buffering") && <Spinner />}

  {/* error overlay */}
  {status === "error" && <ErrorOverlay message={error} onRetry={onRetry} />}

  {/* SR-only live region */}
  <span aria-live="polite" class="sr-only" />

  {/* controls bar */}
  <div class="controls">
    <PlayPauseButton />
    <Scrubber />          {/* full width on its own row */}
    <TimeDisplay />
    <VolumeControl />     {/* mute toggle + slider, expands on hover/focus */}
    <Spacer />
    <PlaybackRateMenu />  {/* Base UI Menu */}
    <CaptionsButton />
    <FullscreenButton />
  </div>
</div>
```

## Visual tokens

All colors, fonts, and shadows resolve through CSS variables already produced by `scripts/generate-theme-css.ts`.

| Element | Token |
| --- | --- |
| Player letterbox / poster bg | `var(--color-gray-12)` |
| Controls bar gradient | `linear-gradient(to top, var(--color-gray-a12), transparent)` |
| Control button hover bg | `var(--color-gray-a4)` |
| Control icons | `var(--color-gray-1)` (always light over dark gradient) |
| Scrubber track (unfilled) | `var(--color-gray-a7)` |
| Scrubber buffered fill | `var(--color-gray-a9)` |
| Scrubber played fill | `var(--color-accent-9)` |
| Scrubber thumb | `var(--color-accent-9)` |
| Big play button bg | `var(--color-accent-9)` |
| Big play button icon | `var(--color-accent-contrast)` |
| Spinner stroke | `var(--color-accent-9)` |
| Error overlay bg | `var(--color-gray-a11)` |
| Error text | `var(--color-gray-1)` |
| Focus ring | `outline: 2px solid var(--color-accent-9); outline-offset: 2px` |
| Captions cues | `::cue { background: var(--color-gray-a12); color: var(--color-gray-1); font-family: var(--font-sans); }` |

Sizing: `.video-player { position: relative; aspect-ratio: 16/9; inline-size: 100%; max-inline-size: 100%; background: var(--color-gray-12); }` — overlays use `inset: 0`. `<video>` uses `inline-size: 100%; block-size: 100%; object-fit: contain;`.

## Keyboard map

Handled by container, attached to `rootRef` via `onKeyDown`. Skip handling if `event.target` is the active Base UI `Slider` thumb (`[role="slider"]`), an `<input>`, or a `<textarea>` so Base UI's own keyboard handling isn't double-fired. Skip handling if a Base UI `Menu` is open (event.target inside `[role="menu"]`). Only `preventDefault()` when the key matches.

| Key | Action | Callback |
| --- | --- | --- |
| `Space` / `K` | Toggle play/pause | `onPlay` or `onPause` |
| `←` | Seek −5s | `onSeekRelative(-5)` |
| `→` | Seek +5s | `onSeekRelative(+5)` |
| `↑` | Volume +10% | `onVolumeChange(min(1, vol + 0.1))` |
| `↓` | Volume −10% | `onVolumeChange(max(0, vol - 0.1))` |
| `M` | Toggle mute | `onMuteToggle` |
| `C` | Toggle captions (only if `hasCaptions`) | `onCaptionsToggle` |
| `F` | Toggle fullscreen | `onFullscreenToggle` |
| `0`–`9` | Seek to 0–90% of duration | `onSeek(duration * n / 10)` |
| `Home` | Seek to 0 | `onSeek(0)` |
| `End` | Seek to duration | `onSeek(duration)` |

## Accessibility

- Root: `<div role="region" aria-label={labels.player ?? "Video player"}>`.
- All control buttons are real `<button type="button">` with explicit `aria-label`. Captions, mute, and fullscreen toggles use `aria-pressed={state}`. Play/pause swaps `aria-label` between `labels.play` and `labels.pause`.
- Scrubber: Base UI `Slider` with `aria-valuetext = "{currentTimeFormatted} of {durationFormatted}"`.
- Volume slider: Base UI `Slider` with `aria-valuetext = "{percent}%"` or `"Muted"`.
- Playback rate: Base UI `Menu` (correct roles for `menu` / `menuitemradio`).
- Spinner: `role="status"` + visually-hidden `labels.loading` / `labels.buffering`.
- Error overlay: `role="alert"`; retry button focusable.
- SR-only live region: `<span aria-live="polite" class="sr-only">` updated by container on play / pause / captions toggle / error so SR users get keyboard-shortcut feedback.
- Focus ring shared style: `outline: 2px solid var(--color-accent-9); outline-offset: 2px`; cleared on `:not(:focus-visible)`.
- Tab order: play → scrubber → mute → volume → playback rate → captions → fullscreen. Time display is not focusable.
- On `error → retry → ready`, focus moves back to the play button.
- Fullscreen entered with focus on root so keyboard shortcuts keep working.

## Auto-hide rule

`controlsVisible` atom flips based on:

| Trigger | Result |
| --- | --- |
| Mount | `true` |
| `paused === true` | `true` (always visible when paused) |
| `status === "buffering" \| "error"` | `true` |
| Pointer enters root, moves, or `onPointerActivity` fires | `true`, reset 2s timer |
| Keyboard event | `true`, reset 2s timer |
| Focus inside controls | `true`, no timer |
| Pointer leaves root | start 250ms timer → `false` (only if playing) |
| Timer expires while playing + no focus inside | `false` |

`data-controls-visible="false"` on root drives `cursor: none` while playing + hidden.

## Motion (motion.dev, all gated by `useReducedMotion()`)

| Element | Animation | Spring |
| --- | --- | --- |
| Controls bar | `opacity 0 → 1`, `y 8 → 0` | `{ type: "spring", bounce: 0.1, visualDuration: 0.25 }` |
| Big play button mount | `scale 0.92 → 1`, `opacity 0 → 1` | `{ type: "spring", bounce: 0.3, visualDuration: 0.3 }` |
| Big play button hover | `scale → 1.05` | spring |
| Big play button press | `scale → 0.95` | spring |
| Spinner | continuous rotate | linear, 0.8s/rev |
| Error overlay | `opacity 0 → 1` | `visualDuration: 0.2` |
| Scrubber thumb | `scale 0 → 1` on hover/drag | spring |
| Volume slider | `inline-size: 0 → 80px` on hover/focus | spring |
| Played fill | width follows `currentTime` per frame (no spring) | none |

When `useReducedMotion()` is true: springs become `{ duration: 0 }`; spinner rotation removed in favor of static "Loading…" text; auto-hide still runs but with no fade.

## Overlay precedence

Only one overlay shows at a time. Order:

1. `status === "error"` → ErrorOverlay (covers everything).
2. `status === "loading" \| "buffering"` → Spinner (centered; controls still visible if pointer active).
3. `!hasPlayedOnce && status === "ready"` → BigPlayButton + poster.
4. `paused && hasPlayedOnce` → controls visible, no center overlay.
5. `playing` → auto-hide controls, no overlay.

## Fullscreen

- Container calls `rootRef.current?.requestFullscreen()` / `document.exitFullscreen()`.
- Listens to `fullscreenchange` to update `state.fullscreen` atom.
- iOS Safari fallback: `videoRef.current?.webkitEnterFullscreen()` if standard API absent.

## Testing strategy

**vitest + @testing-library/react + jsdom** (already installed).

| File | Coverage |
| --- | --- |
| `format-time.test.ts` | `0 → "0:00"`, `65 → "1:05"`, `3661 → "1:01:01"`, `NaN`/`Infinity` → `"0:00"`. |
| `hooks.test.ts` | `useVideoPlayer` syncs `<video>` events → atoms (mock `HTMLMediaElement`). |
| `video-player.test.tsx` | Renders required minimal props; renders/hides parts based on optional actions; ARIA labels correct; keyboard shortcut callbacks fire on root keydown; reduced-motion path; status overlays mutually exclusive. |

**Storybook stories (`video-player.stories.tsx`):**
- Idle / Loading / Ready / Buffering / Error.
- With captions / without.
- With/without each optional action (verifies graceful degradation).
- Light + dark theme.
- Reduced-motion preview.

## Dependencies

All already installed: `@base-ui/react` (Slider, Menu), `lucide-react`, `motion`, `jotai`. No new deps.
