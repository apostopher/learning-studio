# Video Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a presentational `VideoPlayer` (kebab-case file `video-player.tsx`) with custom controls (play/pause, scrubber, time, volume/mute, captions, playback rate, fullscreen) plus a stateful `VideoPlayerContainer` that owns jotai atoms and syncs the native `<video>` via a forwarded `videoRef`. Fully white-label (every visual token resolves through `--color-*`/`--font-*` CSS vars), fully accessible (real `<button>`s, complete keyboard map, `aria-pressed`, focus rings, SR live region), reduced-motion aware. Driven by Synthesia-hosted MP4 + VTT captions.

**Architecture:** One stateful container (`video-player-container.tsx`) runs the `useVideoPlayer` hook (which subscribes to `<video>` events and writes to a `videoPlayerStateAtomFamily` keyed by `playerId`), then renders exactly one pure component (`video-player.tsx`). The pure component composes one part per control (`parts/play-pause-button.tsx`, `parts/scrubber.tsx`, etc.). Required props are only `src` and `videoRef`; everything else has internal defaults so missing actions degrade controls gracefully (hidden or `disabled`). Native attribute pass-through via `Omit<React.ComponentPropsWithoutRef<"video">, "controls" | "muted" | "onPlay" | "onPause" | "ref" | "children">`. Logical CSS properties (`ms-*`/`me-*`/`ps-*`/`pe-*`/`start-*`/`end-*`/`inline-size`/`block-size`) per project CLAUDE.md. Base UI `Slider` for scrubber + volume; Base UI `Menu` for playback rate. Motion springs gated by `useReducedMotion()`.

**Tech Stack:** React 19, TypeScript (strict), Tailwind v4 with `@theme` CSS vars (already shipped by `scripts/generate-theme-css.ts`), Base UI `@base-ui/react` (Slider, Menu), Motion (`motion/react`), Jotai 2 + `jotai-family`, `lucide-react` icons, Vitest + @testing-library/react + jsdom, Biome (format/lint). All deps already installed in `package.json` — no new deps.

**Spec:** `docs/superpowers/specs/2026-04-27-video-player-design.md`

---

## File map

**New files:**

- `src/components/video-player/format-time.ts` — pure formatter (`mm:ss` / `hh:mm:ss`)
- `src/components/video-player/types.ts` — exported `VideoPlayerState`, `VideoPlayerActions`, `VideoPlayerProps`, `VideoPlayerLabels`
- `src/components/video-player/labels.ts` — `DEFAULT_LABELS` constant
- `src/components/video-player/atoms.ts` — `videoPlayerStateAtomFamily`
- `src/components/video-player/hooks.ts` — `useVideoPlayer(playerId, videoRef, rootRef)`
- `src/components/video-player/parts/spinner.tsx`
- `src/components/video-player/parts/error-overlay.tsx`
- `src/components/video-player/parts/big-play-button.tsx`
- `src/components/video-player/parts/play-pause-button.tsx`
- `src/components/video-player/parts/time-display.tsx`
- `src/components/video-player/parts/scrubber.tsx`
- `src/components/video-player/parts/volume-control.tsx`
- `src/components/video-player/parts/captions-button.tsx`
- `src/components/video-player/parts/fullscreen-button.tsx`
- `src/components/video-player/parts/playback-rate-menu.tsx`
- `src/components/video-player/video-player.tsx` — pure composer
- `src/components/video-player/video-player-container.tsx` — wrapper
- `src/components/video-player/index.ts` — barrel export
- `src/components/video-player/__tests__/format-time.test.ts`
- `src/components/video-player/__tests__/hooks.test.ts`
- `src/components/video-player/__tests__/video-player.test.tsx`
- `src/components/video-player/video-player.stories.tsx` — Storybook stories

**Modified files:**

- `src/styles.css` — append video-player component classes (under `@layer components`) for letterbox bg, controls gradient, focus ring, captions cue styling, sr-only utility (only if missing)

---

## Task 1: Create format-time utility (TDD)

**Files:**

- Create: `src/components/video-player/format-time.ts`
- Create: `src/components/video-player/__tests__/format-time.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/video-player/__tests__/format-time.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatTime } from '../format-time';

describe('formatTime', () => {
  it('formats 0 as 0:00', () => {
    expect(formatTime(0)).toBe('0:00');
  });

  it('formats seconds under a minute as 0:SS', () => {
    expect(formatTime(7)).toBe('0:07');
    expect(formatTime(59)).toBe('0:59');
  });

  it('formats minutes:seconds without hours under one hour', () => {
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(599)).toBe('9:59');
    expect(formatTime(3599)).toBe('59:59');
  });

  it('formats hours:minutes:seconds at one hour or more', () => {
    expect(formatTime(3600)).toBe('1:00:00');
    expect(formatTime(3661)).toBe('1:01:01');
    expect(formatTime(36061)).toBe('10:01:01');
  });

  it('floors fractional seconds', () => {
    expect(formatTime(65.9)).toBe('1:05');
  });

  it('returns 0:00 for NaN, Infinity, and negative values', () => {
    expect(formatTime(Number.NaN)).toBe('0:00');
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe('0:00');
    expect(formatTime(-5)).toBe('0:00');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- src/components/video-player/__tests__/format-time.test.ts`

Expected: FAIL with module-not-found / `formatTime is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/video-player/format-time.ts`:

```ts
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const ss = String(s).padStart(2, '0');
  if (h > 0) {
    const mm = String(m).padStart(2, '0');
    return `${h}:${mm}:${ss}`;
  }
  return `${m}:${ss}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- src/components/video-player/__tests__/format-time.test.ts`

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/video-player/format-time.ts src/components/video-player/__tests__/format-time.test.ts
git commit -m "$(cat <<'EOF'
feat(video-player): add format-time utility (mm:ss / hh:mm:ss)
EOF
)"
```

---

## Task 2: Create types module

**Files:**

- Create: `src/components/video-player/types.ts`

- [ ] **Step 1: Write the file**

Create `src/components/video-player/types.ts`:

```ts
import type * as React from 'react';

export type VideoPlayerStatus = 'idle' | 'loading' | 'ready' | 'buffering' | 'error';

export type VideoPlayerState = {
  paused: boolean;
  currentTime: number;
  duration: number;
  bufferedEnd: number;
  volume: number; // 0–1
  muted: boolean;
  playbackRate: number;
  captionsEnabled: boolean;
  hasCaptions: boolean;
  fullscreen: boolean;
  status: VideoPlayerStatus;
  error?: string;
  hasPlayedOnce: boolean;
  controlsVisible: boolean;
};

export type VideoPlayerActions = {
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

export type VideoPlayerLabelKey =
  | 'player'
  | 'play'
  | 'pause'
  | 'mute'
  | 'unmute'
  | 'captionsOn'
  | 'captionsOff'
  | 'fullscreenEnter'
  | 'fullscreenExit'
  | 'volume'
  | 'seek'
  | 'playbackRate'
  | 'retry'
  | 'loading'
  | 'buffering'
  | 'error';

export type VideoPlayerLabels = Record<VideoPlayerLabelKey, string>;

export type VideoPlayerProps = Omit<
  React.ComponentPropsWithoutRef<'video'>,
  'controls' | 'muted' | 'onPlay' | 'onPause' | 'ref' | 'children'
> & {
  src: string;
  videoRef: React.Ref<HTMLVideoElement>;
  rootRef?: React.Ref<HTMLDivElement>;
  tracks?: React.ComponentPropsWithoutRef<'track'>[];
  state?: Partial<VideoPlayerState>;
  actions?: VideoPlayerActions;
  playbackRates?: number[];
  labels?: Partial<VideoPlayerLabels>;
};
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc -p tsconfig.json --noEmit`

