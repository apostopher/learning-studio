import { describe, expect, it } from 'vitest';
import {
  FLAGSHIP_COURSE_SLUG,
  findFlagshipCourse,
} from '#/lib/flagship-course';

describe('findFlagshipCourse', () => {
  it('finds the course by the flagship slug', () => {
    const boards = [
      { course: { id: 2, name: 'ITPS', slug: 'itps' } },
      { course: { id: 6, name: '3D Airmanship', slug: FLAGSHIP_COURSE_SLUG } },
    ];
    expect(findFlagshipCourse(boards)).toEqual({
      id: 6,
      name: '3D Airmanship',
      slug: '3d-airmanship',
    });
  });
  it('is null when no course carries the slug — the button then renders nowhere', () => {
    expect(
      findFlagshipCourse([{ course: { id: 2, name: 'ITPS', slug: 'itps' } }]),
    ).toBeNull();
  });
});
