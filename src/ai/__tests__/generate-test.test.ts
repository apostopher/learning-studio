// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ generateText: vi.fn() }));

vi.mock('ai', () => ({
  generateText: m.generateText,
  Output: { object: (o: unknown) => o },
}));
vi.mock('../ai-provider', () => ({ sonnet: 'sonnet', haiku: 'haiku' }));

import { generateTest } from '../generate-test';
import type { AITestFreeTextQuestion } from '../schemas';

const essay = (id: string): AITestFreeTextQuestion => ({
  id,
  type: 'free-text',
  question: `${id}?`,
  expectedAnswer: `${id} answer`,
  keyPointIndex: 0,
});

const verdicts = (ids: string[], failing: string[] = []) => ({
  output: {
    results: ids.map((questionId) => ({
      questionId,
      pass: !failing.includes(questionId),
      reason: failing.includes(questionId) ? 'quotes the key point' : 'ok',
    })),
    allPassed: failing.length === 0,
  },
});

const SIX = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generateTest', () => {
  it('asks the model for six written questions in two sets of three, and no multiple choice', async () => {
    m.generateText
      .mockResolvedValueOnce({ output: { questions: SIX.map(essay) } })
      .mockResolvedValueOnce(verdicts(SIX));

    const test = await generateTest('l1', ['a', 'b', 'c', 'd'], 'body');

    const prompt = m.generateText.mock.calls[0][0].prompt as string;
    expect(prompt).toMatch(/exactly 6 free-text questions/);
    expect(prompt).toMatch(/Questions 1–3 are the first set/);
    expect(prompt).toMatch(/Questions 4–6 are the second set/);
    expect(prompt).not.toMatch(/MCQ|multiple-choice/i);
    expect(test.questions.map((q) => q.type)).toEqual(
      Array(6).fill('free-text'),
    );
  });

  it('puts a regenerated question back in its own slot, so the sets keep their order', async () => {
    m.generateText
      .mockResolvedValueOnce({ output: { questions: SIX.map(essay) } })
      .mockResolvedValueOnce(verdicts(SIX, ['q2']))
      .mockResolvedValueOnce({ output: { questions: [essay('q2r')] } })
      .mockResolvedValueOnce(verdicts(['q1', 'q2r', 'q3', 'q4', 'q5', 'q6']));

    const test = await generateTest('l1', ['kp'], 'body');

    const optimiserPrompt = m.generateText.mock.calls[2][0].prompt as string;
    expect(optimiserPrompt).toContain('### Question ID: q2');
    expect(optimiserPrompt).not.toContain('### Question ID: q1');
    expect(test.questions.map((q) => q.id)).toEqual([
      'q1',
      'q2r',
      'q3',
      'q4',
      'q5',
      'q6',
    ]);
  });
});
