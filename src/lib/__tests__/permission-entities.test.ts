import { describe, expect, it } from 'vitest';
import {
  COURSE_SCOPED_ENTITIES,
  GRANTABLE_PERMISSIONS,
  isCourseScopedEntity,
  PERMISSION_ENTITIES,
} from '#/lib/admin-schemas';

describe('permission entities', () => {
  it('grants a set of actions for every entity', () => {
    for (const entity of PERMISSION_ENTITIES) {
      expect(GRANTABLE_PERMISSIONS[entity].length).toBeGreaterThan(0);
    }
  });

  it('treats structure, content and staff as course-scoped', () => {
    expect(isCourseScopedEntity('structure')).toBe(true);
    expect(isCourseScopedEntity('content')).toBe(true);
    expect(isCourseScopedEntity('staff')).toBe(true);
  });

  it('does not treat course as course-scoped — it is org-level', () => {
    expect(isCourseScopedEntity('course')).toBe(false);
  });

  it('keeps the existing org-level entities org-level', () => {
    for (const entity of ['user', 'enrolment', 'level'] as const) {
      expect(isCourseScopedEntity(entity)).toBe(false);
    }
  });

  it('never lets a course-scoped entity be granted an update on staff', () => {
    // Assignments are added or removed, never edited.
    expect(GRANTABLE_PERMISSIONS.staff).not.toContain('update');
  });

  it('lists every course-scoped entity in PERMISSION_ENTITIES', () => {
    for (const entity of COURSE_SCOPED_ENTITIES) {
      expect(PERMISSION_ENTITIES).toContain(entity);
    }
  });
});
