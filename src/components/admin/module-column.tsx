import { GripVertical, ImageIcon, Pencil, Plus, Trash2 } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import type { BoardModule } from '@/lib/admin-schemas';
import { ClampedText } from '../clamped-text';
import { LessonCard } from './lesson-card';
import { OptimizedPicture } from './optimized-picture';
import { TooltipIconButton } from './tooltip-icon-button';

export const ModuleColumn = ({
  module: mod,
  dragHandleProps,
  onAddLesson,
  onEditModule,
  onDeleteModule,
  lessonsSlot,
}: {
  module: BoardModule;
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>;
  onAddLesson?: () => void;
  onEditModule?: () => void;
  onDeleteModule?: () => void;
  /** DnD-enabled lessons list; falls back to a static list (e.g. drag overlay). */
  lessonsSlot?: ReactNode;
}) => {
  const hasCover = Boolean(mod.imageUrlWebp ?? mod.imageUrlAvif);

  return (
    <section className="course-board__column flex w-80 shrink-0 flex-col rounded-xl border border-gray-6 bg-gray-2">
      <header className="sticky top-0 z-10 flex items-center gap-1 rounded-t-xl border-b border-gray-6 bg-gray-3 px-3 py-2">
        <ClampedText
          text={mod.name}
          className="min-w-0 flex-1 text-sm font-semibold text-primary"
        />
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
          aria-label="Drag to reorder module"
          {...dragHandleProps}
          className="-me-1 shrink-0 cursor-grab rounded p-1 text-tertiary transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <div className="aspect-video w-full overflow-hidden bg-gray-3">
        {hasCover ? (
          <OptimizedPicture
            avifUrl={mod.imageUrlAvif}
            webpUrl={mod.imageUrlWebp}
            alt={`${mod.name} cover`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-8">
            <ImageIcon className="h-8 w-8" aria-hidden="true" />
          </div>
        )}
      </div>

      <p className="px-3 pt-3 pb-1 font-medium text-tertiary text-xs uppercase tracking-wide">
        Lessons
      </p>

      <div className="flex flex-col gap-2 px-3 pb-3">
        {lessonsSlot ??
          (mod.lessons.length === 0 ? (
            <p className="px-1 py-4 text-center text-tertiary text-xs">
              No lessons
            </p>
          ) : (
            mod.lessons.map((lesson) => (
              <LessonCard key={lesson.id} lesson={lesson} />
            ))
          ))}
      </div>
    </section>
  );
};
