// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ generateObject: vi.fn() }));

vi.mock('ai', () => ({ generateObject: m.generateObject }));
vi.mock('../ai-provider', () => ({ sonnet: 'sonnet' }));

import { evaluateFreeText, scoreFreeTextEval } from '../evaluate-answer';
import type { AITestFreeTextQuestion } from '../schemas';

const question: AITestFreeTextQuestion = {
  id: 'q1',
  type: 'free-text',
  question: 'Your radio fails in IMC. What do you do?',
  expectedAnswer:
    'Set the transponder to 7600 and continue on the last assigned route and altitude.',
  keyPointIndex: 0,
};

beforeEach(() => vi.clearAllMocks());

describe('scoreFreeTextEval', () => {
  const idea = (conveyed: 'fully' | 'partly' | 'not') => ({
    idea: 'x',
    conveyed,
  });

  it('gives full marks when every idea is conveyed', () => {
    expect(
      scoreFreeTextEval({
        essentialIdeas: [idea('fully'), idea('fully')],
        incorrectClaims: [],
      }),
    ).toBe(100);
  });

  it('counts a partly-conveyed idea as half', () => {
    expect(
      scoreFreeTextEval({
        essentialIdeas: [idea('fully'), idea('partly')],
        incorrectClaims: [],
      }),
    ).toBe(75);
  });

  it('takes 25 points off per incorrect claim, never below 0', () => {
    expect(
      scoreFreeTextEval({
        essentialIdeas: [idea('fully')],
        incorrectClaims: ['Squawk 7700 for radio failure'],
      }),
    ).toBe(75);
    expect(
      scoreFreeTextEval({
        essentialIdeas: [idea('not')],
        incorrectClaims: ['a', 'b'],
      }),
    ).toBe(0);
  });

  it('rounds to a whole number', () => {
    expect(
      scoreFreeTextEval({
        essentialIdeas: [idea('fully'), idea('not'), idea('not')],
        incorrectClaims: [],
      }),
    ).toBe(33);
  });
});

describe('evaluateFreeText', () => {
  it("scores from the grader's per-idea judgements, not a number it chose", async () => {
    // A terse expert answer: same meaning as the reference, none of its words.
    m.generateObject.mockResolvedValue({
      object: {
        essentialIdeas: [
          { idea: 'Transponder to the radio-failure code', conveyed: 'fully' },
          { idea: 'Continue on the last clearance', conveyed: 'fully' },
        ],
        incorrectClaims: [],
        explanation: 'Spot on.',
      },
    });

    const result = await evaluateFreeText(
      question,
      'Squawk 7600, fly last ATC clearance.',
      ['kp'],
      'body',
    );

    expect(result).toEqual({
      questionId: 'q1',
      type: 'free-text',
      score: 100,
      userAnswer: 'Squawk 7600, fly last ATC clearance.',
      explanation: 'Spot on.',
    });
  });

  it('tells the grader to judge meaning, with the reference as one phrasing', async () => {
    m.generateObject.mockResolvedValue({
      object: {
        essentialIdeas: [{ idea: 'x', conveyed: 'fully' }],
        incorrectClaims: [],
        explanation: '.',
      },
    });

    await evaluateFreeText(question, 'Squawk 7600.', ['kp'], 'body');

    const prompt = m.generateObject.mock.calls[0][0].prompt as string;
    expect(prompt).toMatch(/grade what the student MEANS/);
    expect(prompt).toMatch(/ONE correct phrasing, not a template/);
    expect(prompt).toContain(question.expectedAnswer);
    // The answer is fenced as data, so it cannot pose as grading instructions.
    expect(prompt).toContain(
      '<student_answer>\nSquawk 7600.\n</student_answer>',
    );
  });
});
