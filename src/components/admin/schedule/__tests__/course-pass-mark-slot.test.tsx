import { isValidElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

const { PassMarkStub } = vi.hoisted(() => ({
  PassMarkStub: () => null,
}));
vi.mock('#/components/admin/schedule/course-pass-mark-container', () => ({
  CoursePassMarkContainer: PassMarkStub,
}));

import { coursePassMarkSlot } from '#/components/admin/schedule/course-pass-mark-slot';
import type { AdminCourseSummary } from '#/lib/admin-schemas';

const course: AdminCourseSummary = {
  id: 7,
  name: 'ITPS UAS',
  slug: 'itps-uas',
  description: null,
  imageUrlAvif: null,
  imageUrlWebp: null,
  updatedAt: new Date('2026-11-20T00:00:00Z'),
  moduleCount: 2,
  lessonCount: 5,
  passMark: 85,
};

describe('coursePassMarkSlot', () => {
  it('gives the card no pass-mark control without course:update (the endpoint would 403)', () => {
    expect(coursePassMarkSlot(course, false)).toBeUndefined();
  });

  it('gives an admin with course:update the editor for this course', () => {
    const slot = coursePassMarkSlot(course, true);
    if (!isValidElement<{ course: AdminCourseSummary }>(slot)) {
      throw new Error('expected an element');
    }
    expect(slot.type).toBe(PassMarkStub);
    expect(slot.props.course).toBe(course);
  });
});
