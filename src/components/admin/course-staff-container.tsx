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
import type { BoardCourse, CourseScopedRole } from '#/lib/admin-schemas';
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
 * `assignableRoles` comes back with the roster rather than being derived
 * here. `/admin` now admits course-scoped staff, so "is an admin" is no longer
 * the same question as "may assign": the set is asymmetric — an admin may
 * appoint either role, a subject expert only a course manager — and no
 * client-side check over global roles can express that. The server computes it
 * with the same function that guards the write, so an option can never appear
 * here that the PUT would refuse. An empty set means no assign form.
 */
export const CourseStaffContainer = ({ course }: { course: BoardCourse }) => {
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

  const { staff, assignableRoles } = staffQuery.data;
  const canAssign = assignableRoles.length > 0;

  return (
    <>
      <TooltipIconButton label="Course staff" onClick={() => setOpen(true)}>
        <Users className="h-4 w-4" aria-hidden="true" />
      </TooltipIconButton>

      <CourseStaffPanel
        open={open}
        onOpenChange={setOpen}
        courseName={course.name}
        staff={staff}
        isLoading={staffQuery.isLoading}
        assignableRoles={assignableRoles}
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
