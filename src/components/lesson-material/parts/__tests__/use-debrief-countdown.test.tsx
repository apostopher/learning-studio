// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebriefCountdown } from '../use-debrief-countdown';

vi.mock('react', async () => {
  const { createRequire } = await import('node:module');
  const cjs = createRequire(import.meta.url)('react');
  return { ...cjs, default: cjs };
});

const NOW = Date.parse('2026-11-12T10:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

function setup(availableAt: string | null, refetch = vi.fn(async () => {})) {
  const view = renderHook(
    ({ at }: { at: string | null }) => useDebriefCountdown(at, refetch),
    { initialProps: { at: availableAt } },
  );
  return { refetch, view };
}

describe('useDebriefCountdown', () => {
  it('refetches once the time is up, a grace second after zero', async () => {
    const at = new Date(NOW + 2_000).toISOString();
    const { refetch } = setup(at);
    await act(() => vi.advanceTimersByTimeAsync(2_500));
    expect(refetch).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('re-arms when the answer still says closed, backing off', async () => {
    // Review Focus 4: the same availableAt comes back (server clock behind),
    // so nothing re-renders the hook — the tick itself must ask again.
    const at = new Date(NOW + 1_000).toISOString();
    const { refetch } = setup(at);
    await act(() => vi.advanceTimersByTimeAsync(2_100));
    expect(refetch).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(refetch).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(refetch).toHaveBeenCalledTimes(3);
  });

  it('re-arms on a new opening time, and stops when there is none', async () => {
    const { refetch, view } = setup(new Date(NOW + 1_000).toISOString());
    view.rerender({ at: new Date(NOW + 3_600_000).toISOString() });
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(refetch).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(3_592_000));
    expect(refetch).toHaveBeenCalledOnce();
    view.rerender({ at: null });
    await act(() => vi.advanceTimersByTimeAsync(4 * 3_600_000));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('clears its timer on unmount', async () => {
    const { refetch, view } = setup(new Date(NOW + 1_000).toISOString());
    view.unmount();
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(refetch).not.toHaveBeenCalled();
  });
});
