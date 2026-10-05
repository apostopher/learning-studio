// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type ShouldPrepareDebriefArgs,
  shouldPrepareDebrief,
  usePrepareDebrief,
} from '#/data-hooks/use-prepare-debrief';

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
 * Both ends of the wire, as in use-record-last-viewed.test.tsx: the hook that
 * fires on play cannot be rendered here, so the decision and the request it
 * sends are tested apart.
 */
describe('usePrepareDebrief', () => {
  it('sends the lesson to the prepare endpoint via sendBeacon', async () => {
    const beacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { sendBeacon: beacon });

    const { result } = renderHook(() => usePrepareDebrief(), {
      wrapper: wrapper(),
    });
    result.current.mutate({ courseSlug: 'ppl', lessonSlug: 'l1' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][0]).toBe('/api/lesson/ai-test/prepare');
    expect(JSON.parse(await beacon.mock.calls[0][1].text())).toEqual({
      courseSlug: 'ppl',
      lessonSlug: 'l1',
    });
  });
});

describe('shouldPrepareDebrief', () => {
  const watching: ShouldPrepareDebriefArgs = {
    playing: true,
    hasDebrief: true,
    canDebrief: true,
    materialLocked: true,
    readOnly: false,
    alreadyRequested: false,
  };

  it('fires when a debrief lesson starts playing behind its video lock', () => {
    expect(shouldPrepareDebrief(watching)).toBe(true);
  });

  it.each<[string, Partial<ShouldPrepareDebriefArgs>]>([
    ['before the video plays', { playing: false }],
    ['when tab 2 is the authored quiz', { hasDebrief: false }],
    ['when there is nothing to generate from', { canDebrief: false }],
    ['once the video is already watched', { materialLocked: false }],
    ['on a read-only archive view', { readOnly: true }],
    ['a second time for the same lesson', { alreadyRequested: true }],
  ])('holds off %s', (_why, override) => {
    expect(shouldPrepareDebrief({ ...watching, ...override })).toBe(false);
  });
});
