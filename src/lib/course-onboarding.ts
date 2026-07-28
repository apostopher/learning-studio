import type { OnboardingQuestions } from '#/types';

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
