import type { LessonMaterialResponse } from '#/lib/lesson-gating';

export type MaterialPanelState<TMaterial> =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | {
      kind: 'locked';
      lock: Extract<LessonMaterialResponse<TMaterial>, { locked: true }>;
    }
  | { kind: 'ready'; material: TMaterial; adminBypass: boolean };

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
  return {
    kind: 'ready',
    material: data.material,
    adminBypass: data.adminBypass,
  };
}
