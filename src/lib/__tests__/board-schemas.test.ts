import { describe, expect, it } from 'vitest';

// admin-schemas.ts imports via the `#/` alias (`#/lib/video-providers`,
// `#/types`), not `@/`, so no mocking is needed here — these tests exercise
// the real modules directly.
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
      levels: [],
      isConfigured: false,
      quizQuestionCount: 0,
      dependsOn: [],
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
        levels: [],
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
      dependsOn: [],
      sequentialLessons: true,
      learnerCount: 0,
      lessons: [],
    });
    expect(parsed.requiredSubscriptions).toEqual(['candidate']);
  });

  it('parses prerequisite slugs and a learner count', () => {
    const parsed = boardModuleSchema.parse({
      id: 2,
      name: 'M2',
      slug: 'm2',
      imageUrlAvif: null,
      imageUrlWebp: null,
      rank: 2,
      requiredSubscriptions: [],
      dependsOn: ['m'],
      sequentialLessons: true,
      learnerCount: 12,
      lessons: [],
    });
    expect(parsed.dependsOn).toEqual(['m']);
    expect(parsed.learnerCount).toBe(12);
  });
});
