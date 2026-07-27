import { useAdminCourses } from '@/data-hooks/use-admin-courses';
import { CourseTile } from './course-tile';
import { CreateCourseDialogContainer } from './create-course-dialog-container';

export const AdminCoursesPageContainer = () => {
  const { data: courses, isLoading, error } = useAdminCourses();

  return (
    <div className="content-grid py-10">
      <div className="content flex flex-col gap-6">
        <header className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold text-primary">Courses</h1>
            <p className="text-sm text-secondary">
              Manage your courses and their modules.
            </p>
          </div>
          <CreateCourseDialogContainer />
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
              Create your first course to get started.
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
