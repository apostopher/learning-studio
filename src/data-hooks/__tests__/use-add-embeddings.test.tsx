// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAddEmbeddings } from '#/data-hooks/use-add-embeddings';

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('useAddEmbeddings', () => {
  it('posts file-mode payload with courseId and returns result', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        sourcePath: 'file-x.pdf',
        chunks: 9,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAddEmbeddings(3), {
      wrapper: wrapper(),
    });
    result.current.mutate({
      url: 'https://blob.vercel-storage.com/training-docs/x.pdf',
      fileName: 'x.pdf',
      mimeType: 'application/pdf',
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [, init] = fetchMock.mock.calls[0];
    expect(fetchMock.mock.calls[0][0]).toBe('/api/ai-rag');
    expect(JSON.parse(init.body)).toEqual({
      mode: 'file',
      courseId: 3,
      url: 'https://blob.vercel-storage.com/training-docs/x.pdf',
      fileName: 'x.pdf',
      mimeType: 'application/pdf',
    });
    expect(result.current.data).toEqual({
      sourcePath: 'file-x.pdf',
      chunks: 9,
    });
  });
});
