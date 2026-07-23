import { describe, expect, it } from 'vitest';
import { isAssociateFrom } from '#/lib/is-associate';

describe('isAssociateFrom', () => {
  it('true only when associate is the sole subscription', () => {
    expect(isAssociateFrom(['associate'])).toBe(true);
    expect(isAssociateFrom(['associate', 'candidate'])).toBe(false);
    expect(isAssociateFrom([])).toBe(false);
  });
});
