// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { playbackRefetchDelayMs } from '../use-lesson-video-playback';

describe('playbackRefetchDelayMs', () => {
  it('re-resolves a minute before a Mux token expires', () => {
    // 1h token → refetch at 59m, so the player never holds a dead URL.
    expect(playbackRefetchDelayMs(3600)).toBe(59 * 60 * 1000);
  });

  it('disables polling when the provider gives no expiry', () => {
    expect(playbackRefetchDelayMs(null)).toBe(false);
    expect(playbackRefetchDelayMs(undefined)).toBe(false);
  });

  it('floors the delay so a short TTL cannot busy-loop', () => {
    // Without the floor these would be 0 and negative — react-query treats a
    // 0ms interval as "refetch immediately, forever".
    expect(playbackRefetchDelayMs(60)).toBe(30_000);
    expect(playbackRefetchDelayMs(10)).toBe(30_000);
    expect(playbackRefetchDelayMs(0)).toBe(30_000);
  });

  it('scales with the TTL between the floor and the margin', () => {
    expect(playbackRefetchDelayMs(300)).toBe(240 * 1000);
    expect(playbackRefetchDelayMs(120)).toBe(60 * 1000);
  });

  it('re-resolves before expiry for any TTL above the floor', () => {
    for (const ttl of [31, 90, 600, 3600, 86_400]) {
      const delay = playbackRefetchDelayMs(ttl);
      expect(delay).not.toBe(false);
      expect(delay as number).toBeLessThan(ttl * 1000);
    }
  });

  it('cannot beat expiry at or below the 30s floor — documented, not fixed', () => {
    // The floor exists to stop a 0ms busy-loop, and it wins over the margin
    // here. A URL with ≤30s left will be re-resolved at or just after it dies,
    // so the player shows one failed segment before recovering. Accepted: no
    // provider we use issues URLs that short (Mux 1h, Synthesia hours).
    expect(playbackRefetchDelayMs(30)).toBe(30_000);
    expect(playbackRefetchDelayMs(5)).toBe(30_000);
  });
});