Expected: exit 0 (or only pre-existing unrelated errors).

- [ ] **Step 3: Commit**

```bash
git add src/components/video-player/types.ts
git commit -m "$(cat <<'EOF'
feat(video-player): add types module
EOF
)"
```

---

## Task 3: Create default labels

**Files:**

- Create: `src/components/video-player/labels.ts`

- [ ] **Step 1: Write the file**

Create `src/components/video-player/labels.ts`:

```ts
import type { VideoPlayerLabels } from './types';

export const DEFAULT_LABELS: VideoPlayerLabels = {
  player: 'Video player',
  play: 'Play',
  pause: 'Pause',
  mute: 'Mute',
  unmute: 'Unmute',
  captionsOn: 'Turn captions off',
  captionsOff: 'Turn captions on',
  fullscreenEnter: 'Enter fullscreen',
  fullscreenExit: 'Exit fullscreen',
  volume: 'Volume',
  seek: 'Seek',
  playbackRate: 'Playback rate',
  retry: 'Retry',
  loading: 'Loading',
  buffering: 'Buffering',
  error: 'Playback error',
};

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
```

- [ ] **Step 2: Type-check and commit**

```bash
pnpm exec tsc -p tsconfig.json --noEmit
git add src/components/video-player/labels.ts
git commit -m "$(cat <<'EOF'
feat(video-player): add default labels and playback rates
EOF
)"
```

---

## Task 4: Create atoms module

**Files:**

- Create: `src/components/video-player/atoms.ts`

- [ ] **Step 1: Write the file**

Create `src/components/video-player/atoms.ts`:

```ts
import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import type { VideoPlayerState } from './types';

export const INITIAL_VIDEO_PLAYER_STATE: VideoPlayerState = {
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
  status: 'idle',
  hasPlayedOnce: false,
  controlsVisible: true,
};

export const videoPlayerStateAtomFamily = atomFamily((_id: string) =>
  atom<VideoPlayerState>({ ...INITIAL_VIDEO_PLAYER_STATE }),
);
```

- [ ] **Step 2: Type-check and commit**

```bash
pnpm exec tsc -p tsconfig.json --noEmit
git add src/components/video-player/atoms.ts
git commit -m "$(cat <<'EOF'
feat(video-player): add jotai atomFamily for per-player state
EOF
)"
```

---

## Task 5: Append video-player CSS to styles.css

**Files:**

- Modify: `src/styles.css`

- [ ] **Step 1: Locate the file**

Run: `ls src/styles.css` — verify file exists. (If your project uses a different stylesheet, substitute that path consistently in this task.)

- [ ] **Step 2: Append video-player component classes**

Append the following at the end of `src/styles.css`:

```css
@layer components {
  .video-player {
    position: relative;
    aspect-ratio: 16 / 9;
    inline-size: 100%;
    max-inline-size: 100%;
    background: var(--color-gray-12);
    overflow: hidden;
    border-radius: var(--radius-lg, 0.5rem);
    color: var(--color-gray-1);
    font-family: var(--font-sans);
  }

  .video-player[data-controls-visible='false'][data-status='ready'] {
    cursor: none;
  }

  .video-player video {
    inline-size: 100%;
    block-size: 100%;
    object-fit: contain;
    background: var(--color-gray-12);
  }

  .video-player ::cue {
    background: var(--color-gray-a12);
    color: var(--color-gray-1);
    font-family: var(--font-sans);
  }

  .video-player .vp-controls {
    position: absolute;
    inset-inline: 0;
    inset-block-end: 0;
    display: grid;
    gap: calc(var(--spacing) * 1);
    padding-inline: calc(var(--spacing) * 3);
    padding-block: calc(var(--spacing) * 3);
    background: linear-gradient(to top, var(--color-gray-a12), transparent);
  }

  .video-player .vp-controls-row {
    display: flex;
    align-items: center;
    gap: calc(var(--spacing) * 2);
  }

  .video-player .vp-icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: calc(var(--spacing) * 8);
    block-size: calc(var(--spacing) * 8);
    border-radius: var(--radius-md, 0.375rem);
    color: var(--color-gray-1);
    background: transparent;
  }

  .video-player .vp-icon-button:hover:not(:disabled) {
    background: var(--color-gray-a4);
  }

  .video-player .vp-icon-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .video-player .vp-icon-button:focus-visible,
  .video-player .vp-surface:focus-visible,
  .video-player [data-base-ui]:focus-visible {
    outline: 2px solid var(--color-accent-9);
    outline-offset: 2px;
  }

  .video-player .vp-surface {
    position: absolute;
    inset: 0;
    background: transparent;
    border: 0;
    cursor: pointer;
  }

  .video-player .vp-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .video-player .vp-error {
    background: var(--color-gray-a11);
    color: var(--color-gray-1);
    padding: calc(var(--spacing) * 4);
    text-align: center;
  }

  .video-player .vp-time {
    font-variant-numeric: tabular-nums;
    color: var(--color-gray-1);
    font-size: 0.875rem;
  }

  .video-player .vp-sr-only {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
}
```

- [ ] **Step 3: Run dev to verify Tailwind compiles**

Run: `pnpm exec tsc -p tsconfig.json --noEmit`

Expected: exit 0. (CSS itself isn't TS-checked, but this guarantees the project still type-checks while you edited the file.)

- [ ] **Step 4: Commit**

```bash
git add src/styles.css
git commit -m "$(cat <<'EOF'
feat(video-player): add video-player component CSS classes
EOF
)"
```

---

## Task 6: Create Spinner part

**Files:**

- Create: `src/components/video-player/parts/spinner.tsx`

- [ ] **Step 1: Write the file**

Create `src/components/video-player/parts/spinner.tsx`:

```tsx
import { Loader2 } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

type SpinnerProps = {
  label: string;
};

export const Spinner = ({ label }: SpinnerProps) => {
  const reduced = useReducedMotion();
  return (
    <div className="vp-overlay" role="status">
      <span className="vp-sr-only">{label}</span>
      {reduced ? (
        <span aria-hidden="true" className="text-sm">
          {label}…
        </span>
      ) : (
        <motion.span
          aria-hidden="true"
          animate={{ rotate: 360 }}
          transition={{ repeat: Number.POSITIVE_INFINITY, ease: 'linear', duration: 0.8 }}
          style={{ display: 'inline-flex', color: 'var(--color-accent-9)' }}
        >
          <Loader2 size={36} />
        </motion.span>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Type-check and commit**

```bash
pnpm exec tsc -p tsconfig.json --noEmit
git add src/components/video-player/parts/spinner.tsx
git commit -m "$(cat <<'EOF'
feat(video-player): add Spinner part with reduced-motion fallback
EOF
)"
```

---

## Task 7: Create ErrorOverlay part

**Files:**

- Create: `src/components/video-player/parts/error-overlay.tsx`

- [ ] **Step 1: Write the file**

Create `src/components/video-player/parts/error-overlay.tsx`:

```tsx
import { RotateCcw } from 'lucide-react';

