import { describe, expect, it } from 'vitest';
import {
  ADMIN_ROLE,
  COURSE_MANAGER_ROLE,
  OWNER_ROLE,
  SUBJECT_EXPERT_ROLE,
} from '#/lib/admin-schemas';
import { ROLE_LABELS, roleAcronym, roleDisplayName } from '#/lib/role-labels';

describe('ROLE_LABELS', () => {
  it('names every role the system knows', () => {
    expect(Object.keys(ROLE_LABELS).sort()).toEqual(
      [ADMIN_ROLE, COURSE_MANAGER_ROLE, OWNER_ROLE, SUBJECT_EXPERT_ROLE].sort(),
    );
  });

  it('keeps the acronym people say separate from the stored name', () => {
    expect(roleAcronym(SUBJECT_EXPERT_ROLE)).toBe('SME');
    expect(roleDisplayName(SUBJECT_EXPERT_ROLE)).toBe('Subject Expert');
  });

  it('gives the course manager its own acronym', () => {
    expect(roleAcronym(COURSE_MANAGER_ROLE)).toBe('CRS-MGR');
    expect(roleDisplayName(COURSE_MANAGER_ROLE)).toBe('Course Manager');
  });

  it('falls back to the stored name for a role it does not know', () => {
    expect(roleDisplayName('made-up')).toBe('made-up');
    expect(roleAcronym('made-up')).toBe('made-up');
  });
});
