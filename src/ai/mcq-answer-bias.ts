import type {
  AITestMCQQuestion,
  AITestQuestion,
  QuestionQuality,
} from './schemas';

/**
 * The two tells that let a learner pass an MCQ debrief without knowing the
 * material: the correct answer sits in the same slot (the model favours B),
 * and the correct answer is the longest, most qualified option.
 *
 * Position is fixed in code, not by asking the model — models are bad at
 * randomness, and a prompt can only make the bias less likely. Length cannot
 * be fixed after the fact without rewriting options, so it is detected here
 * and sent back through the optimiser like any other quality failure.
 */

const LETTERS = ['a', 'b', 'c', 'd'] as const;

/**
 * How much longer than the longest distractor the correct option may be
 * before it reads as the giveaway. A few extra characters are noise; a fifth
 * longer is visibly the "most complete" answer.
 */
const LENGTH_GIVEAWAY_RATIO = 1.2;

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Target slot for each MCQ's correct answer, in quiz order.
 *
 * Shuffled blocks of [0, 1, 2, 3] rather than an independent random slot per
 * question: independent draws regularly land the same slot three or four times
 * in a short quiz, which is its own pattern. Blocks keep every slot used about
 * equally while the order stays unpredictable.
 */
function targetSlots(count: number, random: () => number): number[] {
  const slots: number[] = [];
  while (slots.length < count) {
    slots.push(...shuffle([0, 1, 2, 3], random));
  }
  return slots.slice(0, count);
}

/**
 * Reorders every MCQ's options so the correct answer is spread evenly across
 * A–D, with the distractors shuffled around it.
 *
 * Option ids are reassigned by final position (`q1a`…`q1d`) and
 * `correctOptionId` remapped to match, so an id never carries the model's
 * original ordering. A question whose `correctOptionId` names none of its
 * options is passed through untouched — there is no right answer to place.
 */
export function balanceAnswerPositions(
  questions: AITestQuestion[],
  random: () => number = Math.random,
): AITestQuestion[] {
  const mcqCount = questions.filter((q) => q.type === 'mcq').length;
  const slots = targetSlots(mcqCount, random);
  let mcqIndex = 0;

  return questions.map((question) => {
    if (question.type !== 'mcq') return question;
    const slot = slots[mcqIndex++];

    const correct = question.options.find(
      (o) => o.id === question.correctOptionId,
    );
    if (!correct) return question;

    const ordered = shuffle(
      question.options.filter((o) => o !== correct),
      random,
    );
    ordered.splice(slot, 0, correct);

    const options = ordered.map((option, i) => ({
      id: `${question.id}${LETTERS[i]}`,
      value: option.value,
    }));
    return {
      ...question,
      options,
      correctOptionId: options[slot].id,
    };
  });
}

/**
 * Why this MCQ's correct option gives itself away by length, or null.
 *
 * Measured on trimmed text, so markdown padding does not count.
 */
export function lengthGiveaway(question: AITestMCQQuestion): string | null {
  const correct = question.options.find(
    (o) => o.id === question.correctOptionId,
  );
  if (!correct) return null;
  const longestDistractor = Math.max(
    ...question.options
      .filter((o) => o !== correct)
      .map((o) => o.value.trim().length),
  );
  const correctLength = correct.value.trim().length;
  if (correctLength <= longestDistractor * LENGTH_GIVEAWAY_RATIO) return null;
  return `The correct option is noticeably longer than every distractor (${correctLength} vs at most ${longestDistractor} characters), so a learner can pick it without knowing the answer. Rewrite so all four options are similar in length and level of detail — lengthen the distractors with plausible specifics or tighten the correct option.`;
}

/**
 * The evaluator's verdicts with the length check folded in.
 *
 * A question the evaluator passed but which fails the length check is turned
 * into a failure carrying the length reason, so the optimiser — which reads
 * these reasons — is told exactly what to fix. A question the evaluator
 * omitted entirely still gets a verdict if it fails.
 */
export function withLengthGiveaways(
  results: QuestionQuality[],
  questions: AITestQuestion[],
): QuestionQuality[] {
  const merged = new Map(results.map((r) => [r.questionId, r]));
  for (const question of questions) {
    if (question.type !== 'mcq') continue;
    const reason = lengthGiveaway(question);
    if (!reason) continue;
    const existing = merged.get(question.id);
    merged.set(question.id, {
      questionId: question.id,
      pass: false,
      reason:
        existing && !existing.pass ? `${existing.reason} ${reason}` : reason,
    });
  }
  return [...merged.values()];
}
