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

const chunk = (id: string) => ({
  id,
  title: `Title of ${id}`,
  summary: `Summary of ${id}`,
});
const CHUNKS = ['c1', 'c6', 'c7', 'c99x'].map(chunk);

const essay = (id: string, chunkIds: string[]): AITestFreeTextQuestion => ({
  id,
  type: 'free-text',
  question: `${id}?`,
  expectedAnswer: `${id} answer`,
  chunkIds,
});

const verdicts = (ids: string[], failing: string[] = []) => ({
  output: {
    results: ids.map((questionId) => ({
      questionId,
      pass: !failing.includes(questionId),
      reason: failing.includes(questionId) ? 'quotes the chunk' : 'ok',
    })),
    allPassed: failing.length === 0,
  },
});

const focus = { holes: ['c6', 'c7'], review: ['c1'] };
const base = {
  lessonSlug: 'l1',
  chunks: CHUNKS,
  context: 'body',
  focus,
  avoidQuestions: [] as string[],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generateTest', () => {
  it('puts each hole chunk title + summary and the avoid-list in the prompt, no MCQ', async () => {
    m.generateText
      .mockResolvedValueOnce({
        output: {
          questions: [
            essay('a', ['c6']),
            essay('b', ['c7']),
            essay('c', ['c1']),
          ],
        },
      })
      .mockResolvedValueOnce(verdicts(['q1', 'q2', 'q3']));

    await generateTest({
      ...base,
      avoidQuestions: ['What squawk do you set?'],
    });

    const prompt = m.generateText.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('Title of c6');
    expect(prompt).toContain('Summary of c6');
    expect(prompt).toContain('Title of c7');
    expect(prompt).toContain('Summary of c1');
    expect(prompt).toContain('What squawk do you set?');
    expect(prompt).toMatch(/exactly 3 free-text questions/);
    expect(prompt).not.toMatch(/MCQ|multiple-choice/i);
  });

  it('returns one question per slot (holes then review), ids q1..qN, chunkIds[0] = slot', async () => {
    m.generateText
      .mockResolvedValueOnce({
        output: {
          questions: [
            essay('x', ['c6']),
            essay('y', ['c7', 'c1']),
            essay('z', ['c1']),
          ],
        },
      })
      .mockResolvedValueOnce(verdicts(['q1', 'q2', 'q3']));

    const test = await generateTest(base);

    expect(test.lessonSlug).toBe('l1');
    expect(test.questions.map((q) => q.id)).toEqual(['q1', 'q2', 'q3']);
    expect(
      test.questions.map((q) => (q as AITestFreeTextQuestion).chunkIds[0]),
    ).toEqual(['c6', 'c7', 'c1']);
  });

  it('replaces a question citing an unknown chunk via the optimise path', async () => {
    m.generateText
      .mockResolvedValueOnce({
        output: {
          questions: [
            essay('a', ['c6']),
            essay('b', ['c99']),
            essay('c', ['c1']),
          ],
        },
      })
      .mockResolvedValueOnce(verdicts(['q1', 'q2', 'q3']))
      .mockResolvedValueOnce({ output: { questions: [essay('b2', ['c7'])] } });

    const test = await generateTest(base);

    // generate, evaluate (all pass), then one corrective optimise call.
    expect(m.generateText).toHaveBeenCalledTimes(3);
    const optimiserPrompt = m.generateText.mock.calls[2][0].prompt as string;
    expect(optimiserPrompt).toContain('### Question ID: q2');
    expect(optimiserPrompt).not.toContain('### Question ID: q1');
    expect(optimiserPrompt).toContain('c99');
    expect(
      test.questions.map((q) => (q as AITestFreeTextQuestion).chunkIds),
    ).toEqual([['c6'], ['c7'], ['c1']]);
  });

  it('forces chunkIds to [slot] when the retry is still wrong, never dropping a slot', async () => {
    m.generateText
      .mockResolvedValueOnce({
        output: {
          questions: [
            essay('a', ['c6']),
            essay('b', ['c99']),
            essay('c', ['c1']),
          ],
        },
      })
      .mockResolvedValueOnce(verdicts(['q1', 'q2', 'q3']))
      .mockResolvedValueOnce({ output: { questions: [essay('b2', ['c42'])] } });

    const test = await generateTest(base);

    expect(test.questions).toHaveLength(3);
    const b = test.questions[1] as AITestFreeTextQuestion;
    expect(b.id).toBe('q2');
    expect(b.question).toBe('b2?');
    expect(b.chunkIds).toEqual(['c7']);
  });

  it('puts a regenerated question back in its own slot', async () => {
    m.generateText
      .mockResolvedValueOnce({
        output: {
          questions: [
            essay('a', ['c6']),
            essay('b', ['c7']),
            essay('c', ['c1']),
          ],
        },
      })
      .mockResolvedValueOnce(verdicts(['q1', 'q2', 'q3'], ['q2']))
      .mockResolvedValueOnce({ output: { questions: [essay('br', ['c7'])] } })
      .mockResolvedValueOnce(verdicts(['q1', 'q2', 'q3']));

    const test = await generateTest(base);

    const optimiserPrompt = m.generateText.mock.calls[2][0].prompt as string;
    expect(optimiserPrompt).toContain('### Question ID: q2');
    expect(optimiserPrompt).not.toContain('### Question ID: q1');
    expect(
      test.questions.map((q) => (q as AITestFreeTextQuestion).question),
    ).toEqual(['a?', 'br?', 'c?']);
  });
});
