// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

// Never the real client: under vitest DATABASE_URL may name production.
vi.mock('#/db', () => ({ db: null }));
vi.mock('#/db/admin', () => ({ getUserRoleNames: vi.fn() }));
vi.mock('#/db/course-staff', () => ({ isAnyCourseStaff: vi.fn() }));

import { viperAllowedForSeats } from '../viper-access';

describe('viperAllowedForSeats', () => {
  it('refuses a student whose every seat is free', () => {
    expect(viperAllowedForSeats(['free'])).toBe(false);
  });
  it('allows anyone with one paid seat', () => {
    expect(viperAllowedForSeats(['free', 'paid'])).toBe(true);
    expect(viperAllowedForSeats(['paid'])).toBe(true);
  });
  it('does not refuse someone on no offering at all', () => {
    expect(viperAllowedForSeats([])).toBe(true);
  });
});
