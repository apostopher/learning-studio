import { Link } from '@tanstack/react-router';
import {
  AdminCoursesRequestError,
  useAdminCourses,
} from '#/data-hooks/use-admin-courses';
import { CourseTile } from './course-tile';

/**
 * The Courses screen: every course this actor may see, as tiles that open
 * that course's editor (`/admin/$courseId/editor` — modules, lessons,
 * staff, persona, news).
 *
 * Replaced the "3D airmanship" placeholder section on 2026-09-15. The list is
 * the same endpoint the schedule's rail reads: the whole catalogue with
 * `course:read`, otherwise the courses the actor is staffed on. The server
 * answers 403 — never `[]` — to someone with neither, and that refusal is
 * shown as a reason, not an empty grid.
 */
export const CoursesSectionContainer = () => {
  const courses = useAdminCourses();
  const refused =
    courses.error instanceof AdminCoursesRequestError &&
    courses.error.status === 403;

  return (
    <div className="content-grid py-10">
      <div className="content flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="font-semibold text-2xl text-primary">Courses</h1>
          <p className="text-secondary text-sm">
            Every course you can work on. Open one to edit its modules, lessons,
            staff and settings.
          </p>
        </header>

        {courses.isLoading && (
          <p className="text-secondary text-sm">Loading courses…</p>
        )}
        {refused ? (
          <p
            role="alert"
            className="rounded-xl border border-gray-6 bg-gray-2 p-6 text-secondary text-sm"
          >
            You are not allowed to see the course catalogue. Courses appear here
            once you hold course access or are staffed on one — ask an admin.
          </p>
        ) : (
          courses.error && (
            <p role="alert" className="text-error-text text-sm">
              {courses.error.message}
            </p>
          )
        )}
        {courses.data?.length === 0 && (
          <p className="rounded-xl border border-gray-6 border-dashed bg-gray-2 p-10 text-center text-secondary text-sm">
            No courses yet. Create one from the knowledge library's course rail,
            then it appears here.
          </p>
        )}

        {courses.data && courses.data.length > 0 && (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.data.map((course) => (
              <li key={course.id}>
                <Link
                  to="/admin/$courseId/editor"
                  params={{ courseId: String(course.id) }}
                  aria-label={`Open ${course.name} in the editor`}
                  // `group` drives the tile's hover/focus outline; the link
                  // itself draws no ring so there is one indicator, not two.
                  className="group block h-full rounded-xl focus-visible:outline-none"
                >
                  <CourseTile
                    name={course.name}
                    imageUrlAvif={course.imageUrlAvif}
                    imageUrlWebp={course.imageUrlWebp}
                    moduleCount={course.moduleCount}
                    lessonCount={course.lessonCount}
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
