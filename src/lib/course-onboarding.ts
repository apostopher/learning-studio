import type { OnboardingAnswers, OnboardingQuestions } from '#/types';

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const UINT64_MASK = 0xffffffffffffffffn;

/**
 * Length-prefixed encoding of the question set. Prefixing each field with its
 * length means no question text can forge a delimiter: a plain `id:text` join
 * would render `{id:'a', text:'b:c'}` and `{id:'a:b', text:'c'}` identically.
 */
const canonicalize = (questions: OnboardingQuestions): string =>
  questions
    .map((q) => `${q.id.length}:${q.id}${q.text.length}:${q.text}`)
    .join('');

/**
 * Stable hash of a course's onboarding question set — order-sensitive, over
 * both id and text.
 *
 * FNV-1a (64-bit), not a cryptographic hash: this only detects whether an
 * admin changed the question set, so there is no adversary to resist. It is
 * synchronous and dependency-free, so it produces identical output on the
 * server and in the browser.
 */
export const hashQuestionSet = (questions: OnboardingQuestions): string => {
  const bytes = new TextEncoder().encode(canonicalize(questions));
  let hash = FNV_OFFSET_BASIS;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME) & UINT64_MASK;
  }
  return hash.toString(16).padStart(16, '0');
};

/**
 * The course's questions that have no answer yet — the source of truth for
 * what to prompt. Derived from the data, never from questionSetHash.
 *
 * A key present in `answers` counts as answered even when the value is an
 * empty string: the user visited that question and left it blank, and
 * re-prompting them forever would be wrong. Callers must therefore only write
 * a key for a question the user actually visited.
 *
 * Uses Object.hasOwn rather than `in` so a question with id `toString` or
 * `constructor` is not silently treated as answered.
 */
export const pendingQuestions = (
  questions: OnboardingQuestions,
  answers: OnboardingAnswers,
): OnboardingQuestions =>
  questions.filter((q) => !Object.hasOwn(answers, q.id));

/**
 * A user is done only when they finished the flow AND nothing is pending.
 * Both conditions, not either: someone who completed onboarding before three
 * new questions were added is complete-but-pending, which is a distinct state
 * from never-started and from fully-done.
 */
export const isOnboardingComplete = (
  questions: OnboardingQuestions,
  answers: OnboardingAnswers,
  onboardingCompletedAt: Date | null,
): boolean =>
  // Loose `!= null` is deliberate, not a typo: it also catches `undefined`
  // arriving here across a serialization boundary (e.g. JSON), where the
  // typed `Date | null` signature no longer holds. Do not tighten to `!==`.
  onboardingCompletedAt != null &&
  pendingQuestions(questions, answers).length === 0;

export type OnboardingOfferState = {
  onboardingCompletedAt: Date | null;
  consentDeclinedAt: Date | null;
};

/**
 * Whether onboarding should be offered to this user for this course.
 *
 * A declined consent is a decision, not a pending task: it suppresses the
 * offer permanently. The user can still start onboarding themselves — this
 * governs only whether we bring it up.
 *
 * Deliberately NOT folded into isOnboardingComplete: someone who declined is
 * not complete, they opted out, and conflating the two would make an opt-out
 * indistinguishable from a finished interview in any admin view.
 *
 * Loose null checks (`== null`) are deliberate — do not tighten to `===`.
 * They catch a timestamp arriving as undefined across a serialization
 * boundary, same as isOnboardingComplete above.
 */
export const shouldOfferOnboarding = (
  row: OnboardingOfferState | null,
): boolean =>
  row == null ||
  (row.onboardingCompletedAt == null && row.consentDeclinedAt == null);
