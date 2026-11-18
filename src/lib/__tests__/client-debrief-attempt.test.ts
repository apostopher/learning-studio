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
      // Before sets: every question shown, no set averages.
      setAverages: [],
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
      setAverages: [],
    });
  });

  describe('a set-format attempt', () => {
    const question = (n: number) => ({
      id: `q${n}`,
      type: 'free-text',
      question: `Question ${n}?`,
      expectedAnswer: `Rubric ${n}.`,
      chunkIds: [`v1-c${n}`],
    });
    const answered = (n: number, score: number) => ({
      questionId: `q${n}`,
      type: 'free-text',
      score,
      userAnswer: `Answer ${n}`,
      explanation: '',
      revisitNote: '',
      feedback: `Viper on ${n}.`,
      chunkScores: { [`v1-c${n}`]: score },
    });
    const row = (answers: unknown[]) => ({
      questions: {
        lessonSlug: 'l1',
        questions: [1, 2, 3, 4, 5, 6].map(question),
        chunks: [{ id: 'v1-c1', title: 'AoA', summary: 'Critical angle.' }],
        context: 'Transcript text',
        sets: [
          ['q1', 'q2', 'q3', 'q4'],
          ['q5', 'q6'],
        ],
      },
      answers,
    });

    it('passed on set 1: set 2 is never shown, one set average', () => {
      const out = toClientAttempt(
        row([
          answered(1, 100),
          answered(2, 80),
          answered(3, 80),
          answered(4, 60),
        ]),
      );
      expect(out.questions.map((q) => q.id)).toEqual(['q1', 'q2', 'q3', 'q4']);
      expect(out.setAverages).toEqual([80]);
      expect(out.evaluations[0].feedback).toBe('Viper on 1.');
      expectNoSecrets(out);
    });

    it('missed set 1 then answered set 2: both sets shown, an average each', () => {
      const out = toClientAttempt(
        row([
          ...[1, 2, 3, 4].map((n) => answered(n, 40)),
          answered(5, 70),
          answered(6, 90),
        ]),
      );
      expect(out.questions.map((q) => q.id)).toEqual([
        'q1',
        'q2',
        'q3',
        'q4',
        'q5',
        'q6',
      ]);
      expect(out.setAverages).toEqual([40, 80]);
    });

    it('a half-answered set has no average yet', () => {
      const out = toClientAttempt(row([answered(1, 90)]));
      expect(out.questions).toHaveLength(4);
      expect(out.setAverages).toEqual([]);
    });
  });
});
