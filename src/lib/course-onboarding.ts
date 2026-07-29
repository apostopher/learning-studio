import type {
  FlatOnboardingQuestion,
  OnboardingAnswers,
  OnboardingQuestions,
} from '#/types';

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const UINT64_MASK = 0xffffffffffffffffn;

/**
 * Flatten the nested category structure into the ordered question list the
 * machine and prompts consume, tagging each question with its category.
 *
 * Category order then question order — the same order the interview runs in,
 * and the order the system prompt presents as authoritative.
 */
export const flattenQuestions = (
  categories: OnboardingQuestions,
): FlatOnboardingQuestion[] =>
  categories.flatMap((category) =>
    category.questions.map((question) => ({
      ...question,
      categoryId: category.id,
      categoryName: category.name,
    })),
  );

/** Total questions across every category. */
export const countQuestions = (categories: OnboardingQuestions): number =>
  categories.reduce((sum, category) => sum + category.questions.length, 0);

/**
 * Whole minutes between `startedAt` and `now`, floored, never negative.
 *
 * Clamped at zero because clock skew between the database (which stamps
 * `created_at`) and the app server can put a just-created row slightly in the
 * future; a negative elapsed time would be nonsense to reason about downstream.
 *
 * NOTE this is total wall-clock span, not active conversation time — a session
 * paused overnight reports the whole gap. That is deliberate: re-offering the
 * stop/suspend/delete controls to someone returning after a long break is
 * useful, and the reminder cooldown stops it repeating.
 */
export const elapsedMinutesSince = (
  startedAt: Date,
  now: Date = new Date(),
): number =>
  Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 60_000));

/**
 * Length-prefixed encoding of the question set. Prefixing each field with its
 * length means no question text can forge a delimiter: a plain `id:text` join
 * would render `{id:'a', text:'b:c'}` and `{id:'a:b', text:'c'}` identically.
 *
 * Category id and name are encoded too, so renaming or reordering a category
 * changes the hash: both alter the interview the user is being given, which is
 * exactly what this hash exists to detect.
 */
const canonicalize = (categories: OnboardingQuestions): string =>
  categories
    .map(
      (category) =>
        `${category.id.length}:${category.id}${category.name.length}:${category.name}` +
        category.questions
          .map((q) => `${q.id.length}:${q.id}${q.text.length}:${q.text}`)
          .join(''),
    )
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
  questions: FlatOnboardingQuestion[],
  answers: OnboardingAnswers,
): FlatOnboardingQuestion[] =>
  questions.filter((q) => !Object.hasOwn(answers, q.id));

/**
 * A user is done only when they finished the flow AND nothing is pending.
 * Both conditions, not either: someone who completed onboarding before three
 * new questions were added is complete-but-pending, which is a distinct state
 * from never-started and from fully-done.
 */
export const isOnboardingComplete = (
  questions: FlatOnboardingQuestion[],
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
  deletedAt: Date | null;
};

/**
 * Whether onboarding should be offered to this user for this course.
 *
 * A declined consent is a decision, not a pending task: it suppresses the
 * offer permanently. The user can still start onboarding themselves — this
 * governs only whether we bring it up.
 *
 * A tombstoned row (deletedAt set) is the same kind of permanent decision:
 * the user asked to delete everything they shared, and re-pitching
 * onboarding on their next visit would be the exact re-offer they withdrew
 * from. Distinct from consentDeclinedAt (never started) and from
 * onboardingCompletedAt (finished) — an admin view needs to tell all three
 * apart.
 *
 * Deliberately NOT folded into isOnboardingComplete: someone who declined or
 * withdrew is not complete, and conflating the two would make an opt-out
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
  (row.onboardingCompletedAt == null &&
    row.consentDeclinedAt == null &&
    row.deletedAt == null);
