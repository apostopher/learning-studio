// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type ShouldPrepareDebriefArgs,
  shouldPrepareDebrief,
  shouldPrepareDebriefOnVisit,
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
    readOnly: false,
    alreadyRequested: false,
  };

  it('fires when a debrief lesson starts playing', () => {
    expect(shouldPrepareDebrief(watching)).toBe(true);
  });

  it('still fires on a rewatch once the video is watched', () => {
    // The debrief no longer opens when the video unlocks the material: it
    // opens 24h after the lesson is done, and the server prepares in every
    // state short of passed. Holding off once the material unlocked meant a
    // pilot who watched before this shipped never got a head start at all.
    // The old gate rides along untyped so this goes red if it comes back.
    const unlocked = { materialLocked: false };
    expect(shouldPrepareDebrief({ ...watching, ...unlocked })).toBe(true);
  });

  it.each<[string, Partial<ShouldPrepareDebriefArgs>]>([
    ['before the video plays', { playing: false }],
    ['when the lesson has no debrief', { hasDebrief: false }],
    ['when there is nothing to generate from', { canDebrief: false }],
    ['on a read-only archive view', { readOnly: true }],
    ['a second time for the same lesson', { alreadyRequested: true }],
  ])('holds off %s', (_why, override) => {
    expect(shouldPrepareDebrief({ ...watching, ...override })).toBe(false);
  });
});

/**
 * Video-less lessons never mount the player, so prepare-on-play never runs
 * for them. Spec ("When generation runs"): they prepare on first visit.
 */
describe('shouldPrepareDebriefOnVisit', () => {
  const visiting = {
    hasDebrief: true,
    canDebrief: true,
    readOnly: false,
    alreadyRequested: false,
  };

  it('fires on the first visit to a video-less debrief lesson', () => {
    expect(shouldPrepareDebriefOnVisit(visiting)).toBe(true);
  });

  it.each<[string, Partial<typeof visiting>]>([
    ['when the lesson has no debrief', { hasDebrief: false }],
    [
      'until the material has loaded with something to generate from',
      { canDebrief: false },
    ],
    ['on a read-only archive view', { readOnly: true }],
    ['a second time for the same lesson', { alreadyRequested: true }],
  ])('holds off %s', (_why, override) => {
    expect(shouldPrepareDebriefOnVisit({ ...visiting, ...override })).toBe(
      false,
    );
  });
});
