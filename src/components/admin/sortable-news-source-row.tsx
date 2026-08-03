import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ImageOff, Pencil, Trash2 } from 'lucide-react';
import type { NewsSource } from '#/lib/admin-schemas';
import { BinaryToggle } from './lesson-config/binary-toggle';
import { OptimizedPicture } from './optimized-picture';

interface SortableNewsSourceRowProps {
  source: NewsSource;
  position: number;
  total: number;
  onEdit: () => void;
  onDelete: () => void;
  onActiveChange: (active: boolean) => void;
}

/** One draggable news-source row: logo, name, URL, visibility, edit, delete. */
export const SortableNewsSourceRow = ({
  source,
  position,
  total,
  onEdit,
  onDelete,
  onActiveChange,
}: SortableNewsSourceRowProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: source.id });

  const hasLogo = Boolean(
    source.imageUrlWebp ?? source.imageUrlAvif ?? source.imageUrl,
  );

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className="flex items-center gap-3 rounded-lg border border-gray-6 bg-gray-2 p-3"
    >
      <button
        type="button"
        aria-label={`Reorder ${source.name}, position ${position} of ${total}`}
        className="cursor-grab rounded-md p-1 text-tertiary hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>

      {/*
        The tint sits behind the logo, never behind text — it is admin-supplied
        and unconstrained, so nothing here can guarantee a contrast ratio
        against it. Falls back to the panel color when unset.
      */}
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-gray-6"
        style={{ backgroundColor: source.tintColor ?? undefined }}
      >
        {hasLogo ? (
          <OptimizedPicture
            avifUrl={source.imageUrlAvif}
            webpUrl={source.imageUrlWebp}
            plainUrl={source.imageUrl}
            alt=""
            className="h-full w-full object-contain p-1"
          />
        ) : (
          <ImageOff className="h-4 w-4 text-tertiary" aria-hidden="true" />
        )}
      </div>

      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-primary text-sm">
          {source.name}
        </span>
        <span className="truncate text-secondary text-xs">{source.url}</span>
      </div>

      <div className="ms-auto flex shrink-0 items-center gap-2">
        <BinaryToggle
          // Label carries the source name: BinaryToggle seeds its pill's
          // layoutId from this, and two rows sharing a label would animate
          // their pills into one another.
          label={`${source.name} visibility`}
          value={source.active ? 'shown' : 'hidden'}
          onValueChange={(next) => onActiveChange(next === 'shown')}
          options={[
            { value: 'shown', label: 'Shown' },
            { value: 'hidden', label: 'Hidden' },
          ]}
        />
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${source.name}`}
          className="rounded-md p-1.5 text-tertiary transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${source.name}`}
          className="rounded-md p-1.5 text-tertiary transition-colors hover:bg-error-9/15 hover:text-error-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
};
