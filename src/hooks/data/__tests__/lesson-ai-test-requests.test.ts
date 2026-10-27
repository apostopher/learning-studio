// @vitest-environment jsdom
import type { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DebriefNotOpenError,
  invalidateAfterSave,
  postEvaluateAnswer,
  postGenerateTest,
  postSaveResults,
  refreshIfNotOpen,
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

describe('invalidateAfterSave', () => {
  it('invalidates the debrief status of that lesson and the course progress', async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const setQueryData = vi.fn();
    await invalidateAfterSave(
      { invalidateQueries, setQueryData } as unknown as QueryClient,
      lesson,
    );
    expect(invalidateQueries.mock.calls.map((c) => c[0].queryKey)).toEqual([
      ['user', 'debrief-status', 'ppl', 'l1'],
      ['course', 'progress-summary', 'ppl'],
    ]);
    expect(setQueryData).not.toHaveBeenCalled();
  });
});

/**
 * generate and save-results answer 409 `{ error: 'not-open' }` when the
 * debrief is not open now — a tab left open across the 24h boundary, or a
 * second tab that already submitted. That is not a failure to show; it means
 * the panel's state is stale.
 */
describe('a debrief that is not open', () => {
  function stub409() {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          error: 'not-open',
          availableAt: '2026-10-28T15:40:00.000Z',
        }),
      }),
    );
  }

  it('generate rejects with DebriefNotOpenError on a 409', async () => {
    stub409();
    await expect(postGenerateTest(lesson)).rejects.toBeInstanceOf(
      DebriefNotOpenError,
    );
  });

  it('save-results rejects with DebriefNotOpenError on a 409', async () => {
    stub409();
    await expect(
      postSaveResults({
        courseSlug: 'ppl',
        test: { lessonSlug: 'l1', questions: [] },
        evaluations: [],
        totalScore: 40,
      }),
    ).rejects.toBeInstanceOf(DebriefNotOpenError);
  });

  it('any other failure is still a plain error', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );
    const error = await postGenerateTest(lesson).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(DebriefNotOpenError);
  });

  it("refreshIfNotOpen refetches that lesson's debrief status so the panel moves on", () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const handled = refreshIfNotOpen(
      { invalidateQueries } as unknown as QueryClient,
      lesson,
      new DebriefNotOpenError(),
    );
    expect(handled).toBe(true);
    expect(invalidateQueries.mock.calls.map((c) => c[0].queryKey)).toEqual([
      ['user', 'debrief-status', 'ppl', 'l1'],
    ]);
  });

  it('refreshIfNotOpen leaves any other error to its caller', () => {
    const invalidateQueries = vi.fn();
    expect(
      refreshIfNotOpen(
        { invalidateQueries } as unknown as QueryClient,
        lesson,
        new Error('Failed to generate test'),
      ),
    ).toBe(false);
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});
