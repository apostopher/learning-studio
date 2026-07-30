import { useMyCourses } from '#/data-hooks/use-my-courses';
import { CourseCard } from './course-card';

export const MyCoursesPageContainer = () => {
  const { data: courses, isLoading, error } = useMyCourses();

  return (
    <div className="content-grid py-10">
      <div className="content flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-primary">My Courses</h1>
          <p className="text-sm text-secondary">Pick up where you left off.</p>
        </header>

        {isLoading ? (
          <p className="text-sm text-secondary">Loading courses…</p>
        ) : error ? (
          <p className="text-sm text-error-text">
            Failed to load courses. Please try again.
          </p>
        ) : !courses || courses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-6 bg-gray-2 p-10 text-center">
            <p className="text-sm font-medium text-primary">
              You're not enrolled in any courses yet
            </p>
          </div>
        ) : (
          <ul className="course-grid grid-auto-fit list-none p-0">
            {courses.map((course) => (
              <li key={course.id}>
                <CourseCard course={course} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
