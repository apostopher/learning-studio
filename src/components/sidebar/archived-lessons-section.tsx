import { Collapsible } from '@base-ui/react/collapsible';
import { Link } from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';
import type { ArchivedLesson } from './compute-archived-lessons';

type ArchivedLessonsSectionProps = {
  courseSlug: string;
  lessons: readonly ArchivedLesson[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * The sidebar's "Completed at earlier levels" disclosure — the archive index
 * a promoted (or demoted) pilot needs to reach lessons the main tree no
 * longer shows, since Task 13's promotion dialog promises "you can open it
 * again any time" and the ONLY way to do that, before this, was a bookmark or
 * browser history.
 *
 * Collapsed by default and rendered secondary (smaller text, muted colour) so
 * it never competes with the pilot's current-level material above it.
 * Renders nothing when there is nothing archived — an empty disclosure is a
 * dead end with no payoff for opening it.
 *
 * Presentational and hookless (see Global Constraints) — `open` is owned by
 * `CourseSidebarWrapper` via a jotai atom, the same pattern
 * `openModuleSlugAtom` already uses for the module accordion.
 */
export const ArchivedLessonsSection = ({
  courseSlug,
  lessons,
  open,
  onOpenChange,
}: ArchivedLessonsSectionProps) => {
  if (lessons.length === 0) return null;

  return (
    <Collapsible.Root
      open={open}
      onOpenChange={onOpenChange}
      className="border-t border-gray-6 pt-sidebar-row-gap"
    >
      <Collapsible.Trigger className="group flex w-full items-center justify-between gap-2 rounded-sidebar-row px-sidebar-row-inline py-sidebar-row-block text-start text-xs font-medium text-tertiary outline-hidden hover:bg-gray-a3 hover:text-secondary">
        <span>Completed at earlier levels ({lessons.length})</span>
        <ChevronDown
          className="size-3.5 shrink-0 transition-transform duration-200 group-data-[panel-open]:rotate-180"
          aria-hidden="true"
        />
      </Collapsible.Trigger>
      <Collapsible.Panel className="overflow-hidden data-[ending-hidden]:animate-collapse data-[starting-hidden]:animate-collapse">
        <ul className="flex flex-col gap-sidebar-row-gap py-sidebar-row-block">
          {lessons.map((lesson) => (
            <li key={lesson.slug}>
              <Link
                to="/course/$courseSlug/modules/$moduleSlug/lessons/$lessonSlug"
                params={{
                  courseSlug,
                  moduleSlug: lesson.moduleSlug,
                  lessonSlug: lesson.slug,
                }}
                viewTransition
                className="sidebar-focus-ring block rounded-sidebar-row ps-sidebar-lesson-indent pe-sidebar-row-inline py-sidebar-row-block text-sm text-tertiary hover:bg-gray-a3 hover:text-secondary"
              >
                {lesson.name}
              </Link>
            </li>
          ))}
        </ul>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
};
