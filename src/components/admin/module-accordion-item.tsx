import { Accordion } from '@base-ui/react/accordion';
import { ChevronDown, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import type { BoardModule } from '#/lib/admin-schemas';
import { ClampedText } from '../clamped-text';
import { TooltipIconButton } from '../ui/tooltip-icon-button';

interface ModuleAccordionItemProps {
  module: BoardModule;
  /** Spread onto the drag handle button (e.g. dnd-kit's `listeners`/`attributes`). */
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>;
  onAddLesson?: () => void;
  onEditModule?: () => void;
  onDeleteModule?: () => void;
  /**
   * The module's lessons, rendered inside the accordion panel — a DnD-enabled
   * sortable list from a container, or a static list for a drag overlay.
   */
  lessonsSlot: ReactNode;
}

/**
 * One module inside a `CourseColumn`'s accordion: a trigger stating its name
 * and lesson count, action buttons, and a drag handle, with its panel
 * holding whatever lessons list it's handed.
 *
 * The drag handle and the action buttons are siblings of `Accordion.Trigger`,
 * never children of it. Nesting a `<button>` inside the trigger would mean
 * grabbing the handle (or clicking delete) also toggles the accordion, so
 * the module would collapse the instant a drag starts.
 */
export const ModuleAccordionItem = ({
  module: mod,
  dragHandleProps,
  onAddLesson,
  onEditModule,
  onDeleteModule,
  lessonsSlot,
}: ModuleAccordionItemProps) => {
  const lessonCount = mod.lessons.length;
  const lessonNoun = lessonCount === 1 ? 'lesson' : 'lessons';

  return (
    <Accordion.Item
      value={mod.id}
      className="flex flex-col border-gray-6 border-b last:border-b-0"
    >
      <div className="flex items-center gap-1 px-3 py-2">
        <Accordion.Header className="contents">
          <Accordion.Trigger
            aria-label={`Toggle module ${mod.name}, ${lessonCount} ${lessonNoun}`}
            className="group flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
          >
            <ChevronDown
              className="h-4 w-4 shrink-0 text-tertiary transition-transform group-data-[panel-open]:rotate-180"
              aria-hidden="true"
            />
            <ClampedText
              text={mod.name}
              lines={1}
              className="min-w-0 flex-1 font-medium text-primary text-sm"
            />
            <span className="shrink-0 text-tertiary text-xs tabular-nums">
              {lessonCount} {lessonNoun}
            </span>
          </Accordion.Trigger>
        </Accordion.Header>

        {onAddLesson && (
          <TooltipIconButton label="Add lesson" onClick={onAddLesson}>
            <Plus className="h-4 w-4" aria-hidden="true" />
          </TooltipIconButton>
        )}
        {onEditModule && (
          <TooltipIconButton label="Edit module" onClick={onEditModule}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </TooltipIconButton>
        )}
        {onDeleteModule && (
          <TooltipIconButton
            label="Delete module"
            onClick={onDeleteModule}
            variant="danger"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </TooltipIconButton>
        )}

        <button
          type="button"
          aria-label={`Reorder module ${mod.name}`}
          {...dragHandleProps}
          className="-me-1 shrink-0 cursor-grab rounded-md p-1 text-tertiary transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <Accordion.Panel className="overflow-hidden">
        <div className="flex flex-col gap-2 px-3 pb-3">{lessonsSlot}</div>
      </Accordion.Panel>
    </Accordion.Item>
  );
};
