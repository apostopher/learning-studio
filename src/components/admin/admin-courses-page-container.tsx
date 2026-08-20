// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its component test.
import {
  AdminCoursesRequestError,
  useAdminCourses,
} from '#/data-hooks/use-admin-courses';
import { CourseTile } from './course-tile';
import { CreateCourseDialogContainer } from './create-course-dialog-container';

/**
 * The `/admin` landing page.
 *
 * Two independent facts drive the copy, and conflating them was a bug:
 * `canReadCatalogue` is about the SCOPE of the list — everything, or only the
 * courses this actor is staffed on — while `canCreateCourse` is about one
 * button. An admin whose `course:create` was revoked still browses the whole
 * catalogue; a subject expert holds neither. Branching the scope sentence on
 * the create grant addressed the staff-only reader in a message only the
 * admin could ever see.
 */
export const AdminCoursesPageContainer = ({
  canCreateCourse,
  canReadCatalogue,
}: {
  canCreateCourse: boolean;
  canReadCatalogue: boolean;
}) => {
  const { data: courses, isLoading, error } = useAdminCourses();

  // A 403 is a refusal, not a failure: this actor holds no `course:read` and
  // no `course_staff` row, which is reachable when staffing is revoked while
  // the page is open. "Please try again" would be untrue.
  const isRefused =
    error instanceof AdminCoursesRequestError && error.status === 403;

  return (
    <div className="content-grid py-10">
      <div className="content flex flex-col gap-6">
        <header className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold text-primary">Courses</h1>
            <p className="text-sm text-secondary">
              {canReadCatalogue
                ? 'Manage your courses and their modules.'
                : 'The courses you are staff on.'}
            </p>
          </div>
          {canCreateCourse && <CreateCourseDialogContainer />}
        </header>

        {isLoading ? (
          <p className="text-sm text-secondary">Loading courses…</p>
        ) : isRefused ? (
          <div className="rounded-xl border border-dashed border-gray-6 bg-gray-2 p-10 text-center">
            <p className="text-sm font-medium text-primary">
              No courses to show
            </p>
            <p className="mt-1 text-sm text-secondary">
              You are not staff on any course. Ask an admin to assign you to
              one.
            </p>
          </div>
        ) : error ? (
          <p className="text-sm text-error-text">
            Failed to load courses. Please try again.
          </p>
        ) : !courses || courses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-6 bg-gray-2 p-10 text-center">
            <p className="text-sm font-medium text-primary">No courses yet</p>
            <p className="mt-1 text-sm text-secondary">
              {canReadCatalogue
                ? 'Create your first course to get started.'
                : 'You will see a course here once an admin assigns you to one as staff.'}
            </p>
          </div>
        ) : (
          <ul className="grid-auto-fit list-none p-0">
            {courses.map((course) => (
              <li key={course.id}>
                <CourseTile course={course} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
