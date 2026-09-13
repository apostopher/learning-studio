// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  postEvaluateAnswer,
  postGenerateTest,
  postSaveResults,
} from '../use-lesson-ai-test';

afterEach(() => vi.restoreAllMocks());

const lesson = { courseSlug: 'ppl', lessonSlug: 'l1' };

const freeText = {
  id: 'q1',
  type: 'free-text' as const,
  question: 'Why?',
  expectedAnswer: 'Because.',
  keyPointIndex: 0,
};

function stubFetch(body: unknown) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => body });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/**
 * These are the exact functions the `useGenerateTest`/`useEvaluateAnswer`/
 * `useSaveResults` hooks call — those hooks use `useCallback`/`useAtomCallback`
 * and cannot be rendered under this repo's Vitest setup (react-compiler nulls
 * the dispatcher), so the request builders are exported and exercised
 * directly, and the assertion is on the body fetch received. All three
 * routes 400 without `courseSlug` and gate the lesson inside that course
 * (Task 6a).
 */
describe('debrief requests carry the course', () => {
  it('generate posts both slugs', async () => {
    const fetchMock = stubFetch({ lessonSlug: 'l1', questions: [] });

    await postGenerateTest(lesson);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/lesson/ai-test/generate');
    expect(JSON.parse(init.body)).toEqual({
      courseSlug: 'ppl',
      lessonSlug: 'l1',
    });
  });

  it('evaluate posts both slugs with the question and answer', async () => {
    const fetchMock = stubFetch({ questionId: 'q1', score: 80 });

    await postEvaluateAnswer(lesson, freeText, 'an answer');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/lesson/ai-test/evaluate');
    expect(JSON.parse(init.body)).toEqual({
      courseSlug: 'ppl',
      lessonSlug: 'l1',
      question: freeText,
      userAnswer: 'an answer',
    });
  });

  it('save-results posts the course slug with the test, evaluations and score', async () => {
    const fetchMock = stubFetch({ id: 1, promotion: null });
    const test = { lessonSlug: 'l1', questions: [] };

    await postSaveResults({
      courseSlug: 'ppl',
      test,
      evaluations: [],
      totalScore: 80,
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/lesson/ai-test/save-results');
    expect(JSON.parse(init.body)).toEqual({
      courseSlug: 'ppl',
      lessonSlug: 'l1',
      test,
      evaluations: [],
      totalScore: 80,
    });
  });
});
