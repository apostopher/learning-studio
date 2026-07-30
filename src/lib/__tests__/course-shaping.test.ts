import { describe, expect, it } from 'vitest';
import { shapeModuleLessons } from '#/lib/course-shaping';

const lesson = (id: number, rank: string, isAvailable = true) => ({
  id,
  rank,
  isAvailable,
  dependsOn: [] as { lessonSlug: string; moduleSlug: string }[],
});

describe('shapeModuleLessons', () => {
  it('drops unavailable lessons', () => {
    const mod = {
      lessons: [lesson(1, '1'), lesson(2, '2', false), lesson(3, '3')],
    };
    shapeModuleLessons([mod]);
    expect(mod.lessons.map((l) => l.id)).toEqual([1, 3]);
  });

  it('sorts the remaining lessons by numeric rank', () => {
    const mod = {
      lessons: [lesson(1, '30'), lesson(2, '4'), lesson(3, '100')],
    };
    shapeModuleLessons([mod]);
    // String comparison would give 100, 30, 4 — rank is numeric(30,15).
    expect(mod.lessons.map((l) => l.id)).toEqual([2, 1, 3]);
  });

  it('adds no dependencies of its own', () => {
    const mod = { lessons: [lesson(1, '1'), lesson(2, '2'), lesson(3, '3')] };
    shapeModuleLessons([mod]);
    // The deleted block chained every lesson to its predecessor for module ids
    // 2..5, which after the ITPS import meant 36 lessons became sequential by
    // accident of primary key.
    expect(mod.lessons.every((l) => l.dependsOn.length === 0)).toBe(true);
  });
});
