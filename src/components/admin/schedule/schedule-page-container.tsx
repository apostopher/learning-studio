import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { addDays, format } from 'date-fns';
import { atom, useAtom, useSetAtom } from 'jotai';
import {
  SCHEDULE_STEP_WEEKS,
  SCHEDULE_WEEKS,
  scheduleDialogAtom,
  scheduleWindowStartAtom,
} from '#/atoms/schedule';
import {
  Calendar,
  CalendarHeader,
  calendarWindowStart,
  formatCalendarRange,
  shiftCalendarWindow,
} from '#/components/calendar';
import { useAdminCourses } from '#/data-hooks/use-admin-courses';
import { useOfferings } from '#/data-hooks/use-offerings';
import type { Offering } from '#/lib/offering-schemas';
import { CourseScheduleRail } from './course-schedule-rail';
import { DraggableCourseContainer } from './draggable-course-container';
import { OfferingDialogContainer } from './offering-dialog-container';
import { ScheduleCourseCard } from './schedule-course-card';
import { ScheduleDayContainer } from './schedule-day-container';
import {
  parseScheduleCourseDndId,
  parseScheduleDayDndId,
} from './schedule-dnd';

/** The course currently under the pointer, for the drag preview. */
const draggingCourseAtom = atom<{
  id: number;
  name: string;
  moduleCount: number;
  lessonCount: number;
} | null>(null);

/**
 * The schedule board: courses on the left, a calendar on the right, and one
 * `DndContext` spanning both.
 *
 * Dragging a course onto a day does not move it — the rail is unchanged — it
 * opens the dialog that creates an OFFERING: one dated run of that course.
 * The same course dragged out twice is two offerings, which is how a course
 * runs in both spring and autumn.
 *
 * The drop decides the START date and nothing else. The end date is the
 * dialog's only required question.
 */
