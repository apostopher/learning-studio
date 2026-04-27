/**
 * Returns +1 in LTR and -1 in RTL.
 *
 * Multiply by a viewport-physical value (clientX delta, rotate degrees,
 * translateX value, etc.) to flip it into the inline-start → inline-end
 * direction so the visual behavior mirrors correctly across writing modes.
 */
export const inlineDirSign = (): 1 | -1 => {
  if (typeof document === 'undefined') return 1;
  return getComputedStyle(document.documentElement).direction === 'rtl'
    ? -1
    : 1;
};
