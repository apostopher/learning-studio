// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRecordSectionTap } from '#/data-hooks/use-record-section-tap';

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

/**
 * The decision half (`nextSectionTapWrite`) is covered in
 * record-section-tap.test.ts; this is the wire half. `useSectionTapRecorder`
 * itself calls `useRef`/`useCallback` and cannot be rendered here (see
 * use-record-last-viewed.test.tsx for the same split), so the mutation is
 * exercised directly and the assertion is on the body fetch received.
 */
describe('useRecordSectionTap', () => {
  it('posts the course and lesson slugs with the section', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ promotion: null }) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useRecordSectionTap(), {
      wrapper: wrapper(),
    });
    result.current.mutate({
      courseSlug: 'ppl',
      lessonSlug: 'l1',
      section: 'proTips',
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/user/lesson-section');
    expect(init.method).toBe('POST');
    // The route 400s without `courseSlug` and gates the lesson inside that
    // course (Task 6a) — so the body is asserted whole, not by field.
    expect(JSON.parse(init.body)).toEqual({
      courseSlug: 'ppl',
      lessonSlug: 'l1',
      section: 'proTips',
    });
  });
});
