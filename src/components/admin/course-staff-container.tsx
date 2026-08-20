import { useAtom } from 'jotai';
import { Users } from 'lucide-react';
import {
  courseStaffCandidateQueryAtomFamily,
  courseStaffDialogOpenAtomFamily,
  courseStaffSelectedPersonAtomFamily,
  courseStaffSelectedRoleAtomFamily,
} from '#/atoms/admin';
import {
  CourseStaffRequestError,
  type StaffCandidate,
  useAssignCourseStaff,
  useCourseStaff,
  useCourseStaffCandidates,
  useRemoveCourseStaff,
} from '#/data-hooks/use-course-staff';
import {
  type BoardCourse,
  type CourseScopedRole,
  STAFF_CANDIDATE_MIN_QUERY,
} from '#/lib/admin-schemas';
import { TooltipIconButton } from '../ui/tooltip-icon-button';
import {
  CourseStaffPanel,
  type CourseStaffPersonOption,
} from './course-staff-panel';

function personLabel(candidate: StaffCandidate): string {
  const name = [candidate.firstName, candidate.lastName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' ');
  return name ? `${name} (${candidate.email})` : candidate.email;
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
 * `assignableRoles` and `removableRoles` come back with the roster rather
 * than being derived here. `/admin` now admits course-scoped staff, so "is an
 * admin" is no longer the same question as "may assign": the set is
 * asymmetric — an admin may appoint either role, a subject expert only a
 * course manager — and no client-side check over global roles can express
 * that. The server computes both with the same functions that guard the
 * writes, so a control can never appear here that the request would refuse.
 *
 * Candidates come from a course-scoped search, NOT from `/api/admin/users`:
 * that endpoint requires `user:read`, which has an admin floor, so for a
 * subject expert it 403'd and the picker silently offered nobody.
 */
export const CourseStaffContainer = ({ course }: { course: BoardCourse }) => {
  // Every one of these is keyed by course id: the panel is a per-course
  // roster, and a shared cell carried one course's half-finished assignment
  // into the next course's picker.
  const [open, setOpen] = useAtom(courseStaffDialogOpenAtomFamily(course.id));
  const [selectedPerson, setSelectedPerson] = useAtom(
    courseStaffSelectedPersonAtomFamily(course.id),
  );
  const [selectedRole, setSelectedRole] = useAtom(
    courseStaffSelectedRoleAtomFamily(course.id),
  );
  const [candidateQuery, setCandidateQuery] = useAtom(
    courseStaffCandidateQueryAtomFamily(course.id),
  );

  const staffQuery = useCourseStaff(course.id);
  const candidates = useCourseStaffCandidates(course.id, candidateQuery);
  const assign = useAssignCourseStaff(course.id);
  const remove = useRemoveCourseStaff(course.id);

  if (staffQuery.data == null) return null;

  const { staff, assignableRoles, removableRoles, selfUserId } =
    staffQuery.data;
  const canAssign = assignableRoles.length > 0;

  const found: CourseStaffPersonOption[] = (candidates.data ?? []).map(
    (candidate) => ({
      userId: candidate.userId,
      label: personLabel(candidate),
    }),
  );
  // The picked person is kept in the list even once the search has moved off
  // them, so the closed picker keeps showing a name rather than a raw user id.
  const people =
    selectedPerson && !found.some((p) => p.userId === selectedPerson.userId)
      ? [selectedPerson, ...found]
      : found;

  const errorOf = (err: unknown) =>
    err instanceof CourseStaffRequestError ? err.message : undefined;

  const peopleEmptyLabel =
    candidateQuery.trim().length < STAFF_CANDIDATE_MIN_QUERY
      ? `Type at least ${STAFF_CANDIDATE_MIN_QUERY} characters to search`
      : candidates.isFetching
        ? 'Searching…'
        : 'No matching people';

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
        removableRoles={removableRoles}
        selfUserId={selfUserId}
        people={people}
        peopleQuery={candidateQuery}
        onPeopleQueryChange={setCandidateQuery}
        peopleEmptyLabel={peopleEmptyLabel}
        selectedUserId={selectedPerson?.userId ?? null}
        onSelectedUserIdChange={(userId) =>
          setSelectedPerson(people.find((p) => p.userId === userId) ?? null)
        }
        selectedRole={selectedRole}
        onSelectedRoleChange={setSelectedRole}
        onAssign={() => {
          if (!selectedPerson || !selectedRole) return;
          assign.mutate(
            {
              userId: selectedPerson.userId,
              role: selectedRole as CourseScopedRole,
            },
            {
              onSuccess: () => {
                setSelectedPerson(null);
                setSelectedRole(null);
                setCandidateQuery('');
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
