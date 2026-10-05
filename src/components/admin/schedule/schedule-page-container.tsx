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
import { atom, useAtom, useSetAtom, useStore } from 'jotai';
import { type PointerEvent, useEffect, useRef } from 'react';
import {
  dispatchOfferingPopoverAtom,
  offeringPopoverAnchorAtom,
  offeringPopoverAtom,
  offeringPopoverReturnFocusAtom,
  offeringPopoverSuppressFocusPreviewAtom,
  SCHEDULE_STEP_WEEKS,
  SCHEDULE_WEEKS,
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
import { createHoverIntent, type HoverIntent } from './hover-intent';
import {
  OfferingPopoverContainer,
  offeringPopoverFirstField,
} from './offering-popover-container';
import { CLOSED, type PopoverTarget } from './offering-popover-state';
import type { SegmentHandlers } from './offering-segment';
import { anchorFromPointerEvent, type PopoverAnchor } from './popover-anchor';
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
 * opens the popover, already pinned, that creates an OFFERING: one dated run
 * of that course.
 * The same course dragged out twice is two offerings, which is how a course
 * runs in both spring and autumn.
 *
 * The drop decides the START date and nothing else. The end date is the
 * popover's only required question.
 *
 * An offering already on the calendar previews in the same popover when the
 * mouse rests on it (or keyboard focus lands on it), and a click, Enter or
 * tap pins it for editing. This page only ever previews, leaves or pins; every
 * exit from a pinned popover belongs to `OfferingPopoverContainer`.
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
  const dispatch = useSetAtom(dispatchOfferingPopoverAtom);
  const setAnchor = useSetAtom(offeringPopoverAnchorAtom);
  const setReturnFocus = useSetAtom(offeringPopoverReturnFocusAtom);
  // Popover state is read lazily, never subscribed to: the page renders
  // nothing from it, and handlers and timer callbacks outlive the render that
  // created them, so they must ask the store for the CURRENT state.
  const store = useStore();
  const popoverStatus = () => store.get(offeringPopoverAtom).status;

  // The latest cursor anchor over the hovered segment, so the delayed open
  // lands where the pointer IS after 300 ms, not where it entered.
  const pendingAnchor = useRef<PopoverAnchor | null>(null);
  const moveFrame = useRef<number | null>(null);
  const focusFrame = useRef<number | null>(null);
  // Whether the last drop was refused because a popover is pinned (dirty and
  // asking, or clean but not dismissed — a keyboard drag never presses
  // outside it). Written in onDragEnd and read by the drop announcement, which
  // dnd-kit runs right AFTER onDragEnd — by then a successful drop has pinned
  // too, so the popover state alone cannot tell the two apart.
  const dropRefused = useRef(false);
  /**
   * Hover anchors pass coordinates ONLY: pointer events always report
   * `detail` 0, which `anchorFromPointerEvent` reads as a keyboard click and
   * would anchor to the whole segment instead of the cursor.
   */
  const cursorAnchor = (event: PointerEvent<HTMLButtonElement>) =>
    anchorFromPointerEvent(event.currentTarget, {
      clientX: event.clientX,
      clientY: event.clientY,
    });
  /** A course is being dragged: hover previews would open under the overlay. */
  const isDragging = () => store.get(draggingCourseAtom) !== null;

  // Created once (lazy init). Its callbacks read the store, not this render.
  const hoverRef = useRef<HoverIntent | null>(null);
  hoverRef.current ??= createHoverIntent({
    onOpen: (offeringId) => {
      if (store.get(offeringPopoverAtom).status === 'pinned') return;
      if (isDragging()) return;
      if (pendingAnchor.current) setAnchor(pendingAnchor.current);
      dispatch({ type: 'preview', offeringId });
    },
    onClose: (offeringId) => dispatch({ type: 'leave', offeringId }),
  });
  const hover = hoverRef.current;

  // Unmount only: the hover timers and animation frames live outside React
  // and would otherwise fire into a page that is gone.
  //
  // The popover atoms live in the app-wide store, so they outlive this page
  // too: leaving with an offering pinned (a sidebar link, say) would bring
  // the same popover back on return. A teardown, not a transition, so the
  // state is set directly rather than through the reducer.
  useEffect(
    () => () => {
      hoverRef.current?.cancel();
      if (moveFrame.current !== null) cancelAnimationFrame(moveFrame.current);
      if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
      store.set(offeringPopoverAtom, CLOSED);
      store.set(offeringPopoverAnchorAtom, null);
      store.set(offeringPopoverReturnFocusAtom, null);
      store.set(offeringPopoverSuppressFocusPreviewAtom, null);
    },
    [store],
  );

  /**
   * Pin, then put focus in the popover — Base UI's initialFocus only runs on
   * open. Returns false when refused.
   */
  const pin = (target: PopoverTarget, anchor: PopoverAnchor): boolean => {
    hover.cancel();
    // Pinning while another offering is pinned is refused by the reducer (a
    // mouse press outside a clean pin closes it first, so what is left is a
    // dirty one asking, or a keyboard drag that never pressed outside); do
    // not move the anchor out from under it.
    if (popoverStatus() === 'pinned') return false;
    setAnchor(anchor);
    // Only a keyboard pin returns focus to the segment on close. A mouse,
    // touch or drop pin leaves focus wherever the user puts it next.
    setReturnFocus(
      anchor.kind === 'element' && anchor.element instanceof HTMLElement
        ? anchor.element
        : null,
    );
    dispatch({ type: 'pin', target });
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    focusFrame.current = requestAnimationFrame(() => {
      focusFrame.current = null;
      offeringPopoverFirstField.current?.focus();
    });
    return true;
  };

  const segmentHandlers = (offeringId: number): SegmentHandlers => ({
    onPointerEnter: (event) => {
      if (event.pointerType !== 'mouse' || isDragging()) return;
      pendingAnchor.current = cursorAnchor(event);
      const isPreviewing = popoverStatus() === 'preview';
      // Moving onto another offering while one previews switches at once —
      // the anchor must move with it.
      if (isPreviewing) setAnchor(pendingAnchor.current);
      hover.enter(offeringId, event.pointerType, isPreviewing);
    },
    onPointerMove: (event) => {
      if (event.pointerType !== 'mouse' || isDragging()) return;
      pendingAnchor.current = cursorAnchor(event);
      const state = store.get(offeringPopoverAtom);
      if (state.status !== 'preview' || state.offeringId !== offeringId) return;
      // One anchor write per frame: pointermove can fire faster than paint.
      if (moveFrame.current !== null) return;
      moveFrame.current = requestAnimationFrame(() => {
        moveFrame.current = null;
        // Pinned in the meantime: a pinned popover stays where it was put.
        if (store.get(offeringPopoverAtom).status !== 'preview') return;
        if (pendingAnchor.current) setAnchor(pendingAnchor.current);
      });
    },
    onPointerLeave: (event) => hover.leave(offeringId, event.pointerType),
    onFocus: (event) => {
      // Keyboard only: a mouse click also focuses the button, and that path
      // is handled by hover + click. `:focus-visible` is the browser's own
      // "this came from the keyboard" signal.
      // One-shot: the popover just closed and is handing focus back here.
      const suppressed = store.get(offeringPopoverSuppressFocusPreviewAtom);
      store.set(offeringPopoverSuppressFocusPreviewAtom, null);
      if (suppressed === event.currentTarget) return;
      if (!event.currentTarget.matches(':focus-visible')) return;
      if (popoverStatus() === 'pinned') return;
      // Tabbing from another day of this same offering: its blur's close is
      // still pending — cancel it, so the preview moves instead of blinking.
      hover.keepOpen();
      setAnchor({ kind: 'element', element: event.currentTarget });
      dispatch({ type: 'preview', offeringId });
    },
    // Leaving the bar by keyboard closes its preview, after the same grace a
    // mouse gets. If focus moved INTO the popover the state is pinned by then
    // and the eventual `leave` is a no-op; on another offering it previews
    // that one, and the `leave` for this id is a no-op too.
    onBlur: () => hover.blur(offeringId),
    // Not gated on `canSchedule`: every user could open an offering before
    // the popover replaced the dialog, and still can.
    onClick: (event) => {
      pin(
        { mode: 'edit', offeringId },
        anchorFromPointerEvent(event.currentTarget, event),
      );
    },
  });
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
    dropRefused.current = false;
    if (!canSchedule) return;

    const courseId = parseScheduleCourseDndId(event.active.id);
    // Released over nothing is "never mind", not a mistake — no toast.
    if (!event.over) return;
    const dayKey = parseScheduleDayDndId(event.over.id);
    if (courseId === null || dayKey === null) return;

    const course = courses.data?.find((row) => row.id === courseId);
    if (!course) return;

    // The day dropped on, captured once: a fixed rect is enough — the popover
    // pins immediately and is about to take focus, not follow anything.
    const r = event.over.rect;
    dropRefused.current = !pin(
      { mode: 'create', courseId, courseName: course.name, startsOn: dayKey },
      {
        kind: 'rect',
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
      },
    );
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
            !over
              ? 'Cancelled. Nothing was scheduled.'
              : dropRefused.current
                ? 'Nothing was scheduled. An offering is open. Close it, then drop again.'
                : `Dropped on ${parseScheduleDayDndId(over.id)}. Set the end date to finish scheduling.`,
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
                segmentHandlers={segmentHandlers}
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

      <OfferingPopoverContainer
        offerings={rows}
        // Placeholder rows are the PREVIOUS window's, kept on screen while
        // the new one loads: an offering missing from them proves nothing.
        isListSettled={offerings.isSuccess && !offerings.isPlaceholderData}
      />
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
