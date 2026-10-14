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
    expect(updateLessonConfigInputSchema.safeParse({ name: 'x' }).success).toBe(
      false,
    );
  });

  it('rejects an unknown subscription tier', () => {
    expect(
      updateLessonConfigInputSchema.safeParse({
        requiredSubscriptions: ['gold'],
      }).success,
    ).toBe(false);
  });

  it("accepts the exclusive 'none' tag", () => {
    expect(
      updateLessonConfigInputSchema.safeParse({ levels: ['none'] }).success,
    ).toBe(true);
  });

  it('still accepts real levels and the empty "every level" tag', () => {
    expect(
      updateLessonConfigInputSchema.safeParse({ levels: ['basic', 'advanced'] })
        .success,
    ).toBe(true);
    expect(
      updateLessonConfigInputSchema.safeParse({ levels: [] }).success,
    ).toBe(true);
  });

  it("rejects 'none' mixed with a real level, saying why", () => {
    const parsed = updateLessonConfigInputSchema.safeParse({
      levels: ['none', 'basic'],
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((i) => i.message)).toContain(
      'None cannot be combined with other levels',
    );
  });

  it('rejects an unknown level', () => {
    expect(
      updateLessonConfigInputSchema.safeParse({ levels: ['expert'] }).success,
    ).toBe(false);
  });
});