type ErrorOverlayProps = {
  message?: string;
  defaultMessage: string;
  retryLabel: string;
  onRetry?: () => void;
};

export const ErrorOverlay = ({
  message,
  defaultMessage,
  retryLabel,
  onRetry,
}: ErrorOverlayProps) => (
  <div className="vp-overlay vp-error" role="alert">
    <div>
      <p>{message ?? defaultMessage}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="vp-icon-button"
          aria-label={retryLabel}
          style={{ marginBlockStart: 'calc(var(--spacing) * 2)' }}
        >
          <RotateCcw size={20} aria-hidden="true" />
          <span style={{ marginInlineStart: 'calc(var(--spacing) * 2)' }}>{retryLabel}</span>
        </button>
      ) : null}
    </div>
  </div>
);
```

- [ ] **Step 2: Type-check and commit**

```bash
pnpm exec tsc -p tsconfig.json --noEmit
git add src/components/video-player/parts/error-overlay.tsx
git commit -m "$(cat <<'EOF'
feat(video-player): add ErrorOverlay part with optional retry
EOF
)"
```

---

## Task 8: Create BigPlayButton part

**Files:**

- Create: `src/components/video-player/parts/big-play-button.tsx`

- [ ] **Step 1: Write the file**

Create `src/components/video-player/parts/big-play-button.tsx`:

```tsx
import { Play } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

type BigPlayButtonProps = {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
};

export const BigPlayButton = ({ label, onClick, disabled }: BigPlayButtonProps) => {
  const reduced = useReducedMotion();
  return (
    <div className="vp-overlay">
      <motion.button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        initial={reduced ? false : { scale: 0.92, opacity: 0 }}
        animate={reduced ? undefined : { scale: 1, opacity: 1 }}
        whileHover={reduced || disabled ? undefined : { scale: 1.05 }}
        whileTap={reduced || disabled ? undefined : { scale: 0.95 }}
        transition={
          reduced ? { duration: 0 } : { type: 'spring', bounce: 0.3, visualDuration: 0.3 }
        }
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          inlineSize: 80,
          blockSize: 80,
          borderRadius: '9999px',
          background: 'var(--color-accent-9)',
          color: 'var(--color-accent-contrast)',
          border: 0,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <Play size={32} aria-hidden="true" style={{ marginInlineStart: 4 }} />
      </motion.button>
    </div>
  );
};
```

- [ ] **Step 2: Type-check and commit**

```bash
pnpm exec tsc -p tsconfig.json --noEmit
git add src/components/video-player/parts/big-play-button.tsx
git commit -m "$(cat <<'EOF'
feat(video-player): add BigPlayButton part with motion + reduced-motion
EOF
)"
```

---

## Task 9: Create PlayPauseButton part

**Files:**

- Create: `src/components/video-player/parts/play-pause-button.tsx`

- [ ] **Step 1: Write the file**

Create `src/components/video-player/parts/play-pause-button.tsx`:

```tsx
import { Pause, Play } from 'lucide-react';

type PlayPauseButtonProps = {
  paused: boolean;
  playLabel: string;
  pauseLabel: string;
  onPlay?: () => void;
  onPause?: () => void;
};

export const PlayPauseButton = ({
  paused,
  playLabel,
  pauseLabel,
  onPlay,
  onPause,
}: PlayPauseButtonProps) => {
  const handler = paused ? onPlay : onPause;
  const label = paused ? playLabel : pauseLabel;
  return (
    <button
      type="button"
      onClick={handler}
      disabled={!handler}
      aria-label={label}
      className="vp-icon-button"
    >
      {paused ? (
        <Play size={20} aria-hidden="true" />
      ) : (
        <Pause size={20} aria-hidden="true" />
      )}
    </button>
  );
};
```

- [ ] **Step 2: Type-check and commit**

```bash
pnpm exec tsc -p tsconfig.json --noEmit
git add src/components/video-player/parts/play-pause-button.tsx
git commit -m "$(cat <<'EOF'
feat(video-player): add PlayPauseButton part
EOF
)"
```

---

## Task 10: Create TimeDisplay part

**Files:**

- Create: `src/components/video-player/parts/time-display.tsx`

- [ ] **Step 1: Write the file**

Create `src/components/video-player/parts/time-display.tsx`:

```tsx
import { formatTime } from '../format-time';

type TimeDisplayProps = {
  currentTime: number;
  duration: number;
};

export const TimeDisplay = ({ currentTime, duration }: TimeDisplayProps) => (
  <span className="vp-time" aria-hidden="true">
    {formatTime(currentTime)} / {formatTime(duration)}
  </span>
);
```

- [ ] **Step 2: Type-check and commit**

```bash
pnpm exec tsc -p tsconfig.json --noEmit
git add src/components/video-player/parts/time-display.tsx
git commit -m "$(cat <<'EOF'
feat(video-player): add TimeDisplay part using formatTime
EOF
)"
```

---

## Task 11: Create Scrubber part (Base UI Slider)

**Files:**

- Create: `src/components/video-player/parts/scrubber.tsx`

- [ ] **Step 1: Write the file**

Create `src/components/video-player/parts/scrubber.tsx`:

```tsx
import { Slider } from '@base-ui/react/slider';
import { formatTime } from '../format-time';

type ScrubberProps = {
  currentTime: number;
  duration: number;
  bufferedEnd: number;
  seekLabel: string;
  onSeek?: (time: number) => void;
};

export const Scrubber = ({
  currentTime,
  duration,
  bufferedEnd,
  seekLabel,
  onSeek,
}: ScrubberProps) => {
  const max = duration > 0 ? duration : 1;
  const buffered = Math.max(0, Math.min(bufferedEnd, max));
  const value = Math.max(0, Math.min(currentTime, max));
  const valueText = `${formatTime(value)} of ${formatTime(max)}`;
  return (
    <Slider.Root
      value={value}
      max={max}
      min={0}
      step={0.1}
      disabled={!onSeek || duration <= 0}
      onValueChange={(v) => onSeek?.(Array.isArray(v) ? v[0] : v)}
      aria-label={seekLabel}
      aria-valuetext={valueText}
      style={{ inlineSize: '100%' }}
    >
      <Slider.Control>
        <Slider.Track
          style={{
            position: 'relative',
            blockSize: 4,
            borderRadius: 9999,
            background: 'var(--color-gray-a7)',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              insetBlock: 0,
              insetInlineStart: 0,
              inlineSize: `${(buffered / max) * 100}%`,
              background: 'var(--color-gray-a9)',
              borderRadius: 9999,
            }}
          />
          <Slider.Indicator
            style={{
              background: 'var(--color-accent-9)',
              borderRadius: 9999,
            }}
          />
          <Slider.Thumb
            style={{
              inlineSize: 14,
              blockSize: 14,
              borderRadius: 9999,
              background: 'var(--color-accent-9)',
              boxShadow: '0 0 0 4px var(--color-accent-a4)',
            }}
          />
        </Slider.Track>
      </Slider.Control>
    </Slider.Root>
  );
};
```

- [ ] **Step 2: Type-check and commit**

```bash
pnpm exec tsc -p tsconfig.json --noEmit
git add src/components/video-player/parts/scrubber.tsx
git commit -m "$(cat <<'EOF'
feat(video-player): add Scrubber part (Base UI Slider with buffered fill)
EOF
)"
```

---

## Task 12: Create VolumeControl part

**Files:**

- Create: `src/components/video-player/parts/volume-control.tsx`

- [ ] **Step 1: Write the file**

Create `src/components/video-player/parts/volume-control.tsx`:

```tsx
import { Slider } from '@base-ui/react/slider';
import { Volume1, Volume2, VolumeX } from 'lucide-react';

