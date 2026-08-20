import {
  ADMIN_ROLE,
  COURSE_MANAGER_ROLE,
  OWNER_ROLE,
  SUBJECT_EXPERT_ROLE,
} from '#/lib/admin-schemas';

/**
 * What a role is called to a person, kept apart from the string in the database.
 *
 * The stored names are an internal contract compared literally by every guard;
 * these are what an owner reads in the permission grid. Renaming must be a
 * one-line change here, never a migration — the same reasoning as LEVEL_LABELS.
 */
export const ROLE_LABELS: Record<string, { name: string; acronym: string }> = {
  [OWNER_ROLE]: { name: 'Org Owner', acronym: 'OWNER' },
  [ADMIN_ROLE]: { name: 'Org Admin', acronym: 'ADMIN' },
  [SUBJECT_EXPERT_ROLE]: { name: 'Subject Expert', acronym: 'SME' },
  [COURSE_MANAGER_ROLE]: { name: 'Course Manager', acronym: 'CRS-MGR' },
};

export function roleDisplayName(role: string): string {
  return ROLE_LABELS[role]?.name ?? role;
}

export function roleAcronym(role: string): string {
  return ROLE_LABELS[role]?.acronym ?? role;
}
