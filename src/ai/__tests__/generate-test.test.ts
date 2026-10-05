// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ generateText: vi.fn() }));

vi.mock('ai', () => ({
  generateText: m.generateText,
  Output: { object: (o: unknown) => o },
}));
vi.mock('../ai-provider', () => ({ sonnet: 'sonnet', haiku: 'haiku' }));

import { generateTest } from '../generate-test';
import type { AITestMCQQuestion } from '../schemas';

const mcq = (id: string, values: string[]): AITestMCQQuestion => ({
  id,
  type: 'mcq',
  question: `${id}?`,
  options: values.map((value, i) => ({ id: `${id}${'abcd'[i]}`, value })),
  correctOptionId: `${id}b`,
  keyPointIndex: 0,
});

const even = (id: string) =>
  mcq(id, [
    'Climb to the minimum safe altitude',
    'Maintain the last assigned altitude',
    'Descend to the published approach fix',
    'Turn toward the nearest suitable airfield',
  ]);

/** Correct answer (b) is the long, qualified one — the classic tell. */
const giveaway = mcq('q2', [
  'Climb',
  'Maintain the last assigned altitude and squawk 7600 until on the ground',
  'Descend',
  'Turn left',
]);

const allPass = (ids: string[]) => ({
  output: {
    results: ids.map((questionId) => ({
      questionId,
      pass: true,
      reason: 'ok',
    })),
    allPassed: true,
  },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generateTest', () => {
  it('sends a length giveaway to the optimiser even when the evaluator passed it', async () => {
    const fixed = { ...even('q2r') };
    m.generateText
      .mockResolvedValueOnce({ output: { questions: [even('q1'), giveaway] } })
      .mockResolvedValueOnce(allPass(['q1', 'q2']))
      .mockResolvedValueOnce({ output: { questions: [fixed] } })
      .mockResolvedValueOnce(allPass(['q1', 'q2r']));

    const test = await generateTest('l1', ['kp'], 'body');

    // The optimiser is the consumer of the verdict: it must be handed the
    // giveaway question and told why.
    const optimiserPrompt = m.generateText.mock.calls[2][0].prompt as string;
    expect(optimiserPrompt).toContain('### Question ID: q2');
    expect(optimiserPrompt).toMatch(/noticeably longer than every distractor/);
    expect(optimiserPrompt).not.toContain('### Question ID: q1');

    expect(test.questions.map((q) => q.id).sort()).toEqual(['q1', 'q2r']);
  });

  it("does not hand the learner the model's always-B ordering", async () => {
    const ids = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'];
    m.generateText
      .mockResolvedValueOnce({ output: { questions: ids.map(even) } })
      .mockResolvedValueOnce(allPass(ids));

    const test = await generateTest('l1', ['a', 'b', 'c', 'd'], 'body');

    const slots = test.questions.map((q) =>
      q.type === 'mcq'
        ? q.options.findIndex((o) => o.id === q.correctOptionId)
        : -1,
    );
    const counts = [0, 1, 2, 3].map((s) => slots.filter((x) => x === s).length);
    expect(counts).toEqual([2, 2, 2, 2]);
  });
});
