import {
  GRANTABLE_PERMISSIONS,
  hasAdminAccess,
  isAdminBypassEntity,
  isCourseScopedEntity,
  isCourseScopedRole,
  type PermissionAction,
  type PermissionEntity,
  permissionKey,
} from '#/lib/admin-schemas';
import { roleDisplayName } from '#/lib/role-labels';

/**
 * The view model behind the Permissions tab: one role at a time, its grants
 * laid out as area × action, plus a summary per role for the role picker.
 *
 * Pure so the panel stays presentational and every rule here — which pairs
 * are locked, and the TRUE reason why — is testable without rendering.
 */

/** Column order of the grid. Every entity's actions are a subset of these. */
export const PERMISSION_COLUMNS: readonly PermissionAction[] = [
  'read',
  'create',
  'update',
  'delete',
];

export const COLUMN_LABELS: Record<PermissionAction, string> = {
  read: 'See',
  create: 'Add',
  update: 'Edit',
  delete: 'Remove',
};

export const ENTITY_LABELS: Record<PermissionEntity, string> = {
  user: 'People',
  enrolment: 'Course access',
  level: 'Pilot levels',
  course: 'Courses',
  structure: 'Course structure',
  content: 'Lesson content',
  staff: 'Course staff',
};

/** What each role is for, in a sentence. Unknown roles simply have none. */
const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin: 'Runs the organisation: people, access and courses.',
  'course-manager': 'Runs the courses they are assigned to.',
  'subject-expert': 'Builds and writes lessons where they are assigned.',
};

/**
 * - `toggle`: an ordinary grant the owner may tick.
 * - `always`: the admin bypass — held on every course and discipline with no
 *   grant, so there is nothing to tick.
 * - `locked`: a course-scoped entity on an org-level role. Ticking it would
 *   apply to every course at once (spec §3), so the grid shows what the role
 *   holds today but does not let it change. UI-only: `role-permissions.ts`
 *   still accepts the write from an owner, as the deliberate escape hatch.
 */
export type RowKind = 'toggle' | 'always' | 'locked';

export interface PermissionCell {
  action: PermissionAction;
  /** e.g. "Add course access" — the accessible name of the checkbox. */
  label: string;
  granted: boolean;
}

export interface PermissionRow {
  entity: PermissionEntity;
  label: string;
  kind: RowKind;
  /** One per PERMISSION_COLUMNS entry; `null` where the action doesn't exist. */
  cells: (PermissionCell | null)[];
  /** Why the row can't be ticked. Present exactly when `kind !== 'toggle'`. */
  reason?: string;
}

export interface PermissionSection {
  id: 'organisation' | 'assigned';
  title: string;
  description: string;
  rows: PermissionRow[];
}

export interface RoleSummary {
  role: string;
  name: string;
  description?: string;
  /** Actions this role can perform: its grants plus anything held by bypass. */
  heldCount: number;
  totalCount: number;
}

const ENTITIES = Object.keys(GRANTABLE_PERMISSIONS) as PermissionEntity[];

const TOTAL_ACTIONS = ENTITIES.reduce(
  (sum, entity) => sum + GRANTABLE_PERMISSIONS[entity].length,
  0,
);

export function rowKind(role: string, entity: PermissionEntity): RowKind {
  if (!isCourseScopedEntity(entity) || isCourseScopedRole(role)) {
    return 'toggle';
  }
  return hasAdminAccess([role]) && isAdminBypassEntity(entity)
    ? 'always'
    : 'locked';
}

/**
 * The reason must be TRUE for this role. An admin already holds `structure`
 * and `content` everywhere by bypass, so "assign someone to the course
 * instead" would tell the owner the opposite of what the system does.
 */
function reasonFor(role: string, kind: RowKind): string | undefined {
  const name = roleDisplayName(role);
  if (kind === 'always') {
    return `${name} can always do this, on every course and discipline. Nothing to grant.`;
  }
  if (kind === 'locked') {
    return `${name} is an org-level role, so a change here would apply to every course at once. Assign someone on the course instead.`;
  }
  return undefined;
}

function isHeld(
  role: string,
  entity: PermissionEntity,
  action: PermissionAction,
  granted: Record<string, string[]>,
): boolean {
  if (rowKind(role, entity) === 'always') return true;
  return (granted[role] ?? []).includes(permissionKey(entity, action));
}

export function buildRoleSummaries(
  roles: string[],
  granted: Record<string, string[]>,
): RoleSummary[] {
  return roles.map((role) => ({
    role,
    name: roleDisplayName(role),
    description: ROLE_DESCRIPTIONS[role],
    heldCount: ENTITIES.reduce(
      (sum, entity) =>
        sum +
        GRANTABLE_PERMISSIONS[entity].filter((action) =>
          isHeld(role, entity, action, granted),
        ).length,
      0,
    ),
    totalCount: TOTAL_ACTIONS,
  }));
}

function buildRow(
  role: string,
  entity: PermissionEntity,
  granted: Record<string, string[]>,
): PermissionRow {
  const kind = rowKind(role, entity);
  const label = ENTITY_LABELS[entity];
  return {
    entity,
    label,
    kind,
    reason: reasonFor(role, kind),
    cells: PERMISSION_COLUMNS.map((action) =>
      GRANTABLE_PERMISSIONS[entity].includes(action)
        ? {
            action,
            label: `${COLUMN_LABELS[action]} ${label.toLowerCase()}`,
            granted: isHeld(role, entity, action, granted),
          }
        : null,
    ),
  };
}

export function buildRoleSections(
  role: string,
  granted: Record<string, string[]>,
): PermissionSection[] {
  return [
    {
      id: 'organisation',
      title: 'Across the organisation',
      description: 'Applies everywhere, to everyone with this role.',
      rows: ENTITIES.filter((e) => !isCourseScopedEntity(e)).map((e) =>
        buildRow(role, e, granted),
      ),
    },
    {
      id: 'assigned',
      title: 'Only where they are assigned',
      description:
        'Course structure and staff follow who is assigned to the course. Lesson content follows who is assigned to the lesson’s discipline.',
      rows: ENTITIES.filter(isCourseScopedEntity).map((e) =>
        buildRow(role, e, granted),
      ),
    },
  ];
}

/** The URL's role if it is one on offer, else the first role, else none. */
export function resolveSelectedRole(
  roles: string[],
  requested: string | null,
): string | null {
  if (requested && roles.includes(requested)) return requested;
  return roles[0] ?? null;
}
