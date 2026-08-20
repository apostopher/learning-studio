import { Combobox } from '@base-ui/react/combobox';
import { Dialog } from '@base-ui/react/dialog';
import { Select } from '@base-ui/react/select';
import { Check, ChevronDown, Loader2, X } from 'lucide-react';
import { ScrollArea } from '#/components/scroll-area';
import type { CourseStaffMember } from '#/db/course-staff';
import { roleAcronym, roleDisplayName } from '#/lib/role-labels';

export interface CourseStaffPersonOption {
  userId: string;
  /** What the picker shows and searches — name plus email, or email alone. */
  label: string;
}

interface CourseStaffPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseName: string;
  staff: CourseStaffMember[];
  isLoading: boolean;
  /** Course-scoped role names this actor may grant. */
  assignableRoles: string[];
  /** Whether the assign form renders at all. */
  canAssign: boolean;
  /**
   * Course-scoped role names this actor may take away. Gated per badge, not
   * per panel: an SME may dismiss a course manager and never a peer.
   */
  removableRoles: string[];
  /** Candidates for the person picker — a server-side search result. */
  people: CourseStaffPersonOption[];
  /** The picker's search term. Controlled: the container turns it into a query. */
  peopleQuery: string;
  onPeopleQueryChange: (query: string) => void;
  /** What the picker says when it has nothing to offer, and why. */
  peopleEmptyLabel: string;
  selectedUserId: string | null;
  onSelectedUserIdChange: (userId: string | null) => void;
  selectedRole: string | null;
  onSelectedRoleChange: (role: string | null) => void;
  onAssign: () => void;
  onRemove: (userId: string, role: string) => void;
  isSaving: boolean;
  error?: string;
}

/**
 * Why a control this actor can see is not offered to them.
 *
 * `staff:create` and `staff:delete` are independently grantable, so a roster
 * can legitimately be readable and not writable — and beyond that, removal is
 * railed by ROLE: a subject expert may dismiss their assistant but not a
 * fellow professor. That produces a list where some badges have a Remove
 * control and others do not, which is a genuinely puzzling absence and so
 * earns a sentence. Both controls used to render regardless and 403 on use;
 * hiding them without saying why would only trade a broken control for a
 * mystery.
 */
function staffNotice(
  canAssign: boolean,
  removableRoles: string[],
  staff: CourseStaffMember[],
): string | null {
  const canRemoveAny = removableRoles.length > 0;
  if (!canAssign && !canRemoveAny) {
    return 'You can see the staff for this course but not change it. Ask an admin for permission to assign and remove staff here.';
  }
  if (!canAssign) {
    return 'You can remove staff from this course but not add anyone. Ask an admin for permission to assign staff here.';
  }
  if (!canRemoveAny) {
    return 'You can add staff to this course but not remove anyone. Ask an admin for permission to remove staff here.';
  }
  // Only mention what is actually on screen — a rule about a role nobody
  // holds here is a rule about nothing.
  const locked = [...new Set(staff.flatMap((member) => member.roles))].filter(
    (role) => !removableRoles.includes(role),
  );
  if (locked.length === 0) return null;
  const names = locked.map((role) => `a ${roleDisplayName(role)}`).join(' or ');
  return `Only an admin or owner can remove ${names} from this course.`;
}

function staffDisplayName(member: CourseStaffMember): string {
  const name = [member.firstName, member.lastName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' ');
  return name || member.email;
}

/**
 * Assign or remove `subject-expert` / `course-manager` roles on one course.
 *
 * Pure and hookless — the container owns every piece of state (which is why
 * the person and role pickers are fully controlled rather than using Base
 * UI's `defaultValue`). Role badges show `roleAcronym` as the visible text
 * with `roleDisplayName` carried as the accessible name on the remove
 * button — "SME" alone reads as nothing useful to a screen reader.
 */