type VolumeControlProps = {
  volume: number;
  muted: boolean;
  muteLabel: string;
  unmuteLabel: string;
  volumeLabel: string;
  onMuteToggle?: () => void;
  onVolumeChange?: (volume: number) => void;
};

export const VolumeControl = ({
  volume,
  muted,
  muteLabel,
  unmuteLabel,
  volumeLabel,
  onMuteToggle,
  onVolumeChange,
}: VolumeControlProps) => {
  const effective = muted ? 0 : volume;
  const Icon = muted || effective === 0 ? VolumeX : effective < 0.5 ? Volume1 : Volume2;
  const valueText = muted ? 'Muted' : `${Math.round(effective * 100)}%`;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <button
        type="button"
        onClick={onMuteToggle}
        disabled={!onMuteToggle}
        aria-label={muted ? unmuteLabel : muteLabel}
        aria-pressed={muted}
        className="vp-icon-button"
      >
        <Icon size={20} aria-hidden="true" />
      </button>
      <Slider.Root
        value={effective}
        min={0}
        max={1}
        step={0.01}
        disabled={!onVolumeChange}
        onValueChange={(v) => onVolumeChange?.(Array.isArray(v) ? v[0] : v)}
        aria-label={volumeLabel}
        aria-valuetext={valueText}
        style={{ inlineSize: 80 }}
      >
        <Slider.Control>
          <Slider.Track
            style={{
              blockSize: 4,
              borderRadius: 9999,
              background: 'var(--color-gray-a7)',
            }}
          >
            <Slider.Indicator
              style={{ background: 'var(--color-accent-9)', borderRadius: 9999 }}
            />
            <Slider.Thumb
              style={{
                inlineSize: 12,
                blockSize: 12,
                borderRadius: 9999,
                background: 'var(--color-accent-9)',
              }}
            />
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
    </div>
  );
};
```

- [ ] **Step 2: Type-check and commit**

```bash
pnpm exec tsc -p tsconfig.json --noEmit
git add src/components/video-player/parts/volume-control.tsx
git commit -m "$(cat <<'EOF'
feat(video-player): add VolumeControl part with mute toggle and slider
EOF
)"
```

---

## Task 13: Create CaptionsButton part

**Files:**

- Create: `src/components/video-player/parts/captions-button.tsx`

- [ ] **Step 1: Write the file**

Create `src/components/video-player/parts/captions-button.tsx`:

```tsx
import { Subtitles } from 'lucide-react';

type CaptionsButtonProps = {
  enabled: boolean;
  onLabel: string;
  offLabel: string;
  onToggle?: () => void;
};

export const CaptionsButton = ({
  enabled,
  onLabel,
  offLabel,
  onToggle,
}: CaptionsButtonProps) => (
  <button
    type="button"
    onClick={onToggle}
    disabled={!onToggle}
    aria-pressed={enabled}
    aria-label={enabled ? onLabel : offLabel}
    className="vp-icon-button"
    style={enabled ? { color: 'var(--color-accent-9)' } : undefined}
  >
    <Subtitles size={20} aria-hidden="true" />
  </button>
);
```

- [ ] **Step 2: Type-check and commit**

```bash
pnpm exec tsc -p tsconfig.json --noEmit
git add src/components/video-player/parts/captions-button.tsx
git commit -m "$(cat <<'EOF'
feat(video-player): add CaptionsButton part with aria-pressed
EOF
)"
```

---

## Task 14: Create FullscreenButton part

**Files:**

- Create: `src/components/video-player/parts/fullscreen-button.tsx`

- [ ] **Step 1: Write the file**

Create `src/components/video-player/parts/fullscreen-button.tsx`:

```tsx
import { Maximize, Minimize } from 'lucide-react';

type FullscreenButtonProps = {
  isFullscreen: boolean;
  enterLabel: string;
  exitLabel: string;
  onToggle?: () => void;
};

export const FullscreenButton = ({
  isFullscreen,
  enterLabel,
  exitLabel,
  onToggle,
}: FullscreenButtonProps) => (
  <button
    type="button"
    onClick={onToggle}
    disabled={!onToggle}
    aria-pressed={isFullscreen}
    aria-label={isFullscreen ? exitLabel : enterLabel}
    className="vp-icon-button"
  >
    {isFullscreen ? (
      <Minimize size={20} aria-hidden="true" />
    ) : (
      <Maximize size={20} aria-hidden="true" />
    )}
  </button>
);
```

- [ ] **Step 2: Type-check and commit**

```bash
pnpm exec tsc -p tsconfig.json --noEmit
git add src/components/video-player/parts/fullscreen-button.tsx
git commit -m "$(cat <<'EOF'
feat(video-player): add FullscreenButton part with aria-pressed
EOF
)"
```

---

## Task 15: Create PlaybackRateMenu part (Base UI Menu)

**Files:**

- Create: `src/components/video-player/parts/playback-rate-menu.tsx`

- [ ] **Step 1: Write the file**

Create `src/components/video-player/parts/playback-rate-menu.tsx`:

```tsx
import { Menu } from '@base-ui/react/menu';
import { Gauge } from 'lucide-react';

type PlaybackRateMenuProps = {
  rate: number;
  rates: number[];
  label: string;
  onChange?: (rate: number) => void;
};

