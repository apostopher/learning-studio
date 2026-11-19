// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ generateObject: vi.fn() }));

vi.mock('ai', () => ({ generateObject: m.generateObject }));
vi.mock('../ai-provider', () => ({ sonnet: 'sonnet' }));

import { CHUNK_CLEAR_SCORE } from '#/lib/debrief-mastery';
import {
  evaluateFreeText,
  groundedClaims,
  scoreChunkJudgement,
} from '../evaluate-answer';
import type { AITestFreeTextQuestion } from '../schemas';

const chunks = [
  { id: 'v2-c1', title: 'Radio-failure code', summary: 'Squawk 7600.' },
  { id: 'v2-c2', title: 'Last clearance', summary: 'Fly the last route.' },
  { id: 'v2-c3', title: 'Unrelated chunk', summary: 'Hold entries.' },
];

const question: AITestFreeTextQuestion = {
  id: 'q1',
  type: 'free-text',
  question: 'Your radio fails in IMC. What do you do?',
  expectedAnswer:
    'Set the transponder to 7600 and continue on the last assigned route and altitude.',
  chunkIds: ['v2-c1', 'v2-c2'],
};

const judgement = (
  chunkId: string,
  conveyed: 'fully' | 'mostly' | 'partly' | 'not',
) => ({
  chunkId,
  conveyed,
  note: `${chunkId} ${conveyed}`,
});

beforeEach(() => vi.clearAllMocks());

describe('scoreChunkJudgement', () => {
  it('scores fully 100, mostly 80, partly 50, not 0', () => {
    expect(scoreChunkJudgement(judgement('a', 'fully'), 0)).toBe(100);
    expect(scoreChunkJudgement(judgement('a', 'mostly'), 0)).toBe(80);
    expect(scoreChunkJudgement(judgement('a', 'partly'), 0)).toBe(50);
    expect(scoreChunkJudgement(judgement('a', 'not'), 0)).toBe(0);
  });

  it('takes 25 off per incorrect claim, at most half of what was earned', () => {
    expect(scoreChunkJudgement(judgement('a', 'fully'), 1)).toBe(75);
    expect(scoreChunkJudgement(judgement('a', 'fully'), 3)).toBe(50);
    expect(scoreChunkJudgement(judgement('a', 'partly'), 1)).toBe(25);
    expect(scoreChunkJudgement(judgement('a', 'not'), 4)).toBe(0);
  });
});

