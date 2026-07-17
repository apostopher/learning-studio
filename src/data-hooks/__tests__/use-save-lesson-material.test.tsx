// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSaveLessonMaterial } from '../use-save-lesson-material';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
afterEach(() => vi.restoreAllMocks());

const values = { text: '<p>x</p>', keyPoints: [], proTips: '', quiz: [] };

describe('useSaveLessonMaterial', () => {
  it('POSTs the values as JSON to the lesson material route', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 1 }), { status: 200 }),
      );
    const { result } = renderHook(() => useSaveLessonMaterial(42), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(values);
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/lessons/42/material');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual(values);
  });

  it('throws on a non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('bad', { status: 400 }),
    );
    const { result } = renderHook(() => useSaveLessonMaterial(42), { wrapper });
    await expect(result.current.mutateAsync(values)).rejects.toThrow(/400/);
  });
});
