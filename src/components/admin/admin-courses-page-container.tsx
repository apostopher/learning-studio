// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its component test.
import { useAdminCourses } from '#/data-hooks/use-admin-courses';
import { CourseTile } from './course-tile';
import { CreateCourseDialogContainer } from './create-course-dialog-container';

/**
 * The `/admin` landing page.
 *
 * What the list holds depends on the actor: the whole catalogue for anyone
 * with `course:read`, and only the courses they are staffed on for a subject
 * expert or course manager, who holds no such grant. The endpoint decides
 * that — nothing here branches on it — so the only thing this component needs
 * told is whether founding a new course is on offer, which is a separate,
 * org-level grant with no staff fallback.
 */
export const AdminCoursesPageContainer = ({
  canCreateCourse,
}: {
  canCreateCourse: boolean;
}) => {
  const { data: courses, isLoading, error } = useAdminCourses();

  return (
    <div className="content-grid py-10">
      <div className="content flex flex-col gap-6">
        <header className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold text-primary">Courses</h1>
            <p className="text-sm text-secondary">
              {canCreateCourse
                ? 'Manage your courses and their modules.'
                : 'The courses you are staff on.'}
            </p>
          </div>
          {canCreateCourse && <CreateCourseDialogContainer />}
        </header>

        {isLoading ? (
          <p className="text-sm text-secondary">Loading courses…</p>
        ) : error ? (
          <p className="text-sm text-error-text">
            Failed to load courses. Please try again.
          </p>
        ) : !courses || courses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-6 bg-gray-2 p-10 text-center">
            <p className="text-sm font-medium text-primary">No courses yet</p>
            <p className="mt-1 text-sm text-secondary">
              {canCreateCourse
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
