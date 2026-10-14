// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataKeys } from '#/data-hooks/keys';
import {
  captionsRefetchInterval,
  useLessonCaptions,
} from '#/data-hooks/use-lesson-captions';
import { useRequestLessonCaptions } from '#/data-hooks/use-request-lesson-captions';

function harness() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

afterEach(() => vi.unstubAllGlobals());

describe('captionsRefetchInterval', () => {
  it('polls every 30s while generating, never otherwise', () => {
    expect(captionsRefetchInterval('generating')).toBe(30_000);
    for (const s of [
      'ready',
      'failed',
      'unsupported',
      'none',
      'no_token',
      'not_mux',
      undefined,
    ] as const) {
      expect(captionsRefetchInterval(s)).toBe(false);
    }
  });
});

describe('useLessonCaptions', () => {
  it('asks the route for that lesson, course and language, and caches the parsed body', async () => {
    const body = { status: 'generating', error: null, lang: 'fr' };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: true, status: 200, json: async () => body }),
    );
    const { client, wrapper } = harness();

    const { result } = renderHook(
      () => useLessonCaptions({ lessonId: 10, courseId: 7, lang: 'fr' }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/admin/lessons/10/captions?courseId=7&lang=fr',
    );
    expect(client.getQueryData(dataKeys.lessonCaptions(10, 7, 'fr'))).toEqual(
      body,
    );
  });

  it('fetches nothing without a target', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { wrapper } = harness();
    const { result } = renderHook(() => useLessonCaptions(null), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('maps the route’s 404 to null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );
    const { wrapper } = harness();
    const { result } = renderHook(
      () => useLessonCaptions({ lessonId: 10, courseId: 7, lang: 'en' }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});

describe('useRequestLessonCaptions', () => {
  it('POSTs the request, then refetches captions status and playback', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchSpy);
    const { client, wrapper } = harness();
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useRequestLessonCaptions(), {
      wrapper,
    });
    await result.current.mutateAsync({ lessonId: 10, courseId: 7, lang: 'fr' });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/admin/lessons/10/captions?courseId=7&lang=fr',
      { method: 'POST' },
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: dataKeys.lessonCaptionsAll(10),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: dataKeys.lessonPlaybacks(10),
    });
  });

  it('rejects with the route’s own reason when it refuses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          error: 'Captions come from the provider for this video.',
        }),
      }),
    );
    const { wrapper } = harness();
    const { result } = renderHook(() => useRequestLessonCaptions(), {
      wrapper,
    });
    await expect(
      result.current.mutateAsync({ lessonId: 10, courseId: 7, lang: 'fr' }),
    ).rejects.toThrow('Captions come from the provider for this video.');
  });

  it('falls back to the status when the body has no reason', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('not json');
        },
      }),
    );
    const { wrapper } = harness();
    const { result } = renderHook(() => useRequestLessonCaptions(), {
      wrapper,
    });
    await expect(
      result.current.mutateAsync({ lessonId: 10, courseId: 7, lang: 'fr' }),
    ).rejects.toThrow("Couldn't request captions (500)");
  });
});
