export type CubicBezier = [number, number, number, number];

export type SidebarMotionTokens = {
  revealS: number;
  chevronS: number;
  shimmerS: number;
  ease: CubicBezier;
};

export const SIDEBAR_MOTION_FALLBACK: SidebarMotionTokens = {
  revealS: 0.32,
  chevronS: 0.2,
  shimmerS: 1.4,
  ease: [0.215, 0.61, 0.355, 1],
};

export function parseCubicBezierString(value: string): CubicBezier | null {
  const match = value.trim().match(/^cubic-bezier\(\s*([^)]+)\)$/);
  if (!match) return null;
  const parts = match[1].split(',').map((p) => Number.parseFloat(p.trim()));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
  return parts as CubicBezier;
}

function parseMsToSeconds(value: string, fallbackS: number): number {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n) || n === 0) return fallbackS;
  return n / 1000;
}

export function readSidebarMotionTokens(): SidebarMotionTokens {
  if (typeof window === 'undefined') return SIDEBAR_MOTION_FALLBACK;
  const s = window.getComputedStyle(document.documentElement);
  const easeStr = s.getPropertyValue('--ease-sidebar');
  return {
    revealS: parseMsToSeconds(
      s.getPropertyValue('--duration-sidebar-reveal'),
      SIDEBAR_MOTION_FALLBACK.revealS,
    ),
    chevronS: parseMsToSeconds(
      s.getPropertyValue('--duration-sidebar-chevron'),
      SIDEBAR_MOTION_FALLBACK.chevronS,
    ),
    shimmerS: parseMsToSeconds(
      s.getPropertyValue('--duration-sidebar-shimmer'),
      SIDEBAR_MOTION_FALLBACK.shimmerS,
    ),
    ease: parseCubicBezierString(easeStr) ?? SIDEBAR_MOTION_FALLBACK.ease,
  };
}
