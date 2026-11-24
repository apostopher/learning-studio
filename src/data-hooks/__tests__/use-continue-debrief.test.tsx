// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pendingPromotionAtom } from '#/atoms/promotion';
import { dataKeys } from '#/data-hooks/keys';
import {
  type DebriefAttemptView,
  useContinueDebrief,
} from '#/data-hooks/use-debrief-attempt';

afterEach(() => vi.unstubAllGlobals());

const onOffer: DebriefAttemptView = {
  attemptId: 7,
  questions: [{ id: 'q1', question: 'A?', set: 1 }],
  answered: [{ questionId: 'q1', score: 80, feedback: 'F', revisitNote: '' }],
  draft: null,
  offer: true,
  offerQuestionCount: 4,
  setResults: [],
};

function setup(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => body }),
  );
  const client = new QueryClient();
  client.setQueryData(dataKeys.debriefAttempt('ppl', 'l1'), onOffer);
  const store = createStore();
  const seen: unknown[] = [];
  const onContinued = vi.fn(() => {
    seen.push(client.getQueryData(dataKeys.debriefAttempt('ppl', 'l1')));
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </Provider>
  );
  const { result } = renderHook(() => useContinueDebrief({ onContinued }), {
    wrapper,
  });
  return { result, onContinued, seen, store };
}

describe('useContinueDebrief', () => {
  it('hands onContinued the result while the cache still holds the attempt on its offer', async () => {
    const { result, onContinued, seen } = setup({
      choice: 'no',
      passedNow: false,
    });
    const input = {
      courseSlug: 'ppl',
      lessonSlug: 'l1',
      attemptId: 7,
      choice: 'no' as const,
    };
    await act(() => result.current.mutateAsync(input));
    expect(onContinued.mock.calls[0]).toEqual([
      { choice: 'no', passedNow: false, promotion: null },
      input,
    ]);
    expect(seen[0]).toEqual(onOffer);
  });

  it('queues a promotion a new pass earned for the interstitial', async () => {
    const promotion = { id: 1, from: 'basic', to: 'intermediate' };
    const { result, store } = setup({
      choice: 'no',
      passedNow: true,
      promotion,
    });
    await act(() =>
      result.current.mutateAsync({
        courseSlug: 'ppl',
        lessonSlug: 'l1',
        attemptId: 7,
        choice: 'no',
      }),
    );
    expect(store.get(pendingPromotionAtom)).toMatchObject({
      to: 'intermediate',
    });
  });
});
