import { useAdminCourses } from '@/data-hooks/use-admin-courses';
import { AddCourseButton } from './add-course-button';
import { CourseTile } from './course-tile';

export const AdminCoursesPageContainer = () => {
  const { data: courses, isLoading, error } = useAdminCourses();

  return (
    <div className="content-grid py-10">
      <div className="content flex flex-col gap-6">
        <header className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold text-gray-12">Courses</h1>
            <p className="text-sm text-gray-11">
              Manage your courses and their modules.
            </p>
          </div>
          <AddCourseButton />
        </header>

        {isLoading ? (
          <p className="text-sm text-gray-11">Loading courses…</p>
        ) : error ? (
          <p className="text-sm text-red-11">
            Failed to load courses. Please try again.
          </p>
        ) : !courses || courses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-6 bg-gray-2 p-10 text-center">
            <p className="text-sm font-medium text-gray-12">No courses yet</p>
            <p className="mt-1 text-sm text-gray-11">
              Create your first course to get started.
            </p>
          </div>
        ) : (
          <ul className="grid-auto-fit list-none p-0">
            {courses.map((course) => (
              <CourseTile key={course.id} course={course} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
