import { describe, expect, it } from 'vitest';
import {
  filterCourseToLevel,
  isLessonOpenAtLevel,
  isLessonOptionalAtLevel,
  markOptionalAtLevel,
} from '#/lib/level-visibility';

const gated = (levels: string[]) => ({ levels, levelGated: true });
const ungated = { levels: [], levelGated: false };

describe('required vs optional 3D lessons (2026-11-27)', () => {
  it('opens another tier’s lesson to a pilot with a level, as optional', () => {
    expect(isLessonOpenAtLevel(gated(['advanced']), 'basic')).toBe(true);
    expect(isLessonOptionalAtLevel(gated(['advanced']), 'basic')).toBe(true);
  });

  it('keeps the pilot’s own tier required, not optional', () => {
    expect(isLessonOpenAtLevel(gated(['basic']), 'basic')).toBe(true);
    expect(isLessonOptionalAtLevel(gated(['basic']), 'basic')).toBe(false);
  });

  it('never opens a withdrawn or untagged lesson', () => {
    expect(isLessonOpenAtLevel(gated(['none']), 'basic')).toBe(false);
    expect(isLessonOpenAtLevel(gated([]), 'advanced')).toBe(false);
  });

  it('opens no 3D lesson to a pilot with no level', () => {
    expect(isLessonOpenAtLevel(gated(['basic']), null)).toBe(false);
  });

  it('never calls a lesson outside 3D Airmanship optional', () => {
    expect(isLessonOptionalAtLevel(ungated, 'basic')).toBe(false);
    expect(isLessonOpenAtLevel(ungated, null)).toBe(true);
  });

  it('marks lessons and all-optional modules, keeping the required tree apart', () => {
    const course = {
      modules: [
        {
          slug: 'mixed',
          lessons: [
            { slug: 'b', ...gated(['basic']) },
            { slug: 'a', ...gated(['advanced']) },
          ],
        },
        { slug: 'adv', lessons: [{ slug: 'a2', ...gated(['advanced']) }] },
        { slug: 'gone', lessons: [{ slug: 'n', ...gated(['none']) }] },
      ],
    };
    const shown = markOptionalAtLevel(course, 'basic');
    expect(
      shown.modules.map((m) => [
        m.slug,
        m.optional,
        m.lessons.map((l) => [l.slug, l.optional]),
      ]),
    ).toEqual([
      [
        'mixed',
        false,
        [
          ['b', false],
          ['a', true],
        ],
      ],
      ['adv', true, [['a2', true]]],
    ]);
    // Locks and progress run on the required tree: no optional lesson in it.
    expect(
      filterCourseToLevel(course, 'basic').modules.flatMap((m) =>
        m.lessons.map((l) => l.slug),
      ),
    ).toEqual(['b']);
  });
});
