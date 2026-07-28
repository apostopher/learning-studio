import { describe, expect, it } from 'vitest';
import {
  OnboardingRequestError,
  selectLatestOnboardingError,
} from '#/data-hooks/use-onboarding-chat';

/**
 * `selectLatestOnboardingError` is tested directly, as a pure function,
 * rather than by rendering `useOnboardingChat` through `renderHook`: this
 * repo's vitest setup cannot execute a bare `useRef`/`useCallback`/
 * `useEffect` inside `renderHook` — confirmed with a scratch hook containing
 * nothing but a `useRef`, which throws the same `Cannot read properties of
 * null (reading 'useRef')` this hook did when first exercised this way. None
 * of this repo's other tested data hooks (`use-course-onboarding`,
 * `use-update-course-onboarding`) touch a raw React hook for the same
 * reason — they only wrap `useQuery`/`useMutation`. Extracting the
 * precedence logic into a pure function sidesteps that constraint entirely.
 */
describe('selectLatestOnboardingError', () => {
  it('picks the most recently failed source, not the first-declared one', () => {
    // Regression test for the review's finding: `activeError` used to be
    // `replyMutation.error ?? confirmMutation.error ?? deleteMutation.error
    // ?? query.error` — fixed declaration-order precedence, not recency.
    // Concretely: a reply 409s (seq 1), the user then retries via delete and
    // THAT fails for an unrelated reason (seq 2, later) — the fix must
    // report the delete failure, not the stale reply conflict.
    const replyConflict = new OnboardingRequestError(
      'conflict',
      'This conversation continued elsewhere.',
    );
    const deleteFailure = new OnboardingRequestError(
      'unknown',
      'Failed to delete onboarding session (500)',
    );

    const result = selectLatestOnboardingError([
      { error: replyConflict, seq: 1 },
      { error: null, seq: 0 },
      { error: deleteFailure, seq: 2 },
      { error: null, seq: 0 },
    ]);

    expect(result).toBe(deleteFailure);
    expect(result?.kind).toBe('unknown');
  });

  it('ignores errors that are not an OnboardingRequestError', () => {
    const result = selectLatestOnboardingError([
      { error: new Error('some other error'), seq: 5 },
      { error: null, seq: 0 },
    ]);
    expect(result).toBeNull();
  });

  it('returns null when nothing has failed', () => {
    expect(
      selectLatestOnboardingError([
        { error: null, seq: 0 },
        { error: null, seq: 0 },
      ]),
    ).toBeNull();
  });
});
