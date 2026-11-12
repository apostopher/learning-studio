// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataKeys } from '#/data-hooks/keys';
import {
  type DebriefAttemptView,
  useAnswerDebrief,
} from '#/data-hooks/use-debrief-attempt';

afterEach(() => vi.unstubAllGlobals());

const attempt: DebriefAttemptView = {
  attemptId: 7,
  questions: [
    { id: 'q1', question: 'A?' },
    { id: 'q2', question: 'B?' },
  ],
  answered: [{ questionId: 'q1', score: 40, revisitNote: 'First note' }],
  draft: null,
};
const metrics = {
  msOnQuestion: 1,
  msToFirstKey: 1,
  deletions: 0,
  charsDeleted: 0,
  rewrites: 0,
  pasteBlocked: 0,
  msHidden: 0,
  finalLength: 3,
};
const body = {
  evaluation: { score: 50, revisitNote: 'Second note' },
  mastery: { cleared: 1, total: 2, percent: 50 },
  finished: 'all-answered',
};

describe('useAnswerDebrief', () => {
  it('hands onAnswered the result and the attempt as it stood BEFORE the answer was cached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => body,
      }),
    );
    const client = new QueryClient();
    client.setQueryData(dataKeys.debriefAttempt('l1'), attempt);
    const seen: unknown[] = [];
    const onAnswered = vi.fn(() => {
      // The panel builds the finished report from here, and must swap to it
      // in the same render the attempt cache moves on — never after.
      seen.push(client.getQueryData(dataKeys.debriefAttempt('l1')));
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useAnswerDebrief({ onAnswered }), {
      wrapper,
    });
    const input = {
      courseSlug: 'ppl',
      lessonSlug: 'l1',
      attemptId: 7,
      questionId: 'q2',
      answer: 'abc',
      metrics,
    };
    await act(() => result.current.mutateAsync(input));

    expect(onAnswered).toHaveBeenCalledOnce();
    expect(onAnswered.mock.calls[0]).toEqual([
      { ...body, promotion: null },
      input,
    ]);
    expect(seen[0]).toEqual(attempt);
    expect(
      client.getQueryData<DebriefAttemptView>(dataKeys.debriefAttempt('l1'))
        ?.answered,
    ).toHaveLength(2);
  });
});
