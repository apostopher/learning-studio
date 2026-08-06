import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flattenQuestions } from '#/lib/course-onboarding';
import { SKA_SECTION_MAX_CHARS } from '#/types';

const { generateObject } = vi.hoisted(() => ({ generateObject: vi.fn() }));
vi.mock('ai', () => ({ generateObject }));

import {
  generateSkaProfile,
  generateSkaProfileWithRetry,
} from '#/ai/onboarding/generate-ska-profile';

const QUESTIONS = flattenQuestions([
  {
    id: 'c1',
    name: 'Background',
    questions: [
      { id: 'q1', text: 'What is your background?' },
      { id: 'q2', text: 'How do you learn best?' },
      { id: 'q3', text: 'How do you feel about the exam?' },
    ],
  },
]);

const TRANSCRIPT = [
  { role: 'assistant' as const, text: 'Tell me about your background.' },
  { role: 'user' as const, text: 'Six years on gliders.' },
];

const INPUT = {
  courseName: 'PPL',
  questions: QUESTIONS,
  answers: { q1: 'Six years on gliders.', q2: '' },
  transcript: TRANSCRIPT,
};

const PROFILE = {
  skills: 'Flies gliders.',
  knowledge: null,
  attitude: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  generateObject.mockResolvedValue({ object: PROFILE });
});

describe('generateSkaProfile', () => {
  it('sends the full transcript to the model', async () => {
    await generateSkaProfile(INPUT);

    // Attitude is not recoverable from the answers map — it lives in HOW
    // someone answered, which only the transcript records. If the prompt ever
    // stops carrying it, the Attitude section becomes guesswork.
    const { prompt } = generateObject.mock.calls[0][0];
    expect(prompt).toContain('Six years on gliders.');
    expect(prompt).toContain('Tell me about your background.');
  });

  it('marks a declined question as silence rather than as an answer', async () => {
    await generateSkaProfile(INPUT);

    const { prompt } = generateObject.mock.calls[0][0];
    // `''` in the answers map means "they declined". Passed through as an
    // answer it would read as an empty response and get filled in — the exact
    // fabrication the empty-section rule exists to prevent.
    expect(prompt).toContain('How do you learn best?');
    expect(prompt).toContain('declined this one');
    expect(prompt).toContain('treat it as silence');
  });

  it('marks a question that was never reached as not covered', async () => {
    await generateSkaProfile(INPUT);

    const { prompt } = generateObject.mock.calls[0][0];
    expect(prompt).toContain('How do you feel about the exam?');
    expect(prompt).toContain('(never covered)');
  });

  it('instructs the model to return null rather than infer', async () => {
    await generateSkaProfile(INPUT);

    const { prompt } = generateObject.mock.calls[0][0];
    expect(prompt).toContain('Return null for any section');
  });

  it('truncates an over-long section instead of throwing', async () => {
    generateObject.mockResolvedValueOnce({
      object: {
        skills: 'a'.repeat(SKA_SECTION_MAX_CHARS + 100),
        knowledge: null,
        attitude: null,
      },
    });

    const result = await generateSkaProfile(INPUT);

    expect(result.skills).toHaveLength(SKA_SECTION_MAX_CHARS);
  });

  it('normalises a whitespace-only section to null', async () => {
    generateObject.mockResolvedValueOnce({
      object: { skills: '   ', knowledge: null, attitude: 'Direct.' },
    });

    expect((await generateSkaProfile(INPUT)).skills).toBeNull();
  });
});

describe('generateSkaProfileWithRetry', () => {
  it('returns the profile on the first attempt without retrying', async () => {
    expect(await generateSkaProfileWithRetry(INPUT)).toEqual(PROFILE);
    expect(generateObject).toHaveBeenCalledTimes(1);
  });

  it('retries exactly once after a failure and returns the retry’s result', async () => {
    generateObject
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValueOnce({ object: PROFILE });

    expect(await generateSkaProfileWithRetry(INPUT)).toEqual(PROFILE);
    expect(generateObject).toHaveBeenCalledTimes(2);
  });

  it('resolves to null rather than throwing when both attempts fail', async () => {
    generateObject.mockRejectedValue(new Error('503'));

    // The null return is the point: it makes "generation failed" an ordinary
    // value the machine handles, instead of an exception that would take a
    // finished 15-minute interview down with it.
    expect(await generateSkaProfileWithRetry(INPUT)).toBeNull();
    expect(generateObject).toHaveBeenCalledTimes(2);
  });

  it('does not retry more than once', async () => {
    generateObject.mockRejectedValue(new Error('503'));

    await generateSkaProfileWithRetry(INPUT);

    // A learner is waiting at the end of their interview; an unbounded retry
    // loop would hold the turn open through a full provider outage.
    expect(generateObject).toHaveBeenCalledTimes(2);
  });
});
