// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { toClientAttempt } from '../client-debrief-attempt';

const SECRETS = ['expectedAnswer', 'chunkIds', 'summary', 'context'];
const expectNoSecrets = (value: unknown) => {
  const json = JSON.stringify(value);
  for (const s of SECRETS) expect(json).not.toContain(s);
};

describe('toClientAttempt', () => {
  it('a chunk-format attempt: question text and the pilot-facing grade only', () => {
    const out = toClientAttempt({
      questions: {
        lessonSlug: 'l1',
        questions: [
          {
            id: 'q1',
            type: 'free-text',
            question: 'Why does the wing stall?',
            expectedAnswer: 'Critical AoA.',
            chunkIds: ['v1-c1'],
          },
        ],
        chunks: [{ id: 'v1-c1', title: 'AoA', summary: 'Critical angle.' }],
        context: 'Transcript text',
      },
      answers: [
        {
          questionId: 'q1',
          type: 'free-text',
          score: 40,
          userAnswer: 'Too slow',
          explanation: 'You missed the angle.',
          chunkScores: { 'v1-c1': 40 },
          revisitNote: 'You missed the angle.',
          incorrectClaims: [],
        },
      ],
    });
    expect(out).toEqual({
      questions: [{ id: 'q1', question: 'Why does the wing stall?' }],
      evaluations: [
        {
          questionId: 'q1',
          type: 'free-text',
          score: 40,
          userAnswer: 'Too slow',
          explanation: 'You missed the angle.',
          revisitNote: 'You missed the angle.',
          incorrectClaims: [],
        },
      ],
    });
    expectNoSecrets(out);
  });

  it('a legacy attempt: still renders (essential ideas kept), never the expected answer', () => {
    const out = toClientAttempt({
      questions: {
        lessonSlug: 'l1',
        questions: [
          {
            id: 'q1',
            type: 'free-text',
            question: 'Old one?',
            expectedAnswer: 'The rubric.',
            keyPointIndex: 0,
          },
        ],
      },
      answers: [
        {
          questionId: 'q1',
          type: 'free-text',
          score: 60,
          userAnswer: 'Mine',
          explanation: 'Partly.',
          essentialIdeas: [{ idea: 'Lift', conveyed: 'partly' }],
        },
      ],
    });
    expect(out.questions).toEqual([{ id: 'q1', question: 'Old one?' }]);
    expect(out.evaluations[0].essentialIdeas).toEqual([
      { idea: 'Lift', conveyed: 'partly' },
    ]);
    expectNoSecrets(out);
  });

  it('unreadable JSON → empty arrays', () => {
    expect(toClientAttempt({ questions: 'x', answers: null })).toEqual({
      questions: [],
      evaluations: [],
    });
  });
});
