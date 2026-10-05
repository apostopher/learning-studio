import { describe, expect, it } from 'vitest';
import {
  balanceAnswerPositions,
  lengthGiveaway,
  withLengthGiveaways,
} from '../mcq-answer-bias';
import type { AITestMCQQuestion, AITestQuestion } from '../schemas';

/** Every MCQ the way the model tends to write it: correct answer is B. */
const mcq = (n: number, values = ['wrong 1', 'RIGHT', 'wrong 2', 'wrong 3']) =>
  ({
    id: `q${n}`,
    type: 'mcq',
    question: `Question ${n}?`,
    options: values.map((value, i) => ({ id: `q${n}${'abcd'[i]}`, value })),
    correctOptionId: `q${n}b`,
    keyPointIndex: 0,
  }) satisfies AITestMCQQuestion;

const freeText: AITestQuestion = {
  id: 'f1',
  type: 'free-text',
  question: 'Explain.',
  expectedAnswer: 'Because.',
  keyPointIndex: 0,
};

/** Seeded PRNG (mulberry32), so a failure is reproducible. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const correctSlot = (q: AITestQuestion) =>
  q.type === 'mcq'
    ? q.options.findIndex((o) => o.id === q.correctOptionId)
    : -1;

describe('balanceAnswerPositions', () => {
  it('uses every slot equally across a quiz, not mostly B', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const out = balanceAnswerPositions(
        Array.from({ length: 8 }, (_, i) => mcq(i + 1)),
        seeded(seed),
      );
      const counts = [0, 0, 0, 0];
      for (const q of out) counts[correctSlot(q)]++;
      expect(counts).toEqual([2, 2, 2, 2]);
    }
  });

  it('never puts the same slot more than twice in a row', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const slots = balanceAnswerPositions(
        Array.from({ length: 12 }, (_, i) => mcq(i + 1)),
        seeded(seed),
      ).map(correctSlot);
      for (let i = 2; i < slots.length; i++) {
        expect(slots[i] === slots[i - 1] && slots[i] === slots[i - 2]).toBe(
          false,
        );
      }
    }
  });

  it('keeps the right answer right', () => {
    const [out] = balanceAnswerPositions([mcq(1)], seeded(3));
    if (out.type !== 'mcq') throw new Error('expected mcq');
    const correct = out.options.find((o) => o.id === out.correctOptionId);
    expect(correct?.value).toBe('RIGHT');
    expect(out.options.map((o) => o.value).sort()).toEqual(
      ['RIGHT', 'wrong 1', 'wrong 2', 'wrong 3'].sort(),
    );
  });

  it("re-ids options by final position, so an id never leaks the model's order", () => {
    const [out] = balanceAnswerPositions([mcq(1)], seeded(7));
    if (out.type !== 'mcq') throw new Error('expected mcq');
    expect(out.options.map((o) => o.id)).toEqual(['q1a', 'q1b', 'q1c', 'q1d']);
  });

  it('leaves free-text questions and quiz order alone', () => {
    const out = balanceAnswerPositions([mcq(1), freeText, mcq(2)], seeded(1));
    expect(out.map((q) => q.id)).toEqual(['q1', 'f1', 'q2']);
    expect(out[1]).toBe(freeText);
  });

  it('passes through a question whose answer is not among its options', () => {
    const broken = { ...mcq(1), correctOptionId: 'nope' };
    expect(balanceAnswerPositions([broken], seeded(1))[0]).toBe(broken);
  });
});

describe('lengthGiveaway', () => {
  it('flags a correct option visibly longer than every distractor', () => {
    const q = mcq(1, [
      'Climb',
      'Maintain altitude and squawk 7600, then follow the last clearance',
      'Descend',
      'Turn left',
    ]);
    expect(lengthGiveaway(q)).toMatch(/noticeably longer/);
  });

  it('allows options of similar length', () => {
    const q = mcq(1, [
      'Climb to the minimum safe altitude',
      'Maintain the last assigned altitude',
      'Descend to the published approach fix',
      'Turn toward the nearest suitable airfield',
    ]);
    expect(lengthGiveaway(q)).toBeNull();
  });

  it('does not flag a correct option that is shorter', () => {
    const q = mcq(1, [
      'Turn toward the nearest suitable airfield immediately',
      'Hold',
      'Descend to the published approach fix',
      'Climb to the minimum safe altitude now',
    ]);
    expect(lengthGiveaway(q)).toBeNull();
  });
});

describe('withLengthGiveaways', () => {
  const long = mcq(1, ['a', 'the long and detailed correct answer', 'b', 'c']);

  it('fails a question the evaluator passed when its answer is a length giveaway', () => {
    const out = withLengthGiveaways(
      [{ questionId: 'q1', pass: true, reason: 'Looks good.' }],
      [long],
    );
    expect(out).toEqual([
      {
        questionId: 'q1',
        pass: false,
        reason: expect.stringMatching(/noticeably longer/),
      },
    ]);
  });

  it("keeps the evaluator's own failure reason alongside", () => {
    const [out] = withLengthGiveaways(
      [{ questionId: 'q1', pass: false, reason: 'Ambiguous.' }],
      [long],
    );
    expect(out.reason).toMatch(/^Ambiguous\. .*noticeably longer/);
  });

  it('adds a verdict for a question the evaluator omitted', () => {
    const out = withLengthGiveaways([], [long]);
    expect(out).toHaveLength(1);
    expect(out[0].pass).toBe(false);
  });

  it("leaves the evaluator's verdicts alone otherwise", () => {
    const results = [{ questionId: 'q2', pass: true, reason: 'Fine.' }];
    expect(withLengthGiveaways(results, [mcq(2), freeText])).toEqual(results);
  });
});
