// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useParseLessonMaterial } from '../use-parse-lesson-material';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
afterEach(() => vi.restoreAllMocks());

const material = { text: '<p>x</p>', keyPoints: [], proTips: '', quiz: [] };

describe('useParseLessonMaterial', () => {
  it('posts the file as multipart and returns parsed material', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify(material), { status: 200 }),
      );
    const { result } = renderHook(() => useParseLessonMaterial(), { wrapper });

    let returned: unknown;
    await act(async () => {
      returned = await result.current.mutateAsync(new File(['b'], 'l.docx'));
    });

    expect(returned).toEqual(material);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/lesson-material/parse');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(FormData);
  });

  it('throws on a non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('nope', { status: 400 }),
    );
    const { result } = renderHook(() => useParseLessonMaterial(), { wrapper });
    await expect(
      result.current.mutateAsync(new File(['x'], 'a.docx')),
    ).rejects.toThrow(/400/);
  });
});
