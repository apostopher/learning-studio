import { useAtom } from 'jotai';
import { Users } from 'lucide-react';
import {
  courseStaffDialogOpenAtom,
  courseStaffSelectedRoleAtom,
  courseStaffSelectedUserIdAtom,
} from '#/atoms/admin';
import { useAdminUsers } from '#/data-hooks/use-admin-users';
import {
  CourseStaffRequestError,
  useAssignCourseStaff,
  useCourseStaff,
  useRemoveCourseStaff,
} from '#/data-hooks/use-course-staff';
import {
  type BoardCourse,
  COURSE_SCOPED_ROLES,
  type CourseScopedRole,
  hasAdminAccess,
} from '#/lib/admin-schemas';
import { TooltipIconButton } from '../ui/tooltip-icon-button';
import {
  CourseStaffPanel,
  type CourseStaffPersonOption,
} from './course-staff-panel';

function personLabel(user: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  const name = [user.firstName, user.lastName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' ');
  return name ? `${name} (${user.email})` : user.email;
}

/**
 * Toolbar trigger + dialog for assigning course-scoped staff.
 *
 * `staff:read` is course-scoped, so this actor's authority can't be read out
 * of the (global-only) route context — the trigger button renders only once
 * `useCourseStaff` comes back with a roster, and stays hidden entirely on a
 * 403 (see that hook's `null`-on-403 contract). Nothing here gates behind a
 * client-side permission check before firing the GET; the request itself is
 * the check, matching how `useCourseBoard` treats a 404 as "no board".
 *
 * Every actor who reaches this container already holds global `admin` or
 * `owner` — `/admin`'s route guard enforces that — so `canAssign` reflects
 * that rather than probing course-scoped `staff:create` locally.
 */
export const CourseStaffContainer = ({
  course,
  roles,
}: {
  course: BoardCourse;
  roles: string[];
}) => {
  const [open, setOpen] = useAtom(courseStaffDialogOpenAtom);
  const [selectedUserId, setSelectedUserId] = useAtom(
    courseStaffSelectedUserIdAtom,
  );
  const [selectedRole, setSelectedRole] = useAtom(courseStaffSelectedRoleAtom);

  const staffQuery = useCourseStaff(course.id);
  const adminUsers = useAdminUsers();
  const assign = useAssignCourseStaff(course.id);
  const remove = useRemoveCourseStaff(course.id);

  if (staffQuery.data == null) return null;

  const people: CourseStaffPersonOption[] = (adminUsers.data?.users ?? []).map(
    (user) => ({ userId: user.userId, label: personLabel(user) }),
  );

  const errorOf = (err: unknown) =>
    err instanceof CourseStaffRequestError ? err.message : undefined;

  const canAssign = hasAdminAccess(roles);

  return (
    <>
      <TooltipIconButton label="Course staff" onClick={() => setOpen(true)}>
        <Users className="h-4 w-4" aria-hidden="true" />
      </TooltipIconButton>

      <CourseStaffPanel
        open={open}
        onOpenChange={setOpen}
        courseName={course.name}
        staff={staffQuery.data}
        isLoading={staffQuery.isLoading}
        assignableRoles={canAssign ? [...COURSE_SCOPED_ROLES] : []}
        canAssign={canAssign}
        people={people}
        selectedUserId={selectedUserId}
        onSelectedUserIdChange={setSelectedUserId}
        selectedRole={selectedRole}
        onSelectedRoleChange={setSelectedRole}
        onAssign={() => {
          if (!selectedUserId || !selectedRole) return;
          assign.mutate(
            {
              userId: selectedUserId,
              role: selectedRole as CourseScopedRole,
            },
            {
              onSuccess: () => {
                setSelectedUserId(null);
                setSelectedRole(null);
              },
            },
          );
        }}
        onRemove={(userId, role) =>
          remove.mutate({ userId, role: role as CourseScopedRole })
        }
        isSaving={assign.isPending || remove.isPending}
        error={errorOf(assign.error) ?? errorOf(remove.error)}
      />
    </>
  );
};
