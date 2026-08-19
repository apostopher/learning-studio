import { Loader2 } from 'lucide-react';
import {
  GRANTABLE_PERMISSIONS,
  type PermissionAction,
  type PermissionEntity,
  permissionKey,
} from '#/lib/admin-schemas';

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
};

const ACTION_LABELS: Record<PermissionAction, string> = {
  read: 'View',
  create: 'Add',
  update: 'Edit',
  delete: 'Remove',
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
        What an admin may do once you make someone an admin. Owners bypass these
        checks entirely, so they aren't listed.
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
              (entity) => (
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
                          className="flex cursor-pointer items-center gap-2.5"
                        >
                          <input
                            type="checkbox"
                            checked={isOn}
                            disabled={isSaving}
                            onChange={(event) =>
                              onToggle(
                                role,
                                entity,
                                action,
                                event.target.checked,
                              )
                            }
                            className="h-4 w-4 accent-apple-9"
                          />
                          <span className="text-primary text-sm">
                            {ACTION_LABELS[action]}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ),
            )}
          </div>
        </div>
      ))
    )}
  </section>
);
