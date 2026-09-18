import { describe, expect, it } from 'vitest';
import { planCopySlugs } from './duplicate-lessons';

describe('planCopySlugs', () => {
  it('suffixes each slug with the discipline slug', () => {
    expect(planCopySlugs(['a', 'b'], 'uas', new Set())).toEqual([
      { from: 'a', to: 'a-uas' },
      { from: 'b', to: 'b-uas' },
    ]);
  });
  it('steps past a slug that is already taken, in the database or by an earlier copy in the same run', () => {
    expect(planCopySlugs(['a', 'a'], 'uas', new Set(['a-uas']))).toEqual([
      { from: 'a', to: 'a-uas-2' },
      { from: 'a', to: 'a-uas-3' },
    ]);
  });
});
