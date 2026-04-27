// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  parseCubicBezierString,
  readSidebarMotionTokens,
  SIDEBAR_MOTION_FALLBACK,
} from '../sidebar-motion';

function setTokens(tokens: Record<string, string>) {
  const style = document.documentElement.style;
  for (const [k, v] of Object.entries(tokens)) style.setProperty(k, v);
}

describe('parseCubicBezierString', () => {
  it('parses a valid cubic-bezier() string into 4 numbers', () => {
    expect(parseCubicBezierString('cubic-bezier(0.215, 0.61, 0.355, 1)')).toEqual([
      0.215, 0.61, 0.355, 1,
    ]);
  });

  it('returns null for an unparseable value', () => {
    expect(parseCubicBezierString('ease')).toBeNull();
    expect(parseCubicBezierString('')).toBeNull();
  });
});

describe('readSidebarMotionTokens', () => {
  beforeEach(() => {
    const style = document.documentElement.style;
    [
      '--duration-sidebar-reveal',
      '--duration-sidebar-chevron',
      '--duration-sidebar-shimmer',
      '--ease-sidebar',
    ].forEach((p) => style.removeProperty(p));
  });

  it('returns fallbacks when tokens are missing', () => {
    const t = readSidebarMotionTokens();
    expect(t).toEqual(SIDEBAR_MOTION_FALLBACK);
  });

  it('converts ms durations to seconds and parses the bezier', () => {
    setTokens({
      '--duration-sidebar-reveal': '320ms',
      '--duration-sidebar-chevron': '200ms',
      '--duration-sidebar-shimmer': '1400ms',
      '--ease-sidebar': 'cubic-bezier(0.215, 0.61, 0.355, 1)',
    });
    const t = readSidebarMotionTokens();
    expect(t.revealS).toBeCloseTo(0.32, 3);
    expect(t.chevronS).toBeCloseTo(0.2, 3);
    expect(t.shimmerS).toBeCloseTo(1.4, 3);
    expect(t.ease).toEqual([0.215, 0.61, 0.355, 1]);
  });
});
