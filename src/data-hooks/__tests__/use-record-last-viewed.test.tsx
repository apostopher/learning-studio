// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  nextLastViewedWrite,
  useRecordLastViewed,
} from '#/data-hooks/use-record-last-viewed';

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

const URL = '/api/user/last-viewed';

/**
 * Two seams, because the middle one cannot be tested here: this repo's Vite
 * pipeline nulls the React hook dispatcher for any hook calling a raw React
 * hook under `renderHook` (documented at length in use-push-to-talk.test.ts),
 * so useRecordLastViewedLesson itself is not directly exercisable.
 *
 * What IS covered is both ends of the wire — the decision about what to write,
 * and the fact that a write actually reaches the network with the right URL
 * and body. The defect class CLAUDE.md warns about is a value computed and
 * never delivered; asserting on `beacon.mock.calls` is what makes that fail
 * loudly rather than pass silently.
 */
describe('useRecordLastViewed', () => {
  it('sends the lesson slug to the last-viewed endpoint via sendBeacon', async () => {
    const beacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { sendBeacon: beacon });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useRecordLastViewed(), {
      wrapper: wrapper(),
    });
    result.current.mutate({ lessonSlug: 'airspace-basics' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][0]).toBe(URL);
    const blob = beacon.mock.calls[0][1];
    expect(blob).toBeInstanceOf(Blob);
    expect(JSON.parse(await blob.text())).toEqual({
      lessonSlug: 'airspace-basics',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to a keepalive fetch when sendBeacon is unavailable', async () => {
    vi.stubGlobal('navigator', {});
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useRecordLastViewed(), {
      wrapper: wrapper(),
    });
    result.current.mutate({ lessonSlug: 'l1' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(URL);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      lessonSlug: 'l1',
    });
    expect(fetchMock.mock.calls[0][1].keepalive).toBe(true);
  });
});

describe('nextLastViewedWrite', () => {
  it('writes the lesson on first sight', () => {
    expect(
      nextLastViewedWrite({ recorded: null, lessonSlug: 'l1', enabled: true }),
    ).toBe('l1');
  });

  it('writes nothing while disabled — a locked lesson must not move the pointer', () => {
    expect(
      nextLastViewedWrite({
        recorded: null,
        lessonSlug: 'locked',
        enabled: false,
      }),
    ).toBeNull();
  });

  it('writes nothing on a re-render of the lesson already recorded', () => {
    expect(
      nextLastViewedWrite({ recorded: 'l1', lessonSlug: 'l1', enabled: true }),
    ).toBeNull();
  });

  it('writes again when the learner moves to a different lesson', () => {
    expect(
      nextLastViewedWrite({ recorded: 'l1', lessonSlug: 'l2', enabled: true }),
    ).toBe('l2');
  });

  it('writes once a lesson that started disabled becomes enabled', () => {
    // The real sequence for EVERY lesson view: computeLessonMainState holds
    // at 'course-loading' until both queries settle, so `enabled` is false on
    // the first render. A decision that only considered mount would never
    // write at all.
    expect(
      nextLastViewedWrite({ recorded: null, lessonSlug: 'l1', enabled: false }),
    ).toBeNull();
    expect(
      nextLastViewedWrite({ recorded: null, lessonSlug: 'l1', enabled: true }),
    ).toBe('l1');
  });

  it('does not rewrite a lesson that was recorded then briefly re-locked', () => {
    // Guards against a flapping `enabled` (a material refetch) producing a
    // duplicate write for a lesson already pointed at.
    expect(
      nextLastViewedWrite({ recorded: 'l1', lessonSlug: 'l1', enabled: false }),
    ).toBeNull();
    expect(
      nextLastViewedWrite({ recorded: 'l1', lessonSlug: 'l1', enabled: true }),
    ).toBeNull();
  });
});
