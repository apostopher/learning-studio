import type { LessonPlayback } from '#/lib/admin-schemas';

export type VideoPreviewState =
  | { kind: 'empty' }
  | { kind: 'ready'; playback: Extract<LessonPlayback, { status: 'ready' }> }
  | { kind: 'rendering' }
  | { kind: 'failed' };

/**
 * What the admin video preview shows for a resolved playback query, decided
 * as a pure function. `VideoSectionContainer` calls hooks (jotai + TanStack
 * Query) and so cannot be rendered under this repo's Vitest setup — the
 * react-compiler nulls the dispatcher for any component that calls
 * `useEffect` (see compute-material-panel-state.ts and
 * compute-player-overlay.ts for the same wall, and confirmed here directly:
 * even a trivial standalone component with a bare `useEffect` crashes
 * `render()` with "Cannot read properties of null (reading 'useEffect')").
 *
 * Extracted specifically because `resolvePlayback` stopped throwing for a
 * not-yet-rendered Synthesia video and started returning a `status` instead
 * (lesson-keyed video runtime migration, Task 1) — without this, "rendering"
 * and "failed" have no home a test can reach, and the two outcomes silently
 * collapse into whatever `VideoPreview`'s blank placeholder happens to show,
 * which reads identically to "nothing configured".
 */
export function computeVideoPreviewState(
  playback: LessonPlayback | null | undefined,
): VideoPreviewState {
  if (!playback) return { kind: 'empty' };
  if (playback.status === 'ready') return { kind: 'ready', playback };
  return playback.status === 'rendering'
    ? { kind: 'rendering' }
    : { kind: 'failed' };
}
