// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataKeys } from '#/data-hooks/keys';
import { useDeleteLesson } from '#/data-hooks/use-delete-lesson';

function makeHarness() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

afterEach(() => vi.restoreAllMocks());

describe('useDeleteLesson', () => {
  /**
   * A lesson is org-owned and can sit in several courses, so there is no one
   * course board to refresh. The two org-level keys are what the editor
   * actually reads.
   *
   * Mutant this kills: `dataKeys.courseBoard(1)` in place of the two org keys
   * — the editor and the library then both keep showing a lesson the server
   * has already destroyed.
   */
  it('invalidates the editor board and the library, never a course board', async () => {
    const { client, wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    const keys: unknown[] = [];
    vi.spyOn(client, 'invalidateQueries').mockImplementation(
      // biome-ignore lint/suspicious/noExplicitAny: capturing the filter only
      ((filters: any) => {
        keys.push(filters?.queryKey);
        return Promise.resolve();
        // biome-ignore lint/suspicious/noExplicitAny: as above
      }) as any,
    );
    const { result } = renderHook(() => useDeleteLesson(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(9);
    });

    expect(keys).toContainEqual(dataKeys.editorBoard());
    expect(keys).toContainEqual(dataKeys.orgLibrary());
    expect(keys).not.toContainEqual(dataKeys.courseBoard(1));
  });

  /**
   * Authority over a lesson's existence follows its DISCIPLINE, so a 403 here
   * is a standing refusal — retrying will never work, and the dialog must not
   * say "please try again".
   *
   * Mutant this kills: the 403 branch removed, so the message becomes
   * "Failed to delete lesson (403)" and the dialog falls back to its generic
   * retry copy.
   */
  it('turns a 403 into a sentence about authority, not a retry', async () => {
    const { wrapper } = makeHarness();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Forbidden', { status: 403 }),
    );
    const { result } = renderHook(() => useDeleteLesson(), { wrapper });

    let message = '';
    await act(async () => {
      await result.current.mutateAsync(9).catch((error: Error) => {
        message = error.message;
      });
    });

    expect(message).toMatch(/discipline/i);
    expect(message).not.toMatch(/try again/i);
    expect(message).not.toMatch(/403/);
  });
});
