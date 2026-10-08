import { Link } from '@tanstack/react-router';
import { useSetAtom } from 'jotai';
import { Pencil } from 'lucide-react';
import { editCourseAtom } from '#/atoms/admin';
import {
  AdminCoursesRequestError,
  useAdminCourses,
} from '#/data-hooks/use-admin-courses';
import { TooltipIconButton } from '../ui/tooltip-icon-button';
import { CourseTile } from './course-tile';
import { EditCourseDialogContainer } from './edit-course-dialog-container';

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
 *
 * With `course:update`, each tile also carries an "Edit course" button in its
 * top-right corner that opens the same Edit course modal the editor uses —
 * name, description, cover and the course's other settings. Hidden, not
 * disabled, without the grant: the PATCH behind it is org-level with no
 * course-scoped fallback, so it would refuse every time.
 */
export const CoursesSectionContainer = ({
  canEditCourse = false,
}: {
  /** `course:update` — resolved by the route, which holds the permissions. */
  canEditCourse?: boolean;
}) => {
  const courses = useAdminCourses();
  const setEditCourse = useSetAtom(editCourseAtom);
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
              // `relative` anchors the edit button. It is the link's SIBLING,
              // not its child: a button inside an `<a>` is invalid nesting,
              // and a click on it would also follow the link.
              <li key={course.id} className="relative">
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
                {canEditCourse && (
                  <TooltipIconButton
                    label={`Edit ${course.name}`}
                    onClick={() =>
                      setEditCourse({
                        id: course.id,
                        name: course.name,
                        description: course.description,
                        imageUrlAvif: course.imageUrlAvif,
                        imageUrlWebp: course.imageUrlWebp,
                      })
                    }
                    // Sits on top of an arbitrary cover photo, so it carries
                    // its own opaque surface and border rather than the
                    // toolbar's bare icon — legible over light and dark
                    // images alike. Always visible: touch has no hover to
                    // reveal it on. 36px, larger than the dense toolbar's 28.
                    className="absolute end-2 h-9 w-9 border border-gray-6 bg-gray-1 text-primary shadow-sm [inset-block-start:--spacing(2)] hover:bg-gray-3"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </TooltipIconButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {canEditCourse && <EditCourseDialogContainer />}
    </div>
  );
};
