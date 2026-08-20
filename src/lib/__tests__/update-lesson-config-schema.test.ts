import { describe, expect, it } from 'vitest';

// admin-schemas.ts imports via the `#/` alias (`#/lib/video-providers`,
// `#/types`), not `@/`, so no mocking is needed here — these tests exercise
// the real modules directly. Same as board-schemas.test.ts.
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
