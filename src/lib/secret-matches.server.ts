import { timingSafeEqual } from 'node:crypto';

/** Constant-time string compare for shared secrets. */
export function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