export const CourseStaffPanel = ({
  open,
  onOpenChange,
  courseName,
  staff,
  isLoading,
  assignableRoles,
  canAssign,
  removableRoles,
  people,
  peopleQuery,
  onPeopleQueryChange,
  peopleEmptyLabel,
  selectedUserId,
  onSelectedUserIdChange,
  selectedRole,
  onSelectedRoleChange,
  onAssign,
  onRemove,
  isSaving,
  error,
}: CourseStaffPanelProps) => {
  const labelByUserId = new Map(people.map((p) => [p.userId, p.label]));
  const personIds = people.map((p) => p.userId);
  const notice = staffNotice(canAssign, removableRoles, staff);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-gray-1/70 backdrop-blur-sm" />
        <Dialog.Popup className="fixed inset-0 z-40 m-auto grid h-fit max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-[520px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-xl border border-gray-6 bg-gray-2 shadow-xl">
          <div className="flex items-center justify-between gap-4 border-gray-6 border-b px-6 py-4">
            <div className="flex flex-col">
              <Dialog.Title className="font-semibold text-lg text-primary">
                Course staff
              </Dialog.Title>
              <Dialog.Description className="text-secondary text-sm">
                {courseName}
              </Dialog.Description>
            </div>
            <Dialog.Close className="shrink-0 rounded-md p-1.5 text-secondary transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9">
              <X className="h-5 w-5" aria-hidden="true" />
            </Dialog.Close>
          </div>

          <ScrollArea>
            <div className="flex flex-col gap-5 p-6">
              {isLoading ? (
                <p className="flex items-center gap-2 text-secondary text-sm">
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  Loading staff…
                </p>
              ) : staff.length === 0 ? (
                <p className="text-secondary text-sm">No staff assigned yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {staff.map((member) => {
                    const name = staffDisplayName(member);
                    return (
                      <li
                        key={member.userId}
                        className="flex items-center justify-between gap-3 rounded-lg border border-gray-6 bg-gray-1 px-3 py-2.5"
                      >
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium text-primary text-sm">
                            {name}
                          </span>
                          {name !== member.email && (
                            <span className="truncate text-secondary text-xs">
                              {member.email}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {member.roles.map((role) => {
                            const removable = removableRoles.includes(role);
                            return (
                              <span
                                key={role}
                                className={`flex items-center gap-1 rounded bg-gray-4 py-0.5 text-primary text-xs ${removable ? 'ps-2 pe-1' : 'px-2'}`}
                              >
                                {roleAcronym(role)}
                                {/*
                                With no remove button there is nothing else
                                carrying the full role name, and "SME" alone
                                reads as nothing useful. Only rendered in that
                                case: when the button IS there its accessible
                                name already says it, and a second copy would
                                have a screen reader announce it twice.
                              */}
                                {!removable && (
                                  <span className="sr-only">
                                    {roleDisplayName(role)}
                                  </span>
                                )}
                                {removable && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onRemove(member.userId, role)
                                    }
                                    disabled={isSaving}
                                    aria-label={`Remove ${roleDisplayName(role)} from ${name}`}
                                    className="rounded p-0.5 text-secondary transition-colors hover:bg-gray-6 hover:text-primary disabled:pointer-events-none disabled:opacity-50"
                                  >
                                    <X className="h-3 w-3" aria-hidden="true" />
                                  </button>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {error && (
                <p className="rounded-lg border border-error-muted bg-error-subtle px-3 py-2 text-error-text text-sm">
                  {error}
                </p>
              )}

              {canAssign && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    onAssign();
                  }}
                  className="flex flex-col gap-3 border-gray-6 border-t pt-5"
                >
                  <h3 className="font-medium text-primary text-sm">
                    Assign staff
                  </h3>

                  <Combobox.Root
                    items={personIds}
                    value={selectedUserId}
                    onValueChange={(next) =>
                      onSelectedUserIdChange(next as string | null)
                    }
                    itemToStringLabel={(userId: string) =>
                      labelByUserId.get(userId) ?? userId
                    }
                    // The list is already the answer to `peopleQuery` — the
                    // search ran on the server, over a directory this actor
                    // may not read in full. Filtering it again here would
                    // drop matches whose stored name differs from the label.
                    filter={null}
                    inputValue={peopleQuery}
                    onInputValueChange={onPeopleQueryChange}
                    disabled={isSaving}
                  >
                    {/*
                      No <Combobox.Label> here: it only associates with
                      <Combobox.Trigger>, and this picker's form control is
                      <Combobox.Input> directly (Base UI logs a dev warning if
                      a label is added without a trigger) — see LevelPicker.
                      The accessible name is set on the input itself instead.
                    */}
                    <Combobox.Input
                      aria-label="Person to assign"
                      placeholder="Search by name or email"
                      className="w-full rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-primary text-sm placeholder:text-gray-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
                    />
                    <Combobox.Portal>
                      <Combobox.Positioner sideOffset={4} className="z-50">
                        <Combobox.Popup className="w-[var(--anchor-width)] rounded-md border border-gray-6 bg-gray-2 py-1 shadow-lg">
                          <Combobox.Empty className="px-3 py-2 text-secondary text-sm">
                            {peopleEmptyLabel}
                          </Combobox.Empty>
                          <ScrollArea className="max-h-64">
                            <Combobox.List>
                              {(userId: string) => (
                                <Combobox.Item
                                  key={userId}
                                  value={userId}
                                  className="flex cursor-default items-center gap-2 px-3 py-2 text-primary text-sm data-highlighted:bg-gray-4"
                                >
                                  <Combobox.ItemIndicator>
                                    <Check
                                      className="h-3.5 w-3.5"
                                      aria-hidden="true"
                                    />
                                  </Combobox.ItemIndicator>
                                  <span>
                                    {labelByUserId.get(userId) ?? userId}
                                  </span>
                                </Combobox.Item>
                              )}
                            </Combobox.List>
                          </ScrollArea>
                        </Combobox.Popup>
                      </Combobox.Positioner>
                    </Combobox.Portal>
                  </Combobox.Root>

                  <Select.Root
                    value={selectedRole}
                    onValueChange={(next) =>
                      onSelectedRoleChange(next as string | null)
                    }
                    disabled={isSaving}
                  >
                    <Select.Trigger
                      aria-label="Role to assign"
                      className="flex items-center justify-between gap-1.5 rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-primary text-sm transition-colors hover:bg-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:opacity-60"
                    >
                      <Select.Value>
                        {(value: string | null) =>
                          value ? roleDisplayName(value) : 'Choose a role'
                        }
                      </Select.Value>
                      <Select.Icon>
                        <ChevronDown
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                      </Select.Icon>
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Positioner sideOffset={4} className="z-50">
                        <Select.Popup className="rounded-lg border border-gray-6 bg-gray-2 p-1 shadow-lg">
                          {assignableRoles.map((role) => (
                            <Select.Item
                              key={role}
                              value={role}
                              className="cursor-pointer rounded-md px-2 py-1.5 text-primary text-sm data-[highlighted]:bg-gray-4"
                            >
                              <Select.ItemText>
                                {roleDisplayName(role)}
                              </Select.ItemText>
                            </Select.Item>
                          ))}
                        </Select.Popup>
                      </Select.Positioner>
                    </Select.Portal>
                  </Select.Root>

                  <button
                    type="submit"
                    disabled={
                      isSaving ||
                      selectedUserId === null ||
                      selectedRole === null
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-apple-9 px-3 py-2 font-medium text-apple-contrast text-sm transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:opacity-60"
                  >
                    {isSaving && (
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    )}
                    Assign
                  </button>
                </form>
              )}

              {notice && (
                <p className="border-gray-6 border-t pt-5 text-secondary text-sm">
                  {notice}
                </p>
              )}
            </div>
          </ScrollArea>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
