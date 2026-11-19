// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

// Only the pure helper is under test; the module's queries never run.
vi.mock('#/db', () => ({ db: {} }));
vi.mock('#/db/schema', () => ({ userLevelsTable: {} }));

import { currentLevelOf } from '#/db/user-levels';

describe('currentLevelOf', () => {
  it('reads a tier as itself', () => {
    expect(currentLevelOf('basic')).toBe('basic');
    expect(currentLevelOf('advanced')).toBe('advanced');
  });

  // A cleared cert must read exactly like never having had one: every reader
  // of `user_levels.level` relies on it, so `'none'` never reaches a gate.
  it("reads a cleared cert ('none') as no level", () => {
    expect(currentLevelOf('none')).toBeNull();
  });

  it('reads no row as no level', () => {
    expect(currentLevelOf(null)).toBeNull();
    expect(currentLevelOf(undefined)).toBeNull();
  });
});
