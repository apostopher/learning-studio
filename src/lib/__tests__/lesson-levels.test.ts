import { describe, expect, it } from 'vitest';
import { nextLessonLevels } from '#/lib/lesson-levels';

describe('nextLessonLevels', () => {
  it("mode 'none' replaces every real level with ['none']", () => {
    expect(nextLessonLevels(['basic', 'advanced'], 'none')).toEqual(['none']);
    expect(nextLessonLevels([], 'none')).toEqual(['none']);
  });

  it("mode 'none' on a 'none' lesson clears it back to every level", () => {
    expect(nextLessonLevels(['none'], 'none')).toEqual([]);
  });

  it("a real level on a 'none' lesson replaces it", () => {
    expect(nextLessonLevels(['none'], 'intermediate')).toEqual([
      'intermediate',
    ]);
  });

  it('a real level is added when absent, keeping the others', () => {
    expect(nextLessonLevels(['advanced'], 'basic')).toEqual([
      'advanced',
      'basic',
    ]);
  });

  it('a real level is removed when present, keeping the others', () => {
    expect(nextLessonLevels(['basic', 'advanced'], 'basic')).toEqual([
      'advanced',
    ]);
  });
});
