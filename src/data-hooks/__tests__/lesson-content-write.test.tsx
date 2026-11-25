// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { dataKeys } from '#/data-hooks/keys';
import { useSettleContentWrite } from '#/data-hooks/lesson-content-write';

describe('useSettleContentWrite', () => {
  const lesson = { id: 10, version: '1.1' };
  const other = { id: 11, version: '1.0' };

  async function savedOver(cached: typeof lesson, version?: string) {
    const client = new QueryClient();
    client.setQueryData(dataKeys.orgLibrary(), {
      untitled: [other],
      disciplines: [
        { id: 1, untitled: [], modules: [{ id: 2, lessons: [cached] }] },
      ],
    });
    const { result } = renderHook(() => useSettleContentWrite(10), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    act(() => result.current(version));
    const library = client.getQueryData<{
      untitled: unknown[];
      disciplines: { modules: { lessons: unknown[] }[] }[];
    }>(dataKeys.orgLibrary());
    expect(library?.untitled).toEqual([other]);
    return library?.disciplines[0].modules[0].lessons[0];
  }

  it('puts the saved version on the lesson, wherever it is filed', async () => {
    expect(await savedOver(lesson, '1.2')).toEqual({
      ...lesson,
      version: '1.2',
    });
  });

  it('leaves the version alone when the write sent none', async () => {
    expect(await savedOver(lesson)).toEqual(lesson);
  });
});
