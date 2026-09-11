import { parseAsStringLiteral } from 'nuqs';
import { z } from 'zod';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// reached by the route tests.
import { hasAdminAccess, hasOrgPermission } from '#/lib/admin-schemas';

/**
 * The admin sections, in the order they are read in the nav.
 *
 * A section is a value in the URL now, not a route: every screen under
 * `/admin` lives at `/admin?section=…`, with the knowledge library as the
 * default and therefore what a bare `/admin` shows. Reordering the nav means
 * reordering this array and nothing else.
 *
 * The ids are the URL values, so they are part of the app's public surface —
 * renaming one breaks anybody's bookmark.
 */
export const ADMIN_SECTION_IDS = [
  'knowledge-library',
  '3d-airmanship',
  'schedule',
  'people',
] as const;

export type AdminSectionId = (typeof ADMIN_SECTION_IDS)[number];

/**
 * What `/admin` shows with no `section` in the URL: the one screen every actor
 * this shell admits can use.
 */
export const DEFAULT_ADMIN_SECTION: AdminSectionId = 'knowledge-library';

export const ADMIN_SECTION_LABELS: Record<AdminSectionId, string> = {
  // Not "Library": the editor's own left-hand pane is already called that, and
  // a nav item sharing the name would read as a link to the pane rather than
  // to the screen holding it.
  'knowledge-library': 'Knowledge library',
  '3d-airmanship': '3D airmanship',
  schedule: 'Schedule',
  people: 'People',
};

/**
 * The nuqs parser for `?section=`. An unrecognised value reads as the default
 * rather than throwing, so a mistyped or stale URL lands somewhere useful.
 */
export const adminSectionParser = parseAsStringLiteral(
  ADMIN_SECTION_IDS,
).withDefault(DEFAULT_ADMIN_SECTION);

/**
 * `validateSearch` for the section screen.
 *
 * **Loose, deliberately.** Sections keep their own state in the same query
 * string — People alone owns `q`, `tab`, `course` and `level`, and its
 * permissions tab is a shareable link because of it. A strict object would
 * strip every one of them on the next navigation, so unknown keys pass
 * through untouched.
 *
 * `.catch(undefined)` rather than a hard failure: `validateSearch` throwing
 * turns a junk URL into an error boundary, and the honest answer to
 * `?section=nonsense` is the default section.
 */
export const adminSearchSchema = z.looseObject({
  section: z.enum(ADMIN_SECTION_IDS).optional().catch(undefined),
});

export type AdminSearch = z.infer<typeof adminSearchSchema>;

/**
 * The router context this reads — the same four fields `/admin`'s own entry
 * guard reads, and nothing per-course or per-discipline, which global context
 * cannot answer.
 */
export type AdminSectionContext = {
  roles: string[];
  permissions: string[];
  isStaffAnywhere: boolean;
  isCourseStaffAnywhere: boolean;
};

/**
 * Which sections this actor may reach, keyed by id.
 *
 * ONE function, called by both the nav (which links are offered) and the
 * section screen (which sections may be entered directly by URL). Two copies
 * of these conditions is how a nav link and its destination come to disagree —
 * either a link that redirects straight back, or a section reachable by typing
 * its URL that the nav deliberately withholds.
 *
 * Each condition mirrors the guard on the endpoints behind that section. None
 * of it is enforcement: every read and write goes through its own server-side
 * guard, and this only decides what to offer.
 */
export function adminSectionGates(
  context: AdminSectionContext,
): Record<AdminSectionId, boolean> {
  const { roles, permissions, isStaffAnywhere, isCourseStaffAnywhere } =
    context;

  // The knowledge library editor's two endpoints (`/api/admin/library`,
  // `/api/admin/editor`) guard on `isStaffAnywhere`, so this mirrors that
  // union exactly: admin/owner, any course staffing, any discipline staffing.
  //
  // `isStaffAnywhere` and NOT `isCourseStaffAnywhere` — the opposite of
  // `schedule` below, and the whole reason the context carries both. A
  // discipline-only SME staffs no course, so the schedule board would come
  // back empty for them; the library is the screen built FOR them and comes
  // back full. Course staff are included too: the editor's right-hand pane is
  // course composition, which is their work.
  //
  // Identical to the condition `/admin`'s `beforeLoad` uses to admit anyone to
  // the shell at all, which is why this section is always reachable from
  // inside it — and why it is the default.
  const knowledgeLibrary = hasAdminAccess(roles) || isStaffAnywhere;

  // `course:read` covers the whole catalogue; a staff-only actor holds no such
  // grant but still gets their own courses back from the same endpoint. So the
  // condition is "the board has content for you", not one permission.
  //
  // Course staffing specifically: a discipline-only SME is inside this shell
  // but staffs no course, so the board would come back empty for them.
  const schedule =
    hasOrgPermission(roles, permissions, 'course', 'read') ||
    isCourseStaffAnywhere;

  return {
    'knowledge-library': knowledgeLibrary,
    // A placeholder with no data behind it, so there is nothing that could
    // come back empty for anyone: the honest condition is the one that
    // admitted the actor to the shell. It gets a gate of its own when it gets
    // content.
    '3d-airmanship': knowledgeLibrary,
    schedule,
    // `hasOrgPermission`, not the bare grant: `GET /api/admin/users` goes
    // through `requirePermission`, which refuses anyone who is not admin or
    // owner before it looks at a grant. Gated on the grant alone, an owner
    // could tick `user:read` for a non-admin role and hand that person a
    // screen whose every request 403s.
    people: hasOrgPermission(roles, permissions, 'user', 'read'),
  };
}

/** The sections to offer, in nav order, with their labels. */
export function visibleAdminSections(
  gates: Record<AdminSectionId, boolean>,
): { id: AdminSectionId; label: string }[] {
  return ADMIN_SECTION_IDS.filter((id) => gates[id]).map((id) => ({
    id,
    label: ADMIN_SECTION_LABELS[id],
  }));
}
