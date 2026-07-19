import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// admin-schemas.ts imports `@/lib/video-providers` and `@/types` — vitest
// cannot resolve the `@/` alias at all (repo-wide finding, see
// .superpowers/sdd/progress.md), so both are full-stubbed here (no
// importOriginal) with values that mirror the real modules closely enough to
// exercise real schema behavior (e.g. the unknown-tier rejection below). Same
// pattern as board-schemas.test.ts.
vi.mock('@/lib/video-providers', () => ({
  PROVIDER_IDS: ['mux', 'synthesia'],
}));
vi.mock('@/types', () => ({
  SubscriptionsSchema: z.array(z.enum(['associate', 'candidate', 'rpoc'])),
}));

const { updateLessonConfigInputSchema } = await import('../admin-schemas');

describe('updateLessonConfigInputSchema', () => {
  it('accepts a single isAvailable field', () => {
    expect(
      updateLessonConfigInputSchema.safeParse({ isAvailable: false }).success,
    ).toBe(true);
  });

  it('accepts requiredSubscriptions', () => {
    expect(
      updateLessonConfigInputSchema.safeParse({
        requiredSubscriptions: ['associate'],
      }).success,
    ).toBe(true);
  });

  it('rejects an empty object', () => {
    expect(updateLessonConfigInputSchema.safeParse({}).success).toBe(false);
  });

  it('rejects unknown keys (e.g. a rename body)', () => {
    expect(
      updateLessonConfigInputSchema.safeParse({ name: 'x' }).success,
    ).toBe(false);
  });

  it('rejects an unknown subscription tier', () => {
    expect(
      updateLessonConfigInputSchema.safeParse({
        requiredSubscriptions: ['gold'],
      }).success,
    ).toBe(false);
  });
});
