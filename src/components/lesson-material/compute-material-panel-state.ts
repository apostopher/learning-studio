import {
  isMaterialReadOnly,
  type LessonMaterialResponse,
} from '#/lib/lesson-gating';

export type MaterialPanelState<TMaterial> =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  /**
   * Unlocked, but this lesson has no material row. A normal shape for a
   * video-only lesson — not an error, and deliberately not 'ready' so the tab
   * strip is never rendered with nothing behind any of its tabs.
   *
   * `readOnly` still matters here: a transcript-sourced debrief can render
   * with no material row at all (see LessonMaterialWrapper's 'empty' branch),
   * and its writes must stay inert the same as a 'ready' panel's.
   */
  | { kind: 'empty'; readOnly: boolean }
  | {
      kind: 'locked';
      lock: Extract<LessonMaterialResponse<TMaterial>, { locked: true }>;
    }
  | {
      kind: 'ready';
      material: TMaterial;
      adminBypass: boolean;
      /** The lesson was completed at an earlier level — every write here must be inert. */
      readOnly: boolean;
    };

export type MaterialPanelQuery<TMaterial> = {
  data: LessonMaterialResponse<TMaterial> | undefined;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
};

/**
 * What the material panel renders, decided as a pure function.
 *
 * Extracted for two reasons, both of which were live defects:
 *
 * 1. `adminBypass` was produced by the route and read by nothing. Returning it
 *    from here gives it a consumer a test can assert on, rather than a boolean
 *    that exists only in a JSON payload.
 * 2. The wrapper used to answer a failed query with `return null` — a blank
 *    panel, no message, no retry. `'error'` makes that outcome impossible to
 *    express by accident.
 *
 * Pure because `LessonMaterialWrapper` calls hooks and so cannot be rendered
 * under Vitest (react-compiler nulls the dispatcher — see
 * compute-player-overlay.ts and lesson-main.test.tsx for the same wall). The
 * retry callback is deliberately NOT modelled here: it needs the query client,
 * and a state object carrying a function is harder to assert on than one
 * carrying data.
 */
export function computeMaterialPanelState<TMaterial>({
  data,
  isLoading,
  isError,
  error,
}: MaterialPanelQuery<TMaterial>): MaterialPanelState<TMaterial> {
  if (isLoading) return { kind: 'loading' };
  // `!data` is folded into the error branch on purpose: settled-with-no-data
  // is not a state this endpoint has (it either 200s with a body or throws in
  // the query fn), and if it ever happens, an explanation with a retry beats
  // an empty panel.
  if (isError || !data) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : 'Something went wrong',
    };
  }
  if (data.locked) return { kind: 'locked', lock: data };
  const readOnly = isMaterialReadOnly(data);
  if (data.material === null) return { kind: 'empty', readOnly };
  return {
    kind: 'ready',
    material: data.material,
    adminBypass: data.adminBypass,
    readOnly,
  };
}

/**
 * Whether a material-tab tap should be recorded — `LessonMaterialWrapper`'s
 * `enabled` for `useSectionTapRecorder`.
 *
 * Pulled out, rather than left as an inline `state.kind === 'ready' &&
 * !state.readOnly` at the call site, so the read-only write-guard has a test
 * that does not require rendering `LessonMaterialWrapper` — that component
 * calls `useRef` directly and so hits the same Vitest wall documented on
 * `computeMaterialPanelState` above.
 */
export function isSectionTapRecordingEnabled<TMaterial>(
  state: MaterialPanelState<TMaterial>,
): boolean {
  return state.kind === 'ready' && !state.readOnly;
}
