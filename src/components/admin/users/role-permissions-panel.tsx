import { Loader2 } from 'lucide-react';
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

interface RolePermissionsPanelProps {
  /** Roles the grid configures — `owner` is excluded by the container. */
  roles: string[];
  /** `entity:action` strings currently granted, keyed by role name. */
  granted: Record<string, string[]>;
  onToggle: (
    role: string,
    entity: PermissionEntity,
    action: PermissionAction,
    granted: boolean,
  ) => void;
  isSaving: boolean;
  isLoading: boolean;
  error?: string;
}

const ENTITY_LABELS: Record<PermissionEntity, string> = {
  user: 'People',
  enrolment: 'Course access',
  level: 'Pilot levels',
  course: 'Courses',
  structure: 'Course structure',
  content: 'Course content',
  staff: 'Course staff',
};

const ACTION_LABELS: Record<PermissionAction, string> = {
  read: 'View',
  create: 'Add',
  update: 'Edit',
  delete: 'Remove',
};

/**
 * Whether this ROLE may be granted this ENTITY here — a per-pair lock, not a
 * per-entity one.
 *
 * `structure`, `content` and `staff` really are configured in this table:
 * `requireCoursePermission` unions an actor's global and `course_staff` roles
 * and hands the names to `getUserPermissions`, which reads `role_permissions`
 * keyed on role NAME. `course_staff` supplies only which role someone holds on
 * which course — never what that role may do. So a subject expert's
 * `structure:*` and `content:*` live in exactly the rows this grid edits, and
 * ticking them for `subject-expert` or `course-manager` is legitimate
 * configuration.
 *
 * What must stay locked is the same entity on an ORG-LEVEL role. `admin` is
 * global, so `structure:update` on `admin` is authoring authority over every
 * course at once — which spec §3 forbids ("admin is a jack of all trades…and
 * cannot author"; to edit a course an admin assigns themselves as an SME,
 * which is a visible act recorded in `course_staff.assigned_by`).
 *
 * The lock is UI-only. `role-permissions.ts` still accepts
 * `{ role: 'admin', entity: 'structure' }` over HTTP — owner-only, so not an
 * escalation, and deliberately the escape hatch for a deployment that decides
 * otherwise.
 */
function courseGrantLockedFor(role: string, entity: PermissionEntity): boolean {
  return isCourseScopedEntity(entity) && !isCourseScopedRole(role);
}

/**
 * Why the checkbox is locked — and it must say the TRUE reason, which now
 * differs by role.
 *
 * For an admin on `structure` or `content` the old sentence ("assign someone
 * to the course instead") became false the day the admin bypass landed: an
 * admin already holds both on every course and every discipline without any
 * grant. A security-configuration screen telling its owner the opposite of
 * what the system does is worse than one that says nothing, so this branches.
 *
 * The lock itself is right in both cases — ticking the box would change
 * nothing either way — but only one of the two reasons is now true.
 */
const lockReason = (role: string, entity: PermissionEntity) => {
  if (hasAdminAccess([role]) && isAdminBypassEntity(entity)) {
    return `${roleDisplayName(role)} already holds this on every course and discipline — granting it here would change nothing.`;
  }
  return `${roleDisplayName(role)} is an org-level role — granting this here would apply to every course. Assign someone to the course instead.`;
};

/**
 * What a role may do, as entity × action.
 *
 * Only combinations with an endpoint behind them are offered — a checkbox that
 * enforces nothing would be a dead control. `owner` never appears: it bypasses
 * permission checks, so configuring it would change nothing.
 */
export const RolePermissionsPanel = ({
  roles,
  granted,
  onToggle,
  isSaving,
  isLoading,
  error,
}: RolePermissionsPanelProps) => (
  <section className="flex flex-col gap-4 rounded-xl border border-gray-6 bg-gray-2 p-6">
    <header className="flex flex-col gap-1">
      <h2 className="font-semibold text-lg text-primary">
        Roles &amp; permissions
      </h2>
      <p className="text-secondary text-sm">
        What each role may do once you give it to someone. The course entities
        are per course — a subject expert holds them only where they are
        assigned. Owners bypass these checks entirely, so they aren't listed.
      </p>
    </header>

    {error && (
      <p className="rounded-lg border border-error-muted bg-error-subtle px-3 py-2 text-error-text text-sm">
        {error}
      </p>
    )}

    {isLoading ? (
      <p className="flex items-center gap-2 text-secondary text-sm">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading permissions…
      </p>
    ) : (
      roles.map((role) => (
        <div key={role} className="flex flex-col gap-3">
          <h3 className="font-medium text-primary text-sm capitalize">
            {role}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {(Object.keys(GRANTABLE_PERMISSIONS) as PermissionEntity[]).map(
              (entity) => {
                const locked = courseGrantLockedFor(role, entity);
                const reasonId = `course-scoped-reason-${role}-${entity}`;
                return (
                  <fieldset
                    key={entity}
                    className="rounded-lg border border-gray-6 bg-gray-1 p-3"
                  >
                    <legend className="px-1 font-medium text-primary text-sm">
                      {ENTITY_LABELS[entity]}
                    </legend>
                    <div className="flex flex-col gap-2 pt-1">
                      {GRANTABLE_PERMISSIONS[entity].map((action) => {
                        const key = permissionKey(entity, action);
                        const isOn = (granted[role] ?? []).includes(key);
                        return (
                          <label
                            key={action}
                            className={
                              locked
                                ? 'flex items-center gap-2.5'
                                : 'flex cursor-pointer items-center gap-2.5'
                            }
                          >
                            <input
                              type="checkbox"
                              checked={isOn}
                              disabled={isSaving || locked}
                              aria-describedby={locked ? reasonId : undefined}
                              onChange={(event) =>
                                onToggle(
                                  role,
                                  entity,
                                  action,
                                  event.target.checked,
                                )
                              }
                              className="h-4 w-4 accent-apple-9 disabled:cursor-not-allowed disabled:opacity-60"
                            />
                            <span className="text-primary text-sm">
                              {ACTION_LABELS[action]}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    {locked && (
                      // Visible, not just an aria-describedby: a disabled
                      // control must say why it's unavailable in a way
                      // sighted and assistive-tech users both get, not one
                      // conveyed by styling (greyed-out) alone.
                      <p id={reasonId} className="pt-2 text-tertiary text-xs">
                        {lockReason(role, entity)}
                      </p>
                    )}
                  </fieldset>
                );
              },
            )}
          </div>
        </div>
      ))
    )}
  </section>
);