export const PlaybackRateMenu = ({ rate, rates, label, onChange }: PlaybackRateMenuProps) => (
  <Menu.Root>
    <Menu.Trigger
      className="vp-icon-button"
      aria-label={`${label}: ${rate}x`}
      disabled={!onChange}
    >
      <Gauge size={20} aria-hidden="true" />
      <span
        style={{
          marginInlineStart: 4,
          fontSize: '0.75rem',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {rate}x
      </span>
    </Menu.Trigger>
    <Menu.Portal>
      <Menu.Positioner sideOffset={8}>
        <Menu.Popup
          style={{
            background: 'var(--color-gray-1)',
            color: 'var(--color-gray-12)',
            borderRadius: 'var(--radius-md, 0.375rem)',
            padding: 4,
            boxShadow: '0 8px 24px var(--color-gray-a8)',
            minInlineSize: 96,
          }}
        >
          {rates.map((r) => (
            <Menu.Item
              key={r}
              onClick={() => onChange?.(r)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBlock: 6,
                paddingInline: 8,
                borderRadius: 4,
                cursor: 'pointer',
                background: r === rate ? 'var(--color-accent-a4)' : 'transparent',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <span>{r}x</span>
              {r === rate ? <span aria-hidden="true">✓</span> : null}
            </Menu.Item>
          ))}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  </Menu.Root>
);
```

- [ ] **Step 2: Type-check and commit**

```bash
pnpm exec tsc -p tsconfig.json --noEmit
git add src/components/video-player/parts/playback-rate-menu.tsx
git commit -m "$(cat <<'EOF'
feat(video-player): add PlaybackRateMenu part (Base UI Menu)
EOF
)"
```

---

## Task 16: Create the pure VideoPlayer composer

**Files:**

- Create: `src/components/video-player/video-player.tsx`

- [ ] **Step 1: Write the file**

Create `src/components/video-player/video-player.tsx`:

```tsx
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { DEFAULT_LABELS, PLAYBACK_RATES } from './labels';
import { BigPlayButton } from './parts/big-play-button';
import { CaptionsButton } from './parts/captions-button';
import { ErrorOverlay } from './parts/error-overlay';
import { FullscreenButton } from './parts/fullscreen-button';
import { PlaybackRateMenu } from './parts/playback-rate-menu';
import { PlayPauseButton } from './parts/play-pause-button';
import { Scrubber } from './parts/scrubber';
import { Spinner } from './parts/spinner';
import { TimeDisplay } from './parts/time-display';
import { VolumeControl } from './parts/volume-control';
import type { VideoPlayerProps } from './types';

export const VideoPlayer = ({
  src,
  videoRef,
  rootRef,
  tracks,
  state,
  actions,
  playbackRates = [...PLAYBACK_RATES],
  labels: labelOverrides,
  ...nativeRest
}: VideoPlayerProps) => {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };
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
    status = 'idle',
    error,
    hasPlayedOnce = false,
    controlsVisible = true,
  } = state ?? {};
  const a = actions ?? {};
  const reduced = useReducedMotion();

  const onSurfaceClick = paused ? a.onPlay : a.onPause;
  const surfaceLabel = paused ? labels.play : labels.pause;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    a.onKeyboardShortcut?.(event.key);
  };

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label={labels.player}
      className="video-player"
      data-controls-visible={controlsVisible}
      data-status={status}
      onMouseMove={a.onPointerActivity}
      onPointerDown={a.onPointerActivity}
      onKeyDown={handleKeyDown}
      // tabIndex makes the root focusable so keyboard events fire
      // even before any control inside has focus.
      tabIndex={0}
    >
      <video ref={videoRef} src={src} playsInline {...nativeRest}>
        {tracks?.map((t) => (
          <track key={`${t.src}-${t.srclang ?? ''}`} {...t} />
        ))}
      </video>

      <button
        type="button"
        tabIndex={-1}
        onClick={onSurfaceClick}
        disabled={!onSurfaceClick}
        aria-label={surfaceLabel}
        className="vp-surface"
      />

      <AnimatePresence>
        {!hasPlayedOnce && status !== 'error' && status !== 'loading' ? (
          <BigPlayButton
            key="big-play"
            label={labels.play}
            onClick={a.onPlay}
            disabled={!a.onPlay}
          />
        ) : null}
      </AnimatePresence>

      {status === 'loading' || status === 'buffering' ? (
        <Spinner
          label={status === 'loading' ? labels.loading : labels.buffering}
        />
      ) : null}

      {status === 'error' ? (
        <ErrorOverlay
          message={error}
          defaultMessage={labels.error}
          retryLabel={labels.retry}
          onRetry={a.onRetry}
        />
      ) : null}

      {/* SR live region — container updates this via DOM if needed; static aria-live is enough for now */}
      <span aria-live="polite" className="vp-sr-only" />

      <AnimatePresence>
        {controlsVisible ? (
          <motion.div
            key="controls"
            className="vp-controls"
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={reduced ? undefined : { opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: 8 }}
            transition={
              reduced
                ? { duration: 0 }
                : { type: 'spring', bounce: 0.1, visualDuration: 0.25 }
            }
          >
            <Scrubber
              currentTime={currentTime}
              duration={duration}
              bufferedEnd={bufferedEnd}
              seekLabel={labels.seek}
              onSeek={a.onSeek}
            />
            <div className="vp-controls-row">
              <PlayPauseButton
                paused={paused}
                playLabel={labels.play}
                pauseLabel={labels.pause}
                onPlay={a.onPlay}
                onPause={a.onPause}
              />
              <TimeDisplay currentTime={currentTime} duration={duration} />
              <VolumeControl
                volume={volume}
                muted={muted}
                muteLabel={labels.mute}
                unmuteLabel={labels.unmute}
                volumeLabel={labels.volume}
                onMuteToggle={a.onMuteToggle}
                onVolumeChange={a.onVolumeChange}
              />
              <span style={{ flex: 1 }} />
              {a.onPlaybackRateChange ? (
                <PlaybackRateMenu
                  rate={playbackRate}
                  rates={playbackRates}
                  label={labels.playbackRate}
                  onChange={a.onPlaybackRateChange}
                />
              ) : null}
              {hasCaptions && a.onCaptionsToggle ? (
                <CaptionsButton
                  enabled={captionsEnabled}
                  onLabel={labels.captionsOn}
                  offLabel={labels.captionsOff}
                  onToggle={a.onCaptionsToggle}
                />
              ) : null}
              {a.onFullscreenToggle ? (
                <FullscreenButton
                  isFullscreen={fullscreen}
                  enterLabel={labels.fullscreenEnter}
                  exitLabel={labels.fullscreenExit}
                  onToggle={a.onFullscreenToggle}
                />
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
```

- [ ] **Step 2: Type-check and commit**

```bash
pnpm exec tsc -p tsconfig.json --noEmit
git add src/components/video-player/video-player.tsx
git commit -m "$(cat <<'EOF'
feat(video-player): add pure VideoPlayer composer
EOF
)"
```

---

## Task 17: Add VideoPlayer render tests

**Files:**

- Create: `src/components/video-player/__tests__/video-player.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/video-player/__tests__/video-player.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { VideoPlayer } from '../video-player';

const MIN_PROPS = {
  src: 'https://example.test/video.mp4',
};

describe('VideoPlayer', () => {
  it('renders only required props (paused, idle, no controls actions)', () => {
    const ref = createRef<HTMLVideoElement>();
    render(<VideoPlayer {...MIN_PROPS} videoRef={ref} />);
    expect(screen.getByRole('region', { name: 'Video player' })).toBeTruthy();
    // Big play button is shown because hasPlayedOnce defaults to false
    const bigPlay = screen.getAllByRole('button', { name: 'Play' });
    expect(bigPlay.length).toBeGreaterThan(0);
  });

  it('hides captions button when no tracks are provided', () => {
    const ref = createRef<HTMLVideoElement>();
    render(
      <VideoPlayer
        {...MIN_PROPS}
        videoRef={ref}
        actions={{ onCaptionsToggle: vi.fn() }}
      />,
    );
    expect(screen.queryByRole('button', { name: /captions/i })).toBeNull();
  });

  it('shows captions button when tracks are provided and onCaptionsToggle is set', () => {
    const ref = createRef<HTMLVideoElement>();
    render(
      <VideoPlayer
        {...MIN_PROPS}
        videoRef={ref}
        tracks={[{ src: 'cap.vtt', srclang: 'en', label: 'English', kind: 'subtitles' }]}
        state={{ captionsEnabled: true }}
        actions={{ onCaptionsToggle: vi.fn() }}
      />,
    );
    expect(
      screen.getByRole('button', { name: /captions/i, pressed: true }),
    ).toBeTruthy();
  });

  it('hides fullscreen button when onFullscreenToggle is missing', () => {
    const ref = createRef<HTMLVideoElement>();
    render(<VideoPlayer {...MIN_PROPS} videoRef={ref} />);
    expect(screen.queryByRole('button', { name: /fullscreen/i })).toBeNull();
  });

  it('renders error overlay when status is error and fires onRetry', async () => {
    const ref = createRef<HTMLVideoElement>();
    const onRetry = vi.fn();
    render(
      <VideoPlayer
        {...MIN_PROPS}
        videoRef={ref}
        state={{ status: 'error', error: 'Could not load' }}
        actions={{ onRetry }}
      />,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Could not load')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('emits keyboard shortcut callback on root keydown', async () => {
    const ref = createRef<HTMLVideoElement>();
    const onKeyboardShortcut = vi.fn();
    render(
      <VideoPlayer
        {...MIN_PROPS}
        videoRef={ref}
        actions={{ onKeyboardShortcut }}
      />,
    );
    const region = screen.getByRole('region', { name: 'Video player' });
    region.focus();
    await userEvent.keyboard(' ');
    expect(onKeyboardShortcut).toHaveBeenCalledWith(' ');
  });

  it('overrides player aria-label via labels prop', () => {
    const ref = createRef<HTMLVideoElement>();
    render(
      <VideoPlayer
        {...MIN_PROPS}
        videoRef={ref}
        labels={{ player: 'Lesson video' }}
      />,
    );
    expect(screen.getByRole('region', { name: 'Lesson video' })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm test -- src/components/video-player/__tests__/video-player.test.tsx`

Expected: 7 tests pass. (If `userEvent` isn't installed: `pnpm add -D @testing-library/user-event` first, then re-run. Skip the install step if it's already in `devDependencies`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/video-player/__tests__/video-player.test.tsx
git commit -m "$(cat <<'EOF'
test(video-player): add render and interaction tests for VideoPlayer
EOF
)"
```

---

## Task 18: Create useVideoPlayer hook (TDD)

**Files:**

- Create: `src/components/video-player/hooks.ts`
- Create: `src/components/video-player/__tests__/hooks.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/video-player/__tests__/hooks.test.ts`:

```ts
// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { Provider, useAtomValue } from 'jotai';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { videoPlayerStateAtomFamily } from '../atoms';
import { useVideoPlayer } from '../hooks';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <Provider>{children}</Provider>
);

const setup = () => {
  const playerId = `t-${Math.random().toString(36).slice(2)}`;
  const videoRef = createRef<HTMLVideoElement>();
  const rootRef = createRef<HTMLDivElement>();
  const video = document.createElement('video');
  Object.defineProperty(videoRef, 'current', { value: video, writable: true });
  const root = document.createElement('div');
  Object.defineProperty(rootRef, 'current', { value: root, writable: true });
  return { playerId, videoRef, rootRef, video, root };
};

describe('useVideoPlayer', () => {
  it('reflects play/pause native events into state.paused', () => {
    const { playerId, videoRef, rootRef, video } = setup();
    const { result } = renderHook(
      () => {
        useVideoPlayer(playerId, videoRef, rootRef);
        return useAtomValue(videoPlayerStateAtomFamily(playerId));
      },
      { wrapper },
    );
    expect(result.current.paused).toBe(true);
    act(() => {
      video.dispatchEvent(new Event('play'));
    });
    expect(result.current.paused).toBe(false);
    expect(result.current.hasPlayedOnce).toBe(true);
    act(() => {
      video.dispatchEvent(new Event('pause'));
    });
    expect(result.current.paused).toBe(true);
  });

  it('updates duration on loadedmetadata and currentTime on timeupdate', () => {
    const { playerId, videoRef, rootRef, video } = setup();
    Object.defineProperty(video, 'duration', { value: 90, configurable: true });
    Object.defineProperty(video, 'currentTime', { value: 12.5, configurable: true });
    const { result } = renderHook(
      () => {
        useVideoPlayer(playerId, videoRef, rootRef);
        return useAtomValue(videoPlayerStateAtomFamily(playerId));
      },
      { wrapper },
    );
    act(() => {
      video.dispatchEvent(new Event('loadedmetadata'));
      video.dispatchEvent(new Event('timeupdate'));
    });
    expect(result.current.duration).toBe(90);
    expect(result.current.currentTime).toBe(12.5);
  });

  it('flips status to buffering on waiting and back to ready on canplay', () => {
    const { playerId, videoRef, rootRef, video } = setup();
    const { result } = renderHook(
      () => {
        useVideoPlayer(playerId, videoRef, rootRef);
        return useAtomValue(videoPlayerStateAtomFamily(playerId));
      },
      { wrapper },
    );
    act(() => {
      video.dispatchEvent(new Event('waiting'));
    });
    expect(result.current.status).toBe('buffering');
    act(() => {
      video.dispatchEvent(new Event('canplay'));
    });
    expect(result.current.status).toBe('ready');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- src/components/video-player/__tests__/hooks.test.ts`

Expected: FAIL with `useVideoPlayer is not exported`.

- [ ] **Step 3: Write the implementation**

Create `src/components/video-player/hooks.ts`:

```ts
import { useSetAtom } from 'jotai';
import { type RefObject, useEffect, useRef } from 'react';
import { videoPlayerStateAtomFamily } from './atoms';
import type { VideoPlayerState } from './types';

const HIDE_DELAY_MS = 2000;
const HIDE_LEAVE_DELAY_MS = 250;

export const useVideoPlayer = (
  playerId: string,
  videoRef: RefObject<HTMLVideoElement | null>,
  rootRef: RefObject<HTMLDivElement | null>,
) => {
  const setState = useSetAtom(videoPlayerStateAtomFamily(playerId));
  const hideTimer = useRef<number | undefined>(undefined);

  // Native <video> event sync
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const patch = (p: Partial<VideoPlayerState>) =>
      setState((prev) => ({ ...prev, ...p }));

    const onLoadedMetadata = () =>
      patch({
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        hasCaptions: video.textTracks.length > 0,
        status: 'ready',
      });
    const onTimeUpdate = () => patch({ currentTime: video.currentTime });
    const onPlay = () => patch({ paused: false, hasPlayedOnce: true, status: 'ready' });
    const onPause = () => patch({ paused: true });
    const onVolumeChange = () =>
      patch({ volume: video.volume, muted: video.muted });
    const onRateChange = () => patch({ playbackRate: video.playbackRate });
    const onProgress = () => {
      const ranges = video.buffered;
      let bufferedEnd = 0;
      for (let i = 0; i < ranges.length; i++) {
        if (ranges.start(i) <= video.currentTime) {
          bufferedEnd = Math.max(bufferedEnd, ranges.end(i));
        }
      }
      patch({ bufferedEnd });
    };
    const onWaiting = () => patch({ status: 'buffering' });
    const onCanPlay = () => patch({ status: 'ready' });
    const onLoadStart = () => patch({ status: 'loading' });
    const onError = () =>
      patch({ status: 'error', error: video.error?.message });
    const onEnded = () => patch({ paused: true });

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('volumechange', onVolumeChange);
    video.addEventListener('ratechange', onRateChange);
    video.addEventListener('progress', onProgress);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('loadstart', onLoadStart);
    video.addEventListener('error', onError);
    video.addEventListener('ended', onEnded);

    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('volumechange', onVolumeChange);
      video.removeEventListener('ratechange', onRateChange);
      video.removeEventListener('progress', onProgress);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('loadstart', onLoadStart);
      video.removeEventListener('error', onError);
      video.removeEventListener('ended', onEnded);
    };
  }, [videoRef, setState]);

  // Fullscreen sync
  useEffect(() => {
    const onFsChange = () =>
      setState((prev) => ({
        ...prev,
        fullscreen: document.fullscreenElement === rootRef.current,
      }));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [rootRef, setState]);

  return {
    showControls() {
      setState((prev) => ({ ...prev, controlsVisible: true }));
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    },
    armHideTimer(playing: boolean, delay: number = HIDE_DELAY_MS) {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      if (!playing) return;
      hideTimer.current = window.setTimeout(() => {
        setState((prev) => ({ ...prev, controlsVisible: false }));
      }, delay);
    },
    hideAfterPointerLeave() {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => {
        setState((prev) =>
          prev.paused ? prev : { ...prev, controlsVisible: false },
        );
      }, HIDE_LEAVE_DELAY_MS);
    },
  };
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- src/components/video-player/__tests__/hooks.test.ts`

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/video-player/hooks.ts src/components/video-player/__tests__/hooks.test.ts
git commit -m "$(cat <<'EOF'
feat(video-player): add useVideoPlayer hook syncing native video events to atom
EOF
)"
```

---

## Task 19: Create VideoPlayerContainer

**Files:**

- Create: `src/components/video-player/video-player-container.tsx`

- [ ] **Step 1: Write the file**

Create `src/components/video-player/video-player-container.tsx`:

```tsx
import { useAtomValue } from 'jotai';
import { useEffect, useId, useRef } from 'react';
import { videoPlayerStateAtomFamily } from './atoms';
import { useVideoPlayer } from './hooks';
import type { VideoPlayerActions, VideoPlayerProps } from './types';
import { VideoPlayer } from './video-player';

type ContainerProps = Omit<VideoPlayerProps, 'videoRef' | 'rootRef' | 'state' | 'actions'> & {
  playerId?: string;
  onEnded?: () => void;
};

export const VideoPlayerContainer = ({
  playerId: providedId,
  onEnded,
  ...rest
}: ContainerProps) => {
  const generatedId = useId();
  const playerId = providedId ?? generatedId;
  const videoRef = useRef<HTMLVideoElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const state = useAtomValue(videoPlayerStateAtomFamily(playerId));
  const { showControls, armHideTimer, hideAfterPointerLeave } = useVideoPlayer(
    playerId,
    videoRef,
    rootRef,
  );

  const seekTo = (time: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(time)) return;
    v.currentTime = Math.max(0, Math.min(time, v.duration || time));
  };

  const setCaptions = (enabled: boolean) => {
    const v = videoRef.current;
    if (!v) return;
    for (let i = 0; i < v.textTracks.length; i++) {
      const tt = v.textTracks[i];
      tt.mode = enabled && i === 0 ? 'showing' : 'disabled';
    }
  };

  const toggleFullscreen = async () => {
    const root = rootRef.current;
    const v = videoRef.current;
    if (!root) return;
    if (document.fullscreenElement === root) {
      await document.exitFullscreen();
    } else if (root.requestFullscreen) {
      await root.requestFullscreen();
    } else if (v && 'webkitEnterFullscreen' in v) {
      (v as unknown as { webkitEnterFullscreen: () => void }).webkitEnterFullscreen();
    }
  };

  const onKeyboardShortcut = (key: string) => {
    const v = videoRef.current;
    if (!v) return;
    showControls();
    armHideTimer(!state.paused);
    switch (key) {
      case ' ':
      case 'k':
      case 'K':
        if (state.paused) v.play(); else v.pause();
        break;
      case 'ArrowLeft':
        seekTo(state.currentTime - 5);
        break;
      case 'ArrowRight':
        seekTo(state.currentTime + 5);
        break;
      case 'ArrowUp':
        v.muted = false;
        v.volume = Math.min(1, state.volume + 0.1);
        break;
      case 'ArrowDown':
        v.volume = Math.max(0, state.volume - 0.1);
        break;
      case 'm':
      case 'M':
        v.muted = !v.muted;
        break;
      case 'c':
      case 'C':
        if (state.hasCaptions) setCaptions(!state.captionsEnabled);
        break;
      case 'f':
      case 'F':
        void toggleFullscreen();
        break;
      case 'Home':
        seekTo(0);
        break;
      case 'End':
        seekTo(state.duration);
        break;
      default:
        if (/^[0-9]$/.test(key)) {
          const n = Number.parseInt(key, 10);
          seekTo(((state.duration || 0) * n) / 10);
        }
        break;
    }
  };

  const actions: VideoPlayerActions = {
    onPlay: () => videoRef.current?.play(),
    onPause: () => videoRef.current?.pause(),
    onSeek: seekTo,
    onSeekRelative: (delta) => seekTo(state.currentTime + delta),
    onVolumeChange: (volume) => {
      const v = videoRef.current;
      if (!v) return;
      v.muted = false;
      v.volume = Math.max(0, Math.min(1, volume));
    },
    onMuteToggle: () => {
      const v = videoRef.current;
      if (!v) return;
      v.muted = !v.muted;
    },
    onPlaybackRateChange: (rate) => {
      const v = videoRef.current;
      if (!v) return;
      v.playbackRate = rate;
    },
    onCaptionsToggle: () => {
      if (!state.hasCaptions) return;
      setCaptions(!state.captionsEnabled);
    },
    onFullscreenToggle: () => void toggleFullscreen(),
    onRetry: () => {
      videoRef.current?.load();
    },
    onPointerActivity: () => {
      showControls();
      armHideTimer(!state.paused);
    },
    onKeyboardShortcut,
  };

  // Hide controls when pointer leaves the player root
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onLeave = () => hideAfterPointerLeave();
    root.addEventListener('mouseleave', onLeave);
    return () => root.removeEventListener('mouseleave', onLeave);
  }, [hideAfterPointerLeave]);

  // Notify caller when video ends
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !onEnded) return;
    v.addEventListener('ended', onEnded);
    return () => v.removeEventListener('ended', onEnded);
  }, [onEnded]);

  return (
    <VideoPlayer
      {...rest}
      videoRef={videoRef}
      rootRef={rootRef}
      state={state}
      actions={actions}
    />
  );
};
```

- [ ] **Step 2: Type-check and commit**

```bash
pnpm exec tsc -p tsconfig.json --noEmit
git add src/components/video-player/video-player-container.tsx
git commit -m "$(cat <<'EOF'
feat(video-player): add VideoPlayerContainer wiring atoms, refs, and keyboard map
EOF
)"
```

---

## Task 20: Add captions DOM-mode sync effect

**Files:**

- Modify: `src/components/video-player/video-player-container.tsx`

- [ ] **Step 1: Add effect that mirrors `state.captionsEnabled` to native textTracks on mount/changes**

In `src/components/video-player/video-player-container.tsx`, after the existing two `useEffect` blocks (mouseleave + ended) and before `seekTo`, add:

```tsx
useEffect(() => {
  const v = videoRef.current;
  if (!v) return;
  for (let i = 0; i < v.textTracks.length; i++) {
    v.textTracks[i].mode = state.captionsEnabled && i === 0 ? 'showing' : 'disabled';
  }
}, [state.captionsEnabled]);
```

`useEffect` is already imported from Task 19. No new imports.

- [ ] **Step 2: Type-check and commit**

```bash
pnpm exec tsc -p tsconfig.json --noEmit
git add src/components/video-player/video-player-container.tsx
git commit -m "$(cat <<'EOF'
feat(video-player): sync captionsEnabled to native textTracks
EOF
)"
```

---

## Task 21: Add barrel export

**Files:**

- Create: `src/components/video-player/index.ts`

- [ ] **Step 1: Write the file**

Create `src/components/video-player/index.ts`:

```ts
export { VideoPlayer } from './video-player';
export { VideoPlayerContainer } from './video-player-container';
export { videoPlayerStateAtomFamily } from './atoms';
export { formatTime } from './format-time';
export { DEFAULT_LABELS, PLAYBACK_RATES } from './labels';
export type {
  VideoPlayerActions,
  VideoPlayerLabels,
  VideoPlayerProps,
  VideoPlayerState,
  VideoPlayerStatus,
} from './types';
```

- [ ] **Step 2: Type-check and commit**

```bash
pnpm exec tsc -p tsconfig.json --noEmit
git add src/components/video-player/index.ts
git commit -m "$(cat <<'EOF'
feat(video-player): add barrel export for video-player module
EOF
)"
```

---

## Task 22: Storybook stories

**Files:**

- Create: `src/components/video-player/video-player.stories.tsx`

- [ ] **Step 1: Write the file**

Create `src/components/video-player/video-player.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { createRef } from 'react';
import { DEFAULT_LABELS } from './labels';
import { VideoPlayer } from './video-player';

