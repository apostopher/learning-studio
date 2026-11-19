import { Tabs } from '@base-ui/react/tabs';
import { Check, Loader2, Lock } from 'lucide-react';
import type { PermissionAction, PermissionEntity } from '#/lib/admin-schemas';
import {
  COLUMN_LABELS,
  PERMISSION_COLUMNS,
  type PermissionSection,
  type RoleSummary,
} from './role-permissions-view';

interface RolePermissionsPanelProps {
  /** Roles the owner configures — `owner` is excluded by the container. */
  roles: RoleSummary[];
  selectedRole: string | null;
  /** The selected role's grid, from `buildRoleSections`. */
  sections: PermissionSection[];
  onSelectRole: (role: string) => void;
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

const COLUMN_HEADER =
  'px-2 py-2 font-semibold text-secondary text-xs uppercase tracking-wider';

/**
 * Permissions, one role at a time: pick a role on the left, see what it may
 * do as area × See/Add/Edit/Remove on the right.
 *
 * Only combinations with an endpoint behind them get a checkbox — a box that
 * enforces nothing would be a dead control. `owner` never appears: it bypasses
 * permission checks, so configuring it would change nothing.
 */
export const RolePermissionsPanel = ({
  roles,
  selectedRole,
  sections,
  onSelectRole,
  onToggle,
  isSaving,
  isLoading,
  error,
}: RolePermissionsPanelProps) => (
  <section
    aria-labelledby="role-permissions-title"
    className="flex flex-col gap-6"
  >
    <header className="flex max-w-2xl flex-col gap-1">
      <h2
        id="role-permissions-title"
        className="font-semibold text-lg text-primary"
      >
        Roles
      </h2>
      <p className="text-secondary text-sm">
        Pick a role to see and change what everyone with it can do.
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
      selectedRole && (
        <Tabs.Root
          value={selectedRole}
          onValueChange={(next) => onSelectRole(String(next))}
          orientation="vertical"
          className="flex flex-wrap items-start gap-6"
        >
          <div className="flex max-w-xs flex-[1_1_16rem] flex-col gap-2">
            <Tabs.List aria-label="Roles" className="flex flex-col gap-2">
              {roles.map((role) => (
                <Tabs.Tab
                  key={role.role}
                  value={role.role}
                  className="flex w-full flex-col gap-1 rounded-xl border border-gray-6 bg-surface px-4 py-3.5 text-start text-primary transition-colors hover:bg-gray-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2 aria-selected:border-apple-9 aria-selected:bg-apple-9 aria-selected:text-apple-contrast"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-[15px]">
                      {role.name}
                    </span>
                    <span className="whitespace-nowrap font-semibold text-xs tabular-nums">
                      {role.heldCount} of {role.totalCount}
                    </span>
                  </span>
                  {role.description && (
                    <span className="text-[13px] leading-snug">
                      {role.description}
                    </span>
                  )}
                </Tabs.Tab>
              ))}
            </Tabs.List>
            <p className="mt-2 rounded-xl border border-gray-6 border-dashed px-4 py-3.5 text-secondary text-[13px] leading-snug">
              <strong className="block font-semibold text-primary">
                Org Owner
              </strong>
              Can always do everything. Not configurable.
            </p>
          </div>

          <Tabs.Panel
            value={selectedRole}
            className="min-w-0 flex-[999_1_35rem] overflow-hidden rounded-xl border border-gray-6 bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
          >
            <header className="flex flex-wrap items-start justify-between gap-3 border-gray-6 border-b px-6 py-5">
              <div className="flex flex-col gap-1">
                <h3 className="font-semibold text-primary text-xl">
                  {roles.find((r) => r.role === selectedRole)?.name}
                </h3>
                <p className="text-secondary text-sm">
                  {roles.find((r) => r.role === selectedRole)?.description}
                </p>
              </div>
              <p
                aria-live="polite"
                className="flex items-center gap-2 text-secondary text-sm"
              >
                {isSaving ? (
                  <>
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                    Saving…
                  </>
                ) : (
                  'Changes save as you tick.'
                )}
              </p>
            </header>

            {sections.map((section) => (
              <div key={section.id} className="px-6 pt-6 pb-2 last:pb-6">
                <h4 className="font-semibold text-[15px] text-primary">
                  {section.title}
                </h4>
                <p className="mt-1 mb-3 text-[13px] text-secondary leading-normal">
                  {section.description}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[32rem] border-collapse text-sm">
                    <caption className="sr-only">{section.title}</caption>
                    <thead>
                      <tr className="border-gray-6 border-b">
                        <th
                          scope="col"
                          className={`${COLUMN_HEADER} w-1/3 ps-0 text-start`}
                        >
                          Area
                        </th>
                        {PERMISSION_COLUMNS.map((action) => (
                          <th
                            key={action}
                            scope="col"
                            className={COLUMN_HEADER}
                          >
                            {COLUMN_LABELS[action]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {section.rows.map((row) => {
                        const reasonId = `permission-reason-${selectedRole}-${row.entity}`;
                        return (
                          <tr
                            key={row.entity}
                            className="border-gray-3 border-b last:border-b-0"
                          >
                            <th
                              scope="row"
                              className="py-2.5 pe-2 text-start align-top font-medium text-primary"
                            >
                              {row.label}
                            </th>
                            {row.kind === 'always' ? (
                              <td
                                colSpan={PERMISSION_COLUMNS.length}
                                className="px-2 py-2.5"
                              >
                                <span
                                  id={reasonId}
                                  className="inline-flex items-center gap-2 rounded-lg bg-accent-muted px-3 py-1.5 text-[13px] text-primary"
                                >
                                  <Check
                                    className="h-4 w-4 shrink-0 text-accent-11"
                                    strokeWidth={2.5}
                                    aria-hidden="true"
                                  />
                                  {row.reason}
                                </span>
                              </td>
                            ) : (
                              row.cells.map((cell, i) => (
                                <td
                                  key={PERMISSION_COLUMNS[i]}
                                  className="px-2 py-0.5 text-center align-top"
                                >
                                  {cell ? (
                                    <label
                                      className={
                                        row.kind === 'locked'
                                          ? 'inline-flex size-11 items-center justify-center'
                                          : 'inline-flex size-11 cursor-pointer items-center justify-center rounded-lg hover:bg-gray-3'
                                      }
                                    >
                                      <input
                                        type="checkbox"
                                        checked={cell.granted}
                                        disabled={
                                          isSaving || row.kind === 'locked'
                                        }
                                        aria-describedby={
                                          row.kind === 'locked'
                                            ? reasonId
                                            : undefined
                                        }
                                        onChange={(event) =>
                                          onToggle(
                                            selectedRole,
                                            row.entity,
                                            cell.action,
                                            event.target.checked,
                                          )
                                        }
                                        className="h-5 w-5 accent-apple-9 disabled:cursor-not-allowed disabled:opacity-60"
                                      />
                                      <span className="sr-only">
                                        {cell.label}
                                      </span>
                                    </label>
                                  ) : (
                                    <span className="inline-flex size-11 items-center justify-center text-secondary">
                                      <span aria-hidden="true">—</span>
                                      <span className="sr-only">
                                        Not applicable
                                      </span>
                                    </span>
                                  )}
                                </td>
                              ))
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {section.rows
                  .filter((row) => row.kind === 'locked')
                  .map((row) => (
                    // Visible, not only aria-describedby: a locked control
                    // must say why in a way sighted and AT users both get.
                    <p
                      key={row.entity}
                      id={`permission-reason-${selectedRole}-${row.entity}`}
                      className="mt-3 flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-[13px] text-secondary"
                    >
                      <Lock
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                        aria-hidden="true"
                      />
                      <span>
                        <strong className="font-semibold text-primary">
                          {row.label}:
                        </strong>{' '}
                        {row.reason}
                      </span>
                    </p>
                  ))}
              </div>
            ))}
          </Tabs.Panel>
        </Tabs.Root>
      )
    )}
  </section>
);
