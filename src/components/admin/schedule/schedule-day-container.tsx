import { useDroppable } from '@dnd-kit/core';
import { type CalendarDay, CalendarDayCell } from '#/components/calendar';
import type { Offering } from '#/lib/offering-schemas';
import { formatOfferingRange } from './offering-dialog-container';
import { OfferingSegment } from './offering-segment';
import { offeringTone, scheduleDayDndId } from './schedule-dnd';

/**
 * One day of the schedule: a drop target carrying whatever runs that day.
 *
 * The droppable ref goes on `CalendarDayCell` itself, not on a wrapper inside
 * it — that component spreads unknown props onto the real cell for exactly
 * this reason. A droppable smaller than the cell it looks like leaves dead
 * strips along the edges where a drop silently does nothing.
 */
export const ScheduleDayContainer = ({
  day,
  offerings,
  onOpenOffering,
}: {
  day: CalendarDay;
  /** The offerings running on THIS day, in a stable order across days. */
  offerings: Offering[];
  onOpenOffering: (offeringId: number) => void;
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: scheduleDayDndId(day.key),
    data: { type: 'schedule-day', dayKey: day.key },
  });

  return (
    <CalendarDayCell ref={setNodeRef} day={day} isOver={isOver}>
      {offerings.map((offering) => {
        const isStart = offering.startsOn === day.key;
        const isEnd = offering.endsOn === day.key;
        return (
          <OfferingSegment
            key={offering.id}
            tone={offeringTone(offering.id)}
            label={`${offering.courseName} · ${formatOfferingRange(offering)}`}
            isStart={isStart}
            isEnd={isEnd}
            // The offering was already running when this window opened, and
            // this is the first day of it on screen.
            isContinuation={
              !isStart && day.weekIndex === 0 && day.dayIndex === 0
            }
            headcount={offering.users.length}
            accessibleName={`${offering.courseName}, ${formatOfferingRange(offering)}, ${offering.users.length} ${offering.users.length === 1 ? 'person' : 'people'}. Edit this offering.`}
            onClick={() => onOpenOffering(offering.id)}
          />
        );
      })}
    </CalendarDayCell>
  );
};
