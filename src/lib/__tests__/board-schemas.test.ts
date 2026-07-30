import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// admin-schemas.ts imports `@/lib/video-providers` and (after this task)
// `@/types` — vitest cannot resolve the `@/` alias at all (repo-wide finding,
// see .superpowers/sdd/progress.md), so both are full-stubbed here (no
// importOriginal) with values that mirror the real modules closely enough to
// exercise real schema behavior (e.g. the unknown-tier rejection below).
vi.mock('@/lib/video-providers', () => ({
  PROVIDER_IDS: ['mux', 'synthesia'],
}));
vi.mock('@/types', () => ({
  SubscriptionsSchema: z.array(z.enum(['associate', 'candidate', 'rpoc'])),
}));

const { boardLessonSchema, boardModuleSchema } = await import(
  '../admin-schemas'
);

describe('boardLessonSchema', () => {
  it('parses a lesson with config fields', () => {
    const parsed = boardLessonSchema.parse({
      id: 1,
      name: 'L',
      slug: 'l',
      rank: 1,
      isAvailable: true,
      hasDebrief: false,
      needsVideoWatch: true,
      requiredSubscriptions: ['associate'],
      isConfigured: false,
      videoProvider: null,
      videoRef: null,
    });
    expect(parsed.hasDebrief).toBe(false);
    expect(parsed.requiredSubscriptions).toEqual(['associate']);
  });

  it('rejects an unknown subscription tier', () => {
    expect(() =>
      boardLessonSchema.parse({
        id: 1,
        name: 'L',
        slug: 'l',
        rank: 1,
        isAvailable: true,
        hasDebrief: true,
        needsVideoWatch: true,
        requiredSubscriptions: ['gold'],
        isConfigured: false,
        videoProvider: null,
        videoRef: null,
      }),
    ).toThrow();
  });
});

describe('boardModuleSchema', () => {
  it('parses a module with requiredSubscriptions', () => {
    const parsed = boardModuleSchema.parse({
      id: 1,
      name: 'M',
      slug: 'm',
      imageUrlAvif: null,
      imageUrlWebp: null,
      rank: 1,
      requiredSubscriptions: ['candidate'],
      lessons: [],
    });
    expect(parsed.requiredSubscriptions).toEqual(['candidate']);
  });
});
