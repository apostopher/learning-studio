import { describe, expect, it } from 'vitest';
import {
  ADMIN_SECTION_IDS,
  adminSearchSchema,
  adminSectionGates,
  adminSectionParser,
  DEFAULT_ADMIN_SECTION,
  visibleAdminSections,
} from '../admin-sections';

const context = (over: Partial<Parameters<typeof adminSectionGates>[0]> = {}) =>
  adminSectionGates({
    roles: [],
    permissions: [],
    isStaffAnywhere: false,
    isCourseStaffAnywhere: false,
    ...over,
  });

describe('admin section order and default', () => {
  /**
   * The nav order is a product decision and this array is the only place it
   * lives. Pinned as a whole rather than "schedule comes after people", so
   * inserting a section in the wrong slot is what goes red.
   */
  it('reads knowledge library, 3D airmanship, schedule, people', () => {
    expect(ADMIN_SECTION_IDS).toEqual([
      'knowledge-library',
      '3d-airmanship',
      'schedule',
      'people',
    ]);
  });

  it('defaults to the knowledge library', () => {
    expect(DEFAULT_ADMIN_SECTION).toBe('knowledge-library');
    // What a bare `/admin` resolves to, through the parser the component uses.
    expect(adminSectionParser.parseServerSide(undefined)).toBe(
      'knowledge-library',
    );
  });

  /**
   * A stale or mistyped `?section=` must land somewhere useful rather than
   * rendering nothing — the component switches on this value, so an
   * unrecognised one falling through as-is would be a blank screen.
   */
  it('reads an unrecognised section as the default', () => {
    expect(adminSectionParser.parseServerSide('nonsense')).toBe(
      'knowledge-library',
    );
    expect(adminSearchSchema.parse({ section: 'nonsense' }).section).toBe(
      undefined,
    );
  });

  /**
   * Sections keep their own state in the same query string — People alone owns
   * `q`, `tab`, `course` and `level`, and its permissions tab is a shareable
   * link because of it.
   *
   * Mutant seen RED: `z.object(...)` instead of `z.looseObject(...)`, which
   * strips every one of them on the next navigation and quietly breaks the
   * links this shell hands out.
   */
  it('carries every other section parameter through untouched', () => {
    expect(
      adminSearchSchema.parse({
        section: 'people',
        tab: 'permissions',
        q: 'a',
      }),
    ).toEqual({ section: 'people', tab: 'permissions', q: 'a' });
  });
});

describe('adminSectionGates', () => {
  /**
   * The whole reason the router context carries two staffing booleans. A
   * discipline-scoped SME is admitted to the shell by `isStaffAnywhere` — they
   * own their discipline's lesson content — but they staff no course, so the
   * schedule board has nothing to show them. Offering it would be a link that
   * redirects straight back.
   */
  it('gives a discipline-only SME the library but not the schedule', () => {
    const gates = context({ isStaffAnywhere: true });

    expect(gates['knowledge-library']).toBe(true);
    expect(gates.schedule).toBe(false);
    expect(gates.people).toBe(false);
  });

  it('gives course staff the schedule with no course:read grant', () => {
    // The staff-only actor the second term exists for: no catalogue grant, but
    // the board returns their own courses from the same endpoint.
    const gates = context({
      isStaffAnywhere: true,
      isCourseStaffAnywhere: true,
    });

    expect(gates.schedule).toBe(true);
  });

  it('gives an admin holding course:read the schedule though they staff nothing', () => {
    // The ROLE as well as the grant. `GET /api/admin/courses` goes through
    // `requirePermission`, which refuses a non-admin before it reads any
    // grant — so this mirrors both halves.
    const gates = context({ roles: ['admin'], permissions: ['course:read'] });

    expect(gates.schedule).toBe(true);
  });

  /**
   * Mutant this catches — and it is what shipped once: the flag built from the
   * permission key alone, which is more permissive than the endpoint it stands
   * for. The permission grid lets an owner tick `course:read` for a non-admin
   * role, which is how this is reachable.
   */
  it('withholds the schedule from a non-admin holding course:read', () => {
    expect(context({ permissions: ['course:read'] }).schedule).toBe(false);
  });

  it('gates people on user:read plus the admin floor, never on staffing', () => {
    expect(
      context({ roles: ['admin'], permissions: ['user:read'] }).people,
    ).toBe(true);
    // Staffing is not a route to People, and never was.
    expect(
      context({ isStaffAnywhere: true, isCourseStaffAnywhere: true }).people,
    ).toBe(false);
    // Nor is the grant on its own: `GET /api/admin/users` refuses a non-admin
    // before it reads any grant, so a link here would lead straight to a 403.
    expect(context({ permissions: ['user:read'] }).people).toBe(false);
  });

  /**
   * The library is the screen the discipline-scoped SME exists for, and its
   * two endpoints (`/api/admin/library`, `/api/admin/editor`) gate on
   * `isStaffAnywhere` — so this must too. It is also the default section, so
   * anyone the shell admits must have it: a closed default would be a screen
   * with nowhere to land.
   *
   * Mutant seen RED: `knowledgeLibrary` built from `isCourseStaffAnywhere`
   * (the schedule's condition, copied) — the SME loses the one screen built
   * for them while every endpoint behind it serves them happily.
   */
  it('gives the library and 3D airmanship to everyone the shell admits', () => {
    for (const admitted of [
      { isStaffAnywhere: true },
      { isStaffAnywhere: true, isCourseStaffAnywhere: true },
      { roles: ['admin'] },
    ]) {
      const gates = context(admitted);
      expect(gates[DEFAULT_ADMIN_SECTION]).toBe(true);
      expect(gates['3d-airmanship']).toBe(true);
    }
  });

  /**
   * A learner has no standing on the teaching side at all. (They never reach
   * the shell either — its `beforeLoad` turns them away — but no section's own
   * condition may be the thing that would have let them through.)
   *
   * Mutant seen RED: any gate hardcoded to `true`, which every case above
   * would happily pass.
   */
  it('gives a learner nothing', () => {
    expect(Object.values(context({ roles: ['associate'] }))).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
});

describe('visibleAdminSections', () => {
  it('keeps nav order and drops what is closed', () => {
    const sections = visibleAdminSections(context({ isStaffAnywhere: true }));

    expect(sections.map((s) => s.id)).toEqual([
      'knowledge-library',
      '3d-airmanship',
    ]);
    expect(sections.map((s) => s.label)).toEqual([
      'Knowledge library',
      '3D airmanship',
    ]);
  });

  it('offers nothing to an actor with no section', () => {
    expect(visibleAdminSections(context())).toEqual([]);
  });
});
