// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { invalidateLessonDoneReaders } from '#/data-hooks/invalidate-lesson-done';
import { dataKeys } from '#/data-hooks/keys';
import { useSubmitLessonQuiz } from '#/data-hooks/use-lesson-quiz-result';
import { useRecordSectionTap } from '#/data-hooks/use-record-section-tap';

afterEach(() => vi.restoreAllMocks());

const lesson = { courseSlug: 'ppl', lessonSlug: 'l1' };

/** The keys `invalidateQueries` was actually called with, in order. */
const invalidatedKeys = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.map(
    ([filters]) => (filters as { queryKey: unknown }).queryKey,
  );

const EXPECTED = [
  dataKeys.debriefStatus('ppl', 'l1'),
  dataKeys.courseProgressSummary('ppl'),
];

function setup() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const spy = vi.spyOn(client, 'invalidateQueries');
  const store = createStore();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <Provider store={store}>{children}</Provider>
    </QueryClientProvider>
  );
  return { client, spy, wrapper };
}

/**
 * "Done" includes the tabs and the quiz, so the step that finishes a lesson is
 * usually a tab tap or a quiz submit. Each must refresh what reads "done": the
 * course rollup (sidebar ring, lock copy) and the lesson's debrief status (the
 * Debrief tab's "opens in 24h" wait). Without this both stayed stale until the
 * next unrelated refetch.
 */
describe('invalidateLessonDoneReaders', () => {
  it('invalidates the course progress summary and this lesson’s debrief status', async () => {
    const { client, spy } = setup();
    await invalidateLessonDoneReaders(client, lesson);
    expect(invalidatedKeys(spy)).toEqual(EXPECTED);
  });
});

describe('the steps that can finish a lesson invalidate its readers', () => {
  it('a recorded tab tap', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ promotion: null }),
      }),
    );
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useRecordSectionTap(), { wrapper });
    result.current.mutate({ ...lesson, section: 'proTips' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidatedKeys(spy)).toEqual(EXPECTED);
  });

  it('a submitted quiz', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 1,
          lessonSlug: 'l1',
          answers: [],
          createdAt: new Date().toISOString(),
          promotion: null,
        }),
      }),
    );
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useSubmitLessonQuiz(lesson), {
      wrapper,
    });
    result.current.mutate([]);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidatedKeys(spy)).toEqual(EXPECTED);
  });
});
