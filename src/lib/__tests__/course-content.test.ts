import { describe, expect, it } from 'vitest';
import {
  allowedLessonVersionIds,
  courseContentToHtml,
  courseOutline,
} from '#/lib/course-content';

describe('courseContentToHtml', () => {
  it('renders course → modules → lessons with material text', () => {
    const html = courseContentToHtml({
      name: '3D Airmanship',
      modules: [
        {
          name: 'Fundamentals',
          lessons: [
            {
              name: 'Pitch',
              text: 'Pitch is nose up/down.',
              proTips: 'Trim early.',
            },
          ],
        },
      ],
    });
    expect(html).toContain('3D Airmanship');
    expect(html).toContain('Fundamentals');
    expect(html).toContain('Pitch');
    expect(html).toContain('Pitch is nose up/down.');
    expect(html).toContain('Trim early.');
  });

  it('omits missing material without crashing', () => {
    const html = courseContentToHtml({
      name: 'C',
      modules: [
        { name: 'M', lessons: [{ name: 'L', text: null, proTips: null }] },
      ],
    });
    expect(html).toContain('L');
  });
});

const gatedCourse = {
  name: 'UAS',
  modules: [
    {
      name: 'Weather',
      lessons: [
        {
          slug: 'wx-1',
          versionId: 101,
          name: 'METARs',
          text: 'x',
          proTips: null,
        },
        {
          slug: 'wx-2',
          versionId: 102,
          name: 'TAFs',
          text: 'y',
          proTips: null,
        },
      ],
    },
    { name: 'Empty', lessons: [] },
  ],
};

describe('course outline helpers', () => {
  it('lists the snapshots of the allowed lessons', () => {
    expect(allowedLessonVersionIds(gatedCourse)).toEqual([101, 102]);
  });
  it('outlines modules and lesson names without material', () => {
    const out = courseOutline(gatedCourse);
    expect(out).toContain('UAS');
    expect(out).toContain('Weather: METARs; TAFs');
    expect(out).toContain('Empty: (no lessons available)');
    expect(out).not.toContain('x');
  });
});
