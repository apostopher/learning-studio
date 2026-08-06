import { useAtom } from 'jotai';
import { Plus } from 'lucide-react';
import { useQueryState } from 'nuqs';
import { useForm } from 'react-hook-form';
import { addUserEmailAtom, openUserRowAtom } from '#/atoms/admin';
import { useAdminCourses } from '#/data-hooks/use-admin-courses';
import {
  AdminUsersError,
  useAddPendingEnrolment,
  useAdminUsers,
  useRolePermissions,
  useSetRolePermission,
  useSetUserEnrolment,
  useSetUserRole,
  useUpdateUserProfile,
} from '#/data-hooks/use-admin-users';
import {
  hasPermissionKey,
  OWNER_ROLE,
  type PermissionAction,
  type PermissionEntity,
} from '#/lib/admin-schemas';
import { RolePermissionsPanel } from './role-permissions-panel';
import { UserDetailModal } from './user-detail-modal';
import { type UserRow, UsersTable } from './users-table';

type ProfileForm = {
  firstName: string;
  lastName: string;
  callSign: string;
  phoneNumber: string;
};

/**
 * `/admin/users` — the delegation surface.
 *
 * Permissions arrive in router context, so the page renders only what this
 * actor may actually do; the server re-checks every write regardless.
 */
export const UsersPageContainer = ({
  roles,
  permissions,
}: {
  roles: string[];
  permissions: string[];
}) => {
  const [search, setSearch] = useQueryState('q', { defaultValue: '' });
  const [openRow, setOpenRow] = useAtom(openUserRowAtom);
  const [newEmail, setNewEmail] = useAtom(addUserEmailAtom);

  const isOwner = roles.includes(OWNER_ROLE);
  const canAdd = hasPermissionKey(permissions, 'user', 'create');
  const canEditProfile = hasPermissionKey(permissions, 'user', 'update');
  const canGrantCourse = hasPermissionKey(permissions, 'enrolment', 'create');
  const canRevokeCourse = hasPermissionKey(permissions, 'enrolment', 'delete');

  const users = useAdminUsers();
  const courses = useAdminCourses();
  const rolePermissions = useRolePermissions(isOwner);
  const addPending = useAddPendingEnrolment();
  const setRolePermission = useSetRolePermission();

  const openProfileId = openRow?.profileId ?? 0;
  const updateProfile = useUpdateUserProfile(openProfileId);
  const setEnrolment = useSetUserEnrolment(openProfileId);
  const setUserRole = useSetUserRole(openProfileId);

  const profileForm = useForm<ProfileForm>({
    values: {
      firstName: openRow?.firstName ?? '',
      lastName: openRow?.lastName ?? '',
      callSign: openRow?.callSign ?? '',
      phoneNumber: openRow?.phoneNumber ?? '',
    },
  });

  const rows: UserRow[] = [
    ...(users.data?.users ?? []).map((u) => ({
      kind: 'user' as const,
      profileId: u.profileId,
      email: u.email,
      name: [u.firstName, u.lastName].filter(Boolean).join(' '),
      roles: u.roles,
      courses: u.courses,
      firstName: u.firstName,
      lastName: u.lastName,
      callSign: u.callSign,
      phoneNumber: u.phoneNumber,
    })),
    ...(users.data?.pending ?? []).map((p) => ({
      kind: 'pending' as const,
      profileId: null,
      email: p.email,
      name: '',
      roles: [],
      courses: p.courses,
      firstName: null,
      lastName: null,
      callSign: null,
      phoneNumber: null,
    })),
  ];

  const courseOptions = (courses.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
  }));

  const errorOf = (e: unknown) =>
    e instanceof AdminUsersError ? e.message : undefined;

  const handleAdd = () => {
    const email = newEmail.trim();
    if (!email || courseOptions.length === 0) return;
    // Pre-assign every course selected in the modal is a later refinement;
    // adding someone to the first course is the common case and keeps this
    // form to a single field.
    addPending.mutate(
      { email, courseIds: [courseOptions[0].id] },
      { onSuccess: () => setNewEmail('') },
    );
  };

  return (
    <div className="content-grid py-10">
      <div className="content flex flex-col gap-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="font-semibold text-2xl text-primary">People</h1>
            <p className="text-secondary text-sm">
              Everyone with access, and anyone waiting for their first sign-in.
            </p>
          </div>

          {canAdd && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                handleAdd();
              }}
              className="flex items-end gap-2"
            >
              <label className="flex flex-col gap-1.5">
                <span className="font-medium text-primary text-sm">
                  Add by email
                </span>
                <input
                  value={newEmail}
                  onChange={(event) => setNewEmail(event.target.value)}
                  placeholder="pilot@example.com"
                  type="email"
                  className="w-64 rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-primary text-sm placeholder:text-gray-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
                />
              </label>
              <button
                type="submit"
                disabled={addPending.isPending || newEmail.trim() === ''}
                className="inline-flex items-center gap-2 rounded-lg bg-apple-9 px-3 py-2 font-medium text-apple-contrast text-sm transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:opacity-60"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add
              </button>
            </form>
          )}
        </header>

        {addPending.error && (
          <p className="rounded-lg border border-error-muted bg-error-subtle px-3 py-2 text-error-text text-sm">
            {errorOf(addPending.error)}
          </p>
        )}

        <UsersTable
          rows={rows}
          search={search}
          onSearchChange={setSearch}
          onOpenRow={setOpenRow}
          isLoading={users.isLoading}
          error={users.error ? errorOf(users.error) : undefined}
        />

        {isOwner && (
          <RolePermissionsPanel
            // Owner bypasses checks, so it is never configurable here.
            roles={(rolePermissions.data?.roles ?? [])
              .map((r) => r.name)
              .filter((name) => name !== OWNER_ROLE)}
            granted={rolePermissions.data?.permissions ?? {}}
            onToggle={(role, entity, action, granted) =>
              setRolePermission.mutate({ role, entity, action, granted })
            }
            isSaving={setRolePermission.isPending}
            isLoading={rolePermissions.isLoading}
            error={
              errorOf(rolePermissions.error) ?? errorOf(setRolePermission.error)
            }
          />
        )}
      </div>

      <UserDetailModal
        row={openRow}
        onClose={() => setOpenRow(null)}
        allCourses={courseOptions}
        canEditEnrolments={canGrantCourse || canRevokeCourse}
        onToggleCourse={(courseId, granted) =>
          setEnrolment.mutate(
            { courseId, granted },
            {
              onSuccess: () =>
                setOpenRow((current) =>
                  current
                    ? {
                        ...current,
                        courses: granted
                          ? [
                              ...current.courses,
                              courseOptions.find((c) => c.id === courseId) ?? {
                                id: courseId,
                                name: '',
                              },
                            ]
                          : current.courses.filter((c) => c.id !== courseId),
                      }
                    : current,
                ),
            },
          )
        }
        pendingCourseId={
          setEnrolment.isPending
            ? (setEnrolment.variables?.courseId ?? null)
            : null
        }
        canEditProfile={canEditProfile}
        registerFirstName={profileForm.register('firstName')}
        registerLastName={profileForm.register('lastName')}
        registerCallSign={profileForm.register('callSign')}
        registerPhone={profileForm.register('phoneNumber')}
        onSaveProfile={profileForm.handleSubmit((values) =>
          updateProfile.mutate({
            firstName: values.firstName || null,
            lastName: values.lastName || null,
            callSign: values.callSign || null,
            phoneNumber: values.phoneNumber || null,
          }),
        )}
        isSavingProfile={updateProfile.isPending}
        profileError={errorOf(updateProfile.error)}
        isOwner={isOwner}
        assignableRoles={(rolePermissions.data?.roles ?? []).map((r) => r.name)}
        onToggleRole={(role, granted) =>
          setUserRole.mutate(
            { role, granted },
            {
              onSuccess: () =>
                setOpenRow((current) =>
                  current
                    ? {
                        ...current,
                        roles: granted
                          ? [...current.roles, role]
                          : current.roles.filter((r) => r !== role),
                      }
                    : current,
                ),
            },
          )
        }
        roleError={errorOf(setUserRole.error)}
        isSavingRole={setUserRole.isPending}
      />
    </div>
  );
};

export type { PermissionAction, PermissionEntity };
