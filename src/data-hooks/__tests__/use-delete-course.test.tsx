// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dataKeys } from '#/data-hooks/keys';
import {
  CourseRequestError,
  useDeleteCourse,
} from '#/data-hooks/use-delete-course';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeHarness() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

describe('useDeleteCourse', () => {
  /**
   * The 409 body is the whole point of Task 3's refusal: the route puts the
   * exact sentence and the count on the wire, and this is what proves the
   * mutation actually surfaces both rather than collapsing into a generic
   * "failed" message. Mutant this catches: `throw new Error(...)` instead of
   * `CourseRequestError` — the dialog's `instanceof` check would then always
   * fall through to the generic copy, silently hiding the remix refusal.
   */
  it('rejects with a CourseRequestError carrying the exact sentence, status and remixerCount', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error:
          '2 other courses remix this course. Un-remix it from each of them first, then delete it.',
        remixerCount: 2,
      }),
    });
    const { wrapper } = makeHarness();
    const { result } = renderHook(() => useDeleteCourse(), { wrapper });

    let caught: unknown;
    await act(async () => {
      await result.current.mutateAsync(6).catch((error: unknown) => {
        caught = error;
      });
    });

    expect(caught).toBeInstanceOf(CourseRequestError);
    const error = caught as CourseRequestError;
    expect(error.message).toBe(
      '2 other courses remix this course. Un-remix it from each of them first, then delete it.',
    );
    expect(error.status).toBe(409);
    expect(error.remixerCount).toBe(2);
  });

  /**
   * A 500 carries no JSON body the server meant for a human, so the fallback
   * sentence names the status rather than trying (and failing) to parse one.
   */
  it('falls back to a status-only message when the body is not JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    });
    const { wrapper } = makeHarness();
    const { result } = renderHook(() => useDeleteCourse(), { wrapper });

    let caught: unknown;
    await act(async () => {
      await result.current.mutateAsync(6).catch((error: unknown) => {
        caught = error;
      });
    });

    expect(caught).toBeInstanceOf(CourseRequestError);
    const error = caught as CourseRequestError;
    expect(error.message).toBe('Failed to delete course (500)');
    expect(error.status).toBe(500);
    expect(error.remixerCount).toBeUndefined();
  });

  /**
   * The org editor's rail draws the same courses as the admin list, so both
   * caches have to go stale together — leaving one behind would show a
   * deleted course (or its old name) until that query's own staleTime elapses.
   */
  it('invalidates the admin course list and the org editor board on success', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => ({}),
    });
    const { client, wrapper } = makeHarness();
    const invalidateQueries = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useDeleteCourse(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(6);
    });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: dataKeys.adminCourses(),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: dataKeys.editorBoard(),
    });
  });
});