export const SchedulePageContainer = ({
  canSchedule,
}: {
  /**
   * Whether this actor may create offerings — the course-manager-or-admin
   * union the API enforces. Read from the route, the only place holding
   * permissions. When false the rail still lists courses and the calendar
   * still shows what is scheduled: read access and write access are separate
   * questions, and hiding the schedule from someone who may read it would be
   * a worse answer than showing it read-only.
   */
  canSchedule: boolean;
}) => {
  const [weekStart, setWeekStart] = useAtom(scheduleWindowStartAtom);
  const setDialog = useSetAtom(scheduleDialogAtom);
  const [draggingCourse, setDraggingCourse] = useAtom(draggingCourseAtom);

  // The exact window on screen, as the wire format. Both ends inclusive, so
  // the query asks for precisely the days the grid draws — no more, and
  // crucially no fewer, or a bar would be missing from the last row.
  const from = format(weekStart, 'yyyy-MM-dd');
  const to = format(addDays(weekStart, SCHEDULE_WEEKS * 7 - 1), 'yyyy-MM-dd');

  const courses = useAdminCourses();
  const offerings = useOfferings(from, to);

  const sensors = useSensors(
    // A distance threshold, so a click on a course card is not swallowed as a
    // drag that went nowhere.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const onDragStart = (event: DragStartEvent) => {
    const courseId = parseScheduleCourseDndId(event.active.id);
    const course = courses.data?.find((row) => row.id === courseId);
    setDraggingCourse(
      course
        ? {
            id: course.id,
            name: course.name,
            moduleCount: course.moduleCount,
            lessonCount: course.lessonCount,
          }
        : null,
    );
  };

  const onDragEnd = (event: DragEndEvent) => {
    setDraggingCourse(null);
    if (!canSchedule) return;

    const courseId = parseScheduleCourseDndId(event.active.id);
    // Released over nothing is "never mind", not a mistake — no toast.
    const dayKey = event.over ? parseScheduleDayDndId(event.over.id) : null;
    if (courseId === null || dayKey === null) return;

    const course = courses.data?.find((row) => row.id === courseId);
    if (!course) return;

    setDialog({
      mode: 'create',
      courseId,
      courseName: course.name,
      startsOn: dayKey,
    });
  };

  const byDay = groupOfferingsByDay(offerings.data ?? []);
  const rows = offerings.data ?? [];

  return (
    <DndContext
      sensors={sensors}
      // Days tile the whole grid with no gaps, so the pointer is always
      // inside exactly one of them; `closestCenter` is the fallback for the
      // moment a drag is over the rail instead, where `pointerWithin` finds
      // nothing and returning no candidate is the correct answer.
      collisionDetection={(args) => {
        const within = pointerWithin(args);
        return within.length > 0 ? within : closestCenter(args);
      }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDraggingCourse(null)}
      accessibility={{
        announcements: {
          onDragStart: ({ active }) =>
            `Picked up ${nameOf(active.id, courses.data)}. Move over a day to schedule it.`,
          onDragOver: ({ over }) =>
            over
              ? `Over ${parseScheduleDayDndId(over.id) ?? 'no day'}.`
              : 'Not over a day.',
          onDragEnd: ({ over }) =>
            over
              ? `Dropped on ${parseScheduleDayDndId(over.id)}. Set the end date to finish scheduling.`
              : 'Cancelled. Nothing was scheduled.',
          onDragCancel: () => 'Cancelled. Nothing was scheduled.',
        },
      }}
    >
      <div className="flex h-full min-h-0 w-full">
        <div className="w-72 shrink-0">
          <CourseScheduleRail
            hint={
              canSchedule
                ? 'Drag a course onto a day to schedule a run of it.'
                : 'You can see the schedule, but not change it. Ask an admin or a course manager to schedule a run.'
            }
          >
            {courses.isLoading && (
              <p className="px-1 text-secondary text-sm">Loading courses…</p>
            )}
            {courses.error && (
              <p role="alert" className="px-1 text-error-text text-sm">
                {courses.error.message}
              </p>
            )}
            {courses.data?.length === 0 && (
              <p className="px-1 text-secondary text-sm">
                No courses yet. Create one from the Courses screen, then come
                back to schedule it.
              </p>
            )}
            {courses.data?.map((course) =>
              canSchedule ? (
                <DraggableCourseContainer key={course.id} course={course} />
              ) : (
                <ScheduleCourseCard
                  key={course.id}
                  name={course.name}
                  moduleCount={course.moduleCount}
                  lessonCount={course.lessonCount}
                  className="cursor-default"
                />
              ),
            )}
          </CourseScheduleRail>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <CalendarHeader
            title="Schedule"
            rangeLabel={formatCalendarRange(weekStart, SCHEDULE_WEEKS)}
            stepLabel={`${SCHEDULE_STEP_WEEKS} weeks`}
            onPrevious={() =>
              setWeekStart((at) =>
                shiftCalendarWindow(at, -SCHEDULE_STEP_WEEKS),
              )
            }
            onNext={() =>
              setWeekStart((at) => shiftCalendarWindow(at, SCHEDULE_STEP_WEEKS))
            }
            onToday={() =>
              setWeekStart(calendarWindowStart(new Date(), { weeksBefore: 2 }))
            }
          />
          {offerings.error && (
            <p
              role="alert"
              className="border-gray-6 border-b bg-error-3 px-4 py-2 text-error-text text-sm"
            >
              {offerings.error.message}
            </p>
          )}
          <Calendar
            label="Course schedule"
            weekStart={weekStart}
            weeks={SCHEDULE_WEEKS}
            className="flex-1"
            renderDay={(day) => (
              <ScheduleDayContainer
                key={day.key}
                day={day}
                offerings={byDay.get(day.key) ?? []}
                onOpenOffering={(offeringId) =>
                  setDialog({ mode: 'edit', offeringId })
                }
              />
            )}
          />
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {draggingCourse && (
          <ScheduleCourseCard
            name={draggingCourse.name}
            moduleCount={draggingCourse.moduleCount}
            lessonCount={draggingCourse.lessonCount}
            className="w-72 cursor-grabbing shadow-xl"
          />
        )}
      </DragOverlay>

      <OfferingDialogContainer offerings={rows} />
    </DndContext>
  );
};

function nameOf(
  activeId: string | number,
  courses: { id: number; name: string }[] | undefined,
): string {
  const courseId = parseScheduleCourseDndId(activeId);
  return courses?.find((row) => row.id === courseId)?.name ?? 'a course';
}

/**
 * Every day an offering covers, keyed by that day.
 *
 * Expanded once per fetch rather than re-scanned per cell: with ten weeks on
 * screen the per-cell alternative is 70 passes over the whole list, and the
 * expansion is the same information in the shape the grid asks for.
 *
 * Walks the offering's own days rather than the window's, so an offering
 * running long before or after the window costs nothing beyond the days it
 * actually occupies here.
 */
export function groupOfferingsByDay(
  offerings: Offering[],
): Map<string, Offering[]> {
  const byDay = new Map<string, Offering[]>();
  for (const offering of offerings) {
    const [y, m, d] = offering.startsOn.split('-').map(Number);
    let cursor = new Date(y, m - 1, d);
    let key = offering.startsOn;
    // Compared as strings: `yyyy-MM-dd` sorts in date order, so this needs no
    // second Date for the end. Capped by the loop's own advance, which always
    // moves forward, so a malformed pair cannot spin.
    while (key <= offering.endsOn) {
      const list = byDay.get(key) ?? [];
      list.push(offering);
      byDay.set(key, list);
      cursor = addDays(cursor, 1);
      key = format(cursor, 'yyyy-MM-dd');
    }
  }
  return byDay;
}
