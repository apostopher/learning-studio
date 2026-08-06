import { Dialog } from '@base-ui/react/dialog';
import { Loader2, X } from 'lucide-react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { ScrollArea } from '#/components/scroll-area';
import { cn } from '#/lib/cn';
import type { UserRow } from './users-table';

export interface CourseOption {
  id: number;
  name: string;
}

interface UserDetailModalProps {
  row: UserRow | null;
  onClose: () => void;
  allCourses: CourseOption[];

  /** Course toggles are hidden entirely when the actor can't change them. */
  canEditEnrolments: boolean;
  onToggleCourse: (courseId: number, granted: boolean) => void;
  pendingCourseId: number | null;

  canEditProfile: boolean;
  registerFirstName: UseFormRegisterReturn;
  registerLastName: UseFormRegisterReturn;
  registerCallSign: UseFormRegisterReturn;
  registerPhone: UseFormRegisterReturn;
  onSaveProfile: () => void;
  isSavingProfile: boolean;
  profileError?: string;

  /** Owner-only: role assignment is never a grantable permission. */
  isOwner: boolean;
  assignableRoles: string[];
  onToggleRole: (role: string, granted: boolean) => void;
  roleError?: string;
  isSavingRole: boolean;
}

/**
 * Everything about one person: profile, courses, and — for an owner — roles.
 *
 * Controls the actor can't use are absent rather than disabled: a control that
 * can never be enabled is absence, not a locked state, so there is nothing to
 * explain and nothing teased.
 */
export const UserDetailModal = ({
  row,
  onClose,
  allCourses,
  canEditEnrolments,
  onToggleCourse,
  pendingCourseId,
  canEditProfile,
  registerFirstName,
  registerLastName,
  registerCallSign,
  registerPhone,
  onSaveProfile,
  isSavingProfile,
  profileError,
  isOwner,
  assignableRoles,
  onToggleRole,
  roleError,
  isSavingRole,
}: UserDetailModalProps) => {
  const isPending = row?.kind === 'pending';
  const enrolledIds = new Set(row?.courses.map((c) => c.id) ?? []);

  return (
    <Dialog.Root
      open={row !== null}
      onOpenChange={(next) => !next && onClose()}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-gray-1/70 backdrop-blur-sm" />
        <Dialog.Popup className="fixed inset-0 z-40 m-auto grid h-[80vh] max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-[640px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-xl border border-gray-6 bg-gray-2 shadow-xl">
          <div className="flex items-center justify-between gap-4 border-gray-6 border-b px-6 py-4">
            <div className="flex min-w-0 flex-col">
              <Dialog.Title className="truncate font-semibold text-lg text-primary">
                {row?.name || row?.email || ''}
              </Dialog.Title>
              {row?.name && (
                <span className="truncate text-secondary text-sm">
                  {row.email}
                </span>
              )}
            </div>
            <Dialog.Close className="shrink-0 rounded-md p-1.5 text-secondary transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9">
              <X className="h-5 w-5" aria-hidden="true" />
            </Dialog.Close>
          </div>

          <ScrollArea viewportClassName="p-6">
            <div className="flex flex-col gap-8">
              {isPending && (
                <p className="rounded-lg border border-warning-muted bg-warning-subtle px-3 py-2 text-sm text-warning-text">
                  This person hasn't signed in yet. Their courses are waiting
                  and will be applied automatically the first time they log in.
                </p>
              )}

              <section className="flex flex-col gap-3">
                <h3 className="font-medium text-primary text-sm">Courses</h3>
                {allCourses.length === 0 ? (
                  <p className="text-secondary text-sm">
                    No courses exist yet.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {allCourses.map((course) => {
                      const enrolled = enrolledIds.has(course.id);
                      return (
                        <li key={course.id}>
                          <label
                            className={cn(
                              'flex items-center gap-3 rounded-lg border border-gray-6 bg-gray-1 px-3 py-2.5',
                              canEditEnrolments && 'cursor-pointer',
                              enrolled && 'border-apple-8 bg-gray-3',
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={enrolled}
                              // Pending rows are edited through the add form,
                              // not here: there is no profile to attach an
                              // entitlement to until they sign in.
                              disabled={!canEditEnrolments || isPending}
                              onChange={(event) =>
                                onToggleCourse(course.id, event.target.checked)
                              }
                              className="h-4 w-4 accent-apple-9 disabled:opacity-40"
                            />
                            <span className="flex-1 text-primary text-sm">
                              {course.name}
                            </span>
                            {pendingCourseId === course.id && (
                              <Loader2
                                className="h-4 w-4 animate-spin text-secondary"
                                aria-hidden="true"
                              />
                            )}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {canEditProfile && !isPending && (
                <section className="flex flex-col gap-3">
                  <h3 className="font-medium text-primary text-sm">Profile</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="First name" register={registerFirstName} />
                    <Field label="Last name" register={registerLastName} />
                    <Field label="Call sign" register={registerCallSign} />
                    <Field label="Phone" register={registerPhone} />
                  </div>
                  <p className="text-secondary text-xs">
                    Email can't be changed here — sign-in is governed by a
                    separate auth record, so editing it would only create drift.
                  </p>
                  {profileError && (
                    <p className="text-error-text text-sm">{profileError}</p>
                  )}
                  <div>
                    <button
                      type="button"
                      onClick={onSaveProfile}
                      disabled={isSavingProfile}
                      className="inline-flex items-center gap-2 rounded-lg bg-apple-9 px-3 py-2 font-medium text-apple-contrast text-sm transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:opacity-60"
                    >
                      {isSavingProfile && (
                        <Loader2
                          className="h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                      )}
                      Save profile
                    </button>
                  </div>
                </section>
              )}

              {isOwner && !isPending && (
                <section className="flex flex-col gap-3">
                  <h3 className="font-medium text-primary text-sm">Roles</h3>
                  <p className="text-secondary text-xs">
                    Only an owner can change roles. An admin can never grant
                    roles, which is what keeps delegation contained.
                  </p>
                  <ul className="flex flex-col gap-2">
                    {assignableRoles.map((role) => {
                      const held = row?.roles.includes(role) ?? false;
                      return (
                        <li key={role}>
                          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-6 bg-gray-1 px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={held}
                              disabled={isSavingRole}
                              onChange={(event) =>
                                onToggleRole(role, event.target.checked)
                              }
                              className="h-4 w-4 accent-apple-9"
                            />
                            <span className="flex-1 text-primary text-sm capitalize">
                              {role}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  {roleError && (
                    <p className="rounded-lg border border-error-muted bg-error-subtle px-3 py-2 text-error-text text-sm">
                      {roleError}
                    </p>
                  )}
                </section>
              )}
            </div>
          </ScrollArea>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

const Field = ({
  label,
  register,
}: {
  label: string;
  register: UseFormRegisterReturn;
}) => (
  <label className="flex flex-col gap-1.5">
    <span className="font-medium text-primary text-sm">{label}</span>
    <input
      {...register}
      className="w-full rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-primary text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
    />
  </label>
);