describe('evaluateFreeText', () => {
  it('scores each chunk, applying the claim penalty per chunk, and averages them', async () => {
    m.generateObject.mockResolvedValue({
      object: {
        chunkJudgements: [
          judgement('v2-c1', 'fully'),
          judgement('v2-c2', 'partly'),
        ],
        incorrectClaims: [{ quote: 'Squawk 7700', problem: 'It is 7600.' }],
        revisitNote: 'You missed the route.',
        feedback: 'Viper says this.',
      },
    });

    const result = await evaluateFreeText(
      question,
      'Squawk 7700.',
      chunks,
      'body',
    );

    expect(result).toEqual({
      questionId: 'q1',
      type: 'free-text',
      score: 50,
      userAnswer: 'Squawk 7700.',
      explanation: 'You missed the route.',
      chunkScores: { 'v2-c1': 75, 'v2-c2': 25 },
      revisitNote: 'You missed the route.',
      feedback: 'Viper says this.',
      incorrectClaims: ['"Squawk 7700" — It is 7600.'],
    });
  });

  it('always carries the feedback, trimmed, even when the revisit note is forced empty', async () => {
    // The pilot reads `feedback` the moment they submit, a perfect answer
    // included: it must reach the result whatever the revisit note does.
    m.generateObject.mockResolvedValue({
      object: {
        chunkJudgements: [
          judgement('v2-c1', 'fully'),
          judgement('v2-c2', 'fully'),
        ],
        incorrectClaims: [],
        revisitNote: 'Nothing to add.',
        feedback: '  Spot on: 7600 and the last route.  ',
      },
    });
    const result = await evaluateFreeText(question, 'a', chunks, 'body');
    expect(result.revisitNote).toBe('');
    expect(result.feedback).toBe('Spot on: 7600 and the last route.');
  });

  it('forces an empty revisitNote when everything is fully conveyed with no incorrect claims', async () => {
    m.generateObject.mockResolvedValue({
      object: {
        chunkJudgements: [
          judgement('v2-c1', 'fully'),
          judgement('v2-c2', 'fully'),
        ],
        incorrectClaims: [],
        revisitNote: 'Nice, but maybe revisit something.',
        feedback: 'Viper says this.',
      },
    });
    const result = await evaluateFreeText(question, 'a', chunks, 'body');
    expect(result.revisitNote).toBe('');
    expect(result.score).toBe(100);
  });

  it('keeps the note when a fully conveyed answer still has an incorrect claim', async () => {
    m.generateObject.mockResolvedValue({
      object: {
        chunkJudgements: [judgement('v2-c1', 'fully')],
        incorrectClaims: [{ quote: 'wrong thing', problem: 'Not so.' }],
        revisitNote: 'One claim was wrong.',
        feedback: 'Viper says this.',
      },
    });
    const result = await evaluateFreeText(
      { ...question, chunkIds: ['v2-c1'] },
      'I said a wrong thing.',
      chunks,
      'body',
    );
    expect(result.revisitNote).toBe('One claim was wrong.');
  });

  it('a mostly-conveyed chunk clears, so a strong answer missing one nuance passes', async () => {
    m.generateObject.mockResolvedValue({
      object: {
        chunkJudgements: [judgement('v2-c1', 'mostly')],
        incorrectClaims: [],
        revisitNote: 'Also mention the route.',
        feedback: 'Viper says this.',
      },
    });
    const result = await evaluateFreeText(
      { ...question, chunkIds: ['v2-c1'] },
      'a',
      chunks,
      'body',
    );
    expect(result.chunkScores?.['v2-c1']).toBeGreaterThanOrEqual(
      CHUNK_CLEAR_SCORE,
    );
    // The gap is still logged for Viper.
    expect(result.revisitNote).toBe('Also mention the route.');
  });

  it('charges no penalty for a claim the student never made', async () => {
    m.generateObject.mockResolvedValue({
      object: {
        chunkJudgements: [judgement('v2-c1', 'fully')],
        incorrectClaims: [
          { quote: 'the Red Baron flew it', problem: 'He did not.' },
        ],
        revisitNote: 'Watch the Red Baron detail.',
        feedback: 'Viper says this.',
      },
    });
    const result = await evaluateFreeText(
      { ...question, chunkIds: ['v2-c1'] },
      'Squawk 7600 and fly the last clearance.',
      chunks,
      'body',
    );
    expect(result.score).toBe(100);
    expect(result.incorrectClaims).toEqual([]);
    expect(result.revisitNote).toBe('');
  });

  it('ignores judgements for chunks the question did not cite, and scores a missing judgement as not conveyed', async () => {
    m.generateObject.mockResolvedValue({
      object: {
        chunkJudgements: [
          judgement('v2-c1', 'fully'),
          judgement('v2-c3', 'fully'),
        ],
        incorrectClaims: [],
        revisitNote: 'Route missing.',
        feedback: 'Viper says this.',
      },
    });
    const result = await evaluateFreeText(question, 'a', chunks, 'body');
    expect(result.chunkScores).toEqual({ 'v2-c1': 100, 'v2-c2': 0 });
    expect(result.score).toBe(50);
  });

  it('lists only the question’s chunks in the grader prompt, and fences the answer', async () => {
    m.generateObject.mockResolvedValue({
      object: {
        chunkJudgements: [judgement('v2-c1', 'fully')],
        incorrectClaims: [],
        revisitNote: '',
        feedback: 'Viper says this.',
      },
    });

    await evaluateFreeText(
      { ...question, chunkIds: ['v2-c1'] },
      'Squawk 7600.',
      chunks,
      'body',
    );

    const prompt = m.generateObject.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('v2-c1');
    expect(prompt).toContain('Radio-failure code');
    expect(prompt).not.toContain('v2-c2');
    expect(prompt).not.toContain('Unrelated chunk');
    expect(prompt).toMatch(/grade what the student MEANS/);
    expect(prompt).toMatch(/ONE correct phrasing, not a template/);
    expect(prompt).toContain(question.expectedAnswer);
    expect(prompt).toMatch(/Analogies, comparisons, opinions/);
    expect(prompt).toMatch(/never also an incorrect claim/);
    expect(prompt).toMatch(/as far as the question asks about it/);
    expect(prompt).toMatch(/Never mark a chunk down for an example/);
    expect(prompt).toMatch(/more than one defensible answer/);
    expect(prompt).toMatch(/never agreement with the reference/);
    expect(prompt).toMatch(/copy the student's exact words into `quote`/);
    expect(prompt).toContain(
      '<student_answer>\nSquawk 7600.\n</student_answer>',
    );
  });

  it('leaves a cited chunk the lesson no longer has out of chunkScores', async () => {
    m.generateObject.mockResolvedValue({
      object: {
        chunkJudgements: [judgement('v2-c1', 'fully')],
        incorrectClaims: [],
        revisitNote: '',
        feedback: 'Viper says this.',
      },
    });
    const result = await evaluateFreeText(
      { ...question, chunkIds: ['v2-c1', 'v1-gone'] },
      'a',
      chunks,
      'body',
    );
    expect(result.chunkScores).toEqual({ 'v2-c1': 100 });
    expect(result.score).toBe(100);
  });

  it('throws when none of the cited chunks are known', async () => {
    await expect(
      evaluateFreeText(
        { ...question, chunkIds: ['nope'] },
        'a',
        chunks,
        'body',
      ),
    ).rejects.toThrow(/chunks/);
    expect(m.generateObject).not.toHaveBeenCalled();
  });

  it('throws for a legacy question with no chunkIds', async () => {
    const { chunkIds: _omitted, ...legacy } = question;
    await expect(evaluateFreeText(legacy, 'a', chunks, 'body')).rejects.toThrow(
      /no chunkIds/,
    );
  });
});

describe('groundedClaims', () => {
  it('keeps a claim quoted from the answer, ignoring case, quotes and spacing', () => {
    expect(
      groundedClaims(
        [{ quote: '“Squawk  7700”', problem: 'It is 7600.' }],
        'First I would squawk 7700, then descend.',
      ),
    ).toEqual(['"“Squawk  7700”" — It is 7600.']);
  });

  it('drops a claim whose quote is not in the answer, or is empty', () => {
    expect(
      groundedClaims(
        [
          { quote: 'squawk 7500', problem: 'x' },
          { quote: '  ', problem: 'y' },
        ],
        'First I would squawk 7700.',
      ),
    ).toEqual([]);
  });
});
