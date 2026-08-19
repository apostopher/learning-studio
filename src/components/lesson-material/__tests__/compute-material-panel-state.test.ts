import { describe, expect, it } from 'vitest';
import {
  computeMaterialPanelState,
  isSectionTapRecordingEnabled,
} from '../compute-material-panel-state';

const material = { lessonSlug: 'b', text: 'body' };

describe('computeMaterialPanelState', () => {
  it('reports loading while the query is in flight', () => {
    expect(
      computeMaterialPanelState({
        data: undefined,
        isLoading: true,
        isError: false,
      }),
    ).toEqual({ kind: 'loading' });
  });

  it('reports a retryable error instead of an empty panel when the query fails', () => {
    // The old wrapper did `if (isError || !data) return null` — the material
    // area rendered nothing at all, with no message and no retry, while the
    // player carried on above it.
    expect(
      computeMaterialPanelState({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('material 500'),
      }),
    ).toEqual({ kind: 'error', message: 'material 500' });
  });

  it('reports an error rather than nothing when the query settles with no data', () => {
    expect(
      computeMaterialPanelState({
        data: undefined,
        isLoading: false,
        isError: false,
      }),
    ).toMatchObject({ kind: 'error' });
  });

  it('carries the lock through so the panel can state the reason', () => {
    const state = computeMaterialPanelState({
      data: { locked: true, reason: 'video' },
      isLoading: false,
      isError: false,
    });
    expect(state).toEqual({
      kind: 'locked',
      lock: { locked: true, reason: 'video' },
    });
  });

  it('hands adminBypass to the panel so the bypass is visible, not silent', () => {
    // The route has always returned `adminBypass` and nothing read it, which
    // decision #15 calls out specifically: an admin who sees content cannot
    // otherwise tell a working gate from a broken one.
    expect(
      computeMaterialPanelState({
        data: { locked: false, adminBypass: true, material },
        isLoading: false,
        isError: false,
      }),
    ).toEqual({ kind: 'ready', material, adminBypass: true, readOnly: false });
  });

  it('does not claim a bypass for an ordinary student', () => {
    expect(
      computeMaterialPanelState({
        data: { locked: false, adminBypass: false, material },
        isLoading: false,
        isError: false,
      }),
    ).toEqual({ kind: 'ready', material, adminBypass: false, readOnly: false });
  });

  it('flags a completed out-of-tier lesson as read-only', () => {
    expect(
      computeMaterialPanelState({
        data: { locked: false, adminBypass: false, readOnly: true, material },
        isLoading: false,
        isError: false,
      }),
    ).toEqual({ kind: 'ready', material, adminBypass: false, readOnly: true });
  });

  it('carries readOnly on the empty panel too — a transcript debrief can render with no material row', () => {
    expect(
      computeMaterialPanelState({
        data: {
          locked: false,
          adminBypass: false,
          readOnly: true,
          material: null,
        },
        isLoading: false,
        isError: false,
      }),
    ).toEqual({ kind: 'empty', readOnly: true });
  });

  it('defaults readOnly to false on the empty panel for a normal unlocked lesson', () => {
    expect(
      computeMaterialPanelState({
        data: { locked: false, adminBypass: false, material: null },
        isLoading: false,
        isError: false,
      }),
    ).toEqual({ kind: 'empty', readOnly: false });
  });

  it('prefers loading over a stale error, so a refetch does not flash an error card', () => {
    expect(
      computeMaterialPanelState({
        data: undefined,
        isLoading: true,
        isError: true,
        error: new Error('old'),
      }),
    ).toEqual({ kind: 'loading' });
  });
});

describe('isSectionTapRecordingEnabled', () => {
  it('enables recording for a normal ready panel', () => {
    expect(
      isSectionTapRecordingEnabled({
        kind: 'ready',
        material,
        adminBypass: false,
        readOnly: false,
      }),
    ).toBe(true);
  });

  // The seam this task is about: LessonMaterialWrapper cannot be rendered
  // under Vitest (it calls useRef directly), so this pure function is the
  // only place the "read-only disables recording" guard can go red.
  it('disables recording for a read-only (archive) ready panel', () => {
    expect(
      isSectionTapRecordingEnabled({
        kind: 'ready',
        material,
        adminBypass: false,
        readOnly: true,
      }),
    ).toBe(false);
  });

  it('disables recording while loading', () => {
    expect(isSectionTapRecordingEnabled({ kind: 'loading' })).toBe(false);
  });

  it('disables recording on an error panel', () => {
    expect(isSectionTapRecordingEnabled({ kind: 'error', message: 'x' })).toBe(
      false,
    );
  });

  it('disables recording on an empty panel, even a read-only one', () => {
    expect(
      isSectionTapRecordingEnabled({ kind: 'empty', readOnly: true }),
    ).toBe(false);
  });

  it('disables recording on a locked panel', () => {
    expect(
      isSectionTapRecordingEnabled({
        kind: 'locked',
        lock: { locked: true, reason: 'video' },
      }),
    ).toBe(false);
  });
});
