import { describe, expect, it } from 'vitest';
import { matchesConfirmPhrase } from '#/lib/confirm-phrase';

describe('matchesConfirmPhrase', () => {
  it('accepts the name typed exactly', () => {
    expect(matchesConfirmPhrase('Swiss Cheese', 'Swiss Cheese')).toBe(true);
  });
  it('forgives case, surrounding whitespace and doubled spaces — the point is attention, not typing skill', () => {
    expect(matchesConfirmPhrase('  swiss   cheese ', 'Swiss Cheese')).toBe(
      true,
    );
  });
  it('refuses a partial or different name', () => {
    expect(matchesConfirmPhrase('Swiss', 'Swiss Cheese')).toBe(false);
    expect(matchesConfirmPhrase('Swiss Cheese 2', 'Swiss Cheese')).toBe(false);
    expect(matchesConfirmPhrase('', 'Swiss Cheese')).toBe(false);
  });
  it('never matches an empty target — a nameless thing cannot be confirmed by typing nothing', () => {
    expect(matchesConfirmPhrase('', '')).toBe(false);
    expect(matchesConfirmPhrase('   ', '')).toBe(false);
  });
});
