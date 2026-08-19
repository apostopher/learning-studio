import { Tabs } from '@base-ui/react/tabs';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAtom } from 'jotai';
import { useQueryState } from 'nuqs';
import { useForm } from 'react-hook-form';
import {
  addPersonCourseIdsAtom,
  addPersonOpenAtom,
  addUserEmailAtom,
  openLevelHistoryCourseIdAtom,
  openUserRowAtom,
  setLevelDraftAtom,
} from '#/atoms/admin';
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
  useSetUserLevel,
  useUserLevelHistory,
} from '#/data-hooks/use-user-levels';
import {
  hasPermissionKey,
  OWNER_ROLE,
  setUserLevelInputSchema,
} from '#/lib/admin-schemas';
import type { UserLevel } from '#/types';
import { AddPersonDialog } from './add-person-dialog';
import { RolePermissionsPanel } from './role-permissions-panel';
import { SetLevelDialog } from './set-level-dialog';
import { UserDetailModal } from './user-detail-modal';
import { type UserRow, UsersTable } from './users-table';

type ProfileForm = {
  firstName: string;
  lastName: string;
  callSign: string;
  phoneNumber: string;
};

/** Message required, note optional — `courseId` comes from the draft atom, not the form. */
const levelFormSchema = setUserLevelInputSchema.omit({ courseId: true });
type LevelForm = {
  level: UserLevel;
  message: string;
  note?: string;
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
  // The tab lives in the URL so a permissions link is shareable and survives
  // a reload, same as the search term.
  const [tab, setTab] = useQueryState('tab', { defaultValue: 'people' });
  const [openRow, setOpenRow] = useAtom(openUserRowAtom);
  const [addOpen, setAddOpen] = useAtom(addPersonOpenAtom);
  const [newEmail, setNewEmail] = useAtom(addUserEmailAtom);
  const [newCourseIds, setNewCourseIds] = useAtom(addPersonCourseIdsAtom);
  const [openLevelHistoryCourseId, setOpenLevelHistoryCourseId] = useAtom(
    openLevelHistoryCourseIdAtom,
  );
  const [levelDraft, setLevelDraft] = useAtom(setLevelDraftAtom);

  const isOwner = roles.includes(OWNER_ROLE);
  const canAdd = hasPermissionKey(permissions, 'user', 'create');
  const canEditProfile = hasPermissionKey(permissions, 'user', 'update');
  const canGrantCourse = hasPermissionKey(permissions, 'enrolment', 'create');
  const canRevokeCourse = hasPermissionKey(permissions, 'enrolment', 'delete');
  const canEditLevels = hasPermissionKey(permissions, 'level', 'update');

  const users = useAdminUsers();
  const courses = useAdminCourses();
  const rolePermissions = useRolePermissions(isOwner);
  const addPending = useAddPendingEnrolment();
  const setRolePermission = useSetRolePermission();

  const openProfileId = openRow?.profileId ?? 0;
  const updateProfile = useUpdateUserProfile(openProfileId);
  const setEnrolment = useSetUserEnrolment(openProfileId);
  const setUserRole = useSetUserRole(openProfileId);
  const levelHistory = useUserLevelHistory(
    openProfileId,
    openLevelHistoryCourseId,
  );
  const setLevel = useSetUserLevel(openProfileId);

  // A userId → email map so the history disclosure can show who made an admin
  // change, rather than the raw auth user id `changedBy` actually stores.
  const emailByUserId = new Map(
    (users.data?.users ?? []).map((u) => [u.userId, u.email]),
  );

  const levelForm = useForm<LevelForm>({
    resolver: zodResolver(levelFormSchema),
    values: levelDraft
      ? { level: levelDraft.level, message: '', note: '' }
      : undefined,
  });

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
      levels: u.levels,
      joinedAt: u.createdAt,
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
      // No profile exists yet, so there is nothing to hold a level row —
      // the modal hides level controls for pending rows entirely.
      levels: {},
      // Pending people haven't joined — the column reads "–" rather than
      // showing the date an admin typed their address.
      joinedAt: null,
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

  const handleSetLevel = levelForm.handleSubmit((values) => {
    if (!levelDraft) return;
    setLevel.mutate(
      {
        courseId: levelDraft.courseId,
        level: values.level,
        message: values.message,
        note: values.note || undefined,
      },
      { onSuccess: () => setLevelDraft(null) },
    );
  });

  const handleAdd = () => {
    const email = newEmail.trim();
    if (!email || newCourseIds.length === 0) return;
    addPending.mutate(
      { email, courseIds: newCourseIds },
      {
        onSuccess: () => {
          setNewEmail('');
          setNewCourseIds([]);
          setAddOpen(false);
        },
      },
    );
  };

  return (
    <div className="content-grid py-10">
      <div className="content flex flex-col gap-6">
        <h1 className="font-semibold text-2xl text-primary">People</h1>

        <Tabs.Root value={tab} onValueChange={(next) => setTab(String(next))}>
          <Tabs.List className="flex gap-6 border-gray-6 border-b">
            <Tabs.Tab
              value="people"
              className="-mb-px border-transparent border-b-2 pb-2.5 font-medium text-secondary text-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 aria-selected:border-apple-9 aria-selected:text-primary"
            >
              All
            </Tabs.Tab>
            {/*
              Owner-only, and absent rather than disabled: a tab that can never
              be opened is absence, not a locked state.
            */}
            {isOwner && (
              <Tabs.Tab
                value="permissions"
                className="-mb-px border-transparent border-b-2 pb-2.5 font-medium text-secondary text-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 aria-selected:border-apple-9 aria-selected:text-primary"
              >
                Permissions
              </Tabs.Tab>
            )}
          </Tabs.List>

          <Tabs.Panel value="people" className="pt-6">
            <UsersTable
              rows={rows}
              search={search}
              onSearchChange={setSearch}
              onOpenRow={setOpenRow}
              isLoading={users.isLoading}
              error={
                users.error
                  ? 'Could not load people. Reload to try again.'
                  : errorOf(setEnrolment.error)
              }
              onAddPerson={canAdd ? () => setAddOpen(true) : undefined}
            />
          </Tabs.Panel>

          {isOwner && (
            <Tabs.Panel value="permissions" className="pt-6">
              <RolePermissionsPanel
                // Owner bypasses permission checks, so it is never listed —
                // configuring it would be a control that changes nothing.
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
                  errorOf(rolePermissions.error) ??
                  errorOf(setRolePermission.error)
                }
              />
            </Tabs.Panel>
          )}
        </Tabs.Root>
      </div>

      <AddPersonDialog
        open={addOpen}
        onOpenChange={(next) => {
          setAddOpen(next);
          if (!next) {
            setNewEmail('');
            setNewCourseIds([]);
          }
        }}
        email={newEmail}
        onEmailChange={setNewEmail}
        courses={courseOptions}
        selectedCourseIds={newCourseIds}
        onToggleCourse={(courseId, selected) =>
          setNewCourseIds(
            selected
              ? [...newCourseIds, courseId]
              : newCourseIds.filter((id) => id !== courseId),
          )
        }
        onSubmit={handleAdd}
        isPending={addPending.isPending}
        error={errorOf(addPending.error)}
      />

      <UserDetailModal
        row={openRow}
        onClose={() => {
          setOpenRow(null);
          setOpenLevelHistoryCourseId(null);
          setLevelDraft(null);
        }}
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
        canEditLevels={canEditLevels}
        levels={openRow?.levels ?? {}}
        openLevelHistoryCourseId={openLevelHistoryCourseId}
        levelHistory={(levelHistory.data ?? []).map((row) => ({
          ...row,
          changedBy: row.changedBy
            ? (emailByUserId.get(row.changedBy) ?? row.changedBy)
            : row.changedBy,
        }))}
        isLevelHistoryLoading={levelHistory.isLoading}
        onToggleLevelHistory={(courseId) =>
          setOpenLevelHistoryCourseId((current) =>
            current === courseId ? null : courseId,
          )
        }
        onLevelChange={(courseId, courseName, level) =>
          setLevelDraft({ courseId, courseName, level })
        }
        savingLevelCourseId={
          setLevel.isPending ? (setLevel.variables?.courseId ?? null) : null
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

      <SetLevelDialog
        open={levelDraft !== null}
        onOpenChange={(next) => {
          if (!next) setLevelDraft(null);
        }}
        courseName={levelDraft?.courseName ?? ''}
        level={levelDraft?.level ?? 'basic'}
        onSubmit={handleSetLevel}
        registerMessage={levelForm.register('message')}
        registerNote={levelForm.register('note')}
        messageError={levelForm.formState.errors.message?.message}
        isPending={setLevel.isPending}
        error={errorOf(setLevel.error)}
      />
    </div>
  );
};