const SAMPLE_SRC =
  'https://download.samplelib.com/mp4/sample-5s.mp4';

const meta: Meta<typeof VideoPlayer> = {
  title: 'video-player/VideoPlayer',
  component: VideoPlayer,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof VideoPlayer>;

const noopActions = {
  onPlay: () => {},
  onPause: () => {},
  onSeek: () => {},
  onMuteToggle: () => {},
  onVolumeChange: () => {},
  onCaptionsToggle: () => {},
  onFullscreenToggle: () => {},
  onPlaybackRateChange: () => {},
  onRetry: () => {},
  onPointerActivity: () => {},
  onKeyboardShortcut: () => {},
};

export const Idle: Story = {
  args: {
    src: SAMPLE_SRC,
    videoRef: createRef<HTMLVideoElement>(),
    state: { hasPlayedOnce: false, status: 'ready' },
    actions: noopActions,
  },
};

export const Loading: Story = {
  args: {
    src: SAMPLE_SRC,
    videoRef: createRef<HTMLVideoElement>(),
    state: { status: 'loading' },
    actions: noopActions,
  },
};

export const Buffering: Story = {
  args: {
    src: SAMPLE_SRC,
    videoRef: createRef<HTMLVideoElement>(),
    state: { status: 'buffering', hasPlayedOnce: true, paused: false },
    actions: noopActions,
  },
};

export const PlayingWithCaptions: Story = {
  args: {
    src: SAMPLE_SRC,
    videoRef: createRef<HTMLVideoElement>(),
    tracks: [
      {
        src: 'https://example.test/captions.vtt',
        srclang: 'en',
        label: 'English',
        kind: 'subtitles',
        default: true,
      },
    ],
    state: {
      hasPlayedOnce: true,
      paused: false,
      status: 'ready',
      currentTime: 12,
      duration: 45,
      bufferedEnd: 30,
      hasCaptions: true,
      captionsEnabled: true,
    },
    actions: noopActions,
  },
};

export const ErrorState: Story = {
  args: {
    src: SAMPLE_SRC,
    videoRef: createRef<HTMLVideoElement>(),
    state: { status: 'error', error: 'Could not load this video.' },
    actions: { ...noopActions, onRetry: () => {} },
    labels: DEFAULT_LABELS,
  },
};

export const MinimalNoActions: Story = {
  args: {
    src: SAMPLE_SRC,
    videoRef: createRef<HTMLVideoElement>(),
  },
};
```

- [ ] **Step 2: Verify Storybook builds**

Run: `pnpm exec tsc -p tsconfig.json --noEmit`

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/video-player/video-player.stories.tsx
git commit -m "$(cat <<'EOF'
feat(video-player): add Storybook stories covering all states
EOF
)"
```

---

## Task 23: Final integration check

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`

Expected: all video-player tests pass; no pre-existing tests broken.

- [ ] **Step 2: Type-check the whole repo**

Run: `pnpm exec tsc -p tsconfig.json --noEmit`

Expected: exit 0.

- [ ] **Step 3: Lint/format**

Run: `pnpm exec biome check src/components/video-player`

Expected: no errors. If formatting drift exists, run `pnpm exec biome format --write src/components/video-player` and stage the changes.

- [ ] **Step 4: Final commit (if anything was reformatted)**

```bash
git add -A src/components/video-player
git diff --cached --quiet || git commit -m "$(cat <<'EOF'
chore(video-player): biome format
EOF
)"
```

---

## Self-review notes

- All 11 spec decisions (control set, prop-shape A, native captions, full keyboard map, auto-hide, loading/error, poster + first-play, buffered fill, time format, required = `src` + `videoRef`, native attribute pass-through) map to a task: control set is implemented across Tasks 9–15, prop shape in Tasks 2 and 16, captions in Tasks 13 + 20, keyboard in Task 19, auto-hide in Tasks 18 + 19, loading/error in Tasks 6, 7 + the pure composer, big-play overlay in Task 8 + 16, buffered fill in Task 11, time format in Tasks 1 + 10, required props locked in Task 16's signature, attribute pass-through via `Omit<...>` in Task 2.
- Spinner uses static text under reduced motion (Task 6); BigPlayButton + controls bar fade are gated by `useReducedMotion` (Tasks 8 + 16).
- The DOM tree from the spec maps 1:1 to Task 16's JSX: `<video>` first, surface button next, big-play overlay, spinner, error overlay, sr-only span, controls bar.
- Tab order matches the spec (play → scrubber is rendered first inside the controls grid, then the controls row).
- Tests cover: format-time edge cases (Task 1), VideoPlayer rendering and graceful degradation (Task 17), useVideoPlayer event sync (Task 18). Container-level integration is exercised through Storybook + manual play, which matches the project pattern (e.g. `app-shell.test.tsx` covers structural concerns; full DOM media playback isn't testable in jsdom).
