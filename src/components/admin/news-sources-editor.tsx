import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import type { NewsSource } from '#/lib/admin-schemas';
import { SortableNewsSourceRow } from './sortable-news-source-row';

interface NewsSourcesEditorProps {
  sources: readonly NewsSource[];
  onAdd: () => void;
  onEdit: (source: NewsSource) => void;
  onDelete: (source: NewsSource) => void;
  onActiveChange: (source: NewsSource, active: boolean) => void;
  onDragEnd: (event: DragEndEvent) => void;
}

/**
 * A course's news sources, drag-reorderable.
 *
 * Presentational and hookless apart from dnd-kit's own sensor hooks — the same
 * allowance `onboarding-questions-editor.tsx` relies on.
 */
export const NewsSourcesEditor = ({
  sources,
  onAdd,
  onEdit,
  onDelete,
  onActiveChange,
  onDragEnd,
}: NewsSourcesEditorProps) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-secondary text-sm">
        Publications this course pulls news from, in the order they appear. Each
        course keeps its own list — adding a source here does not affect any
        other course.
      </p>

      {sources.length === 0 ? (
        <p className="rounded-lg border border-gray-6 border-dashed py-8 text-center text-sm text-tertiary">
          No news sources yet. Add one to start building this course&rsquo;s
          feed.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={sources.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex list-none flex-col gap-2">
              {sources.map((source, index) => (
                <SortableNewsSourceRow
                  key={source.id}
                  source={source}
                  position={index + 1}
                  total={sources.length}
                  onEdit={() => onEdit(source)}
                  onDelete={() => onDelete(source)}
                  onActiveChange={(active) => onActiveChange(source, active)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <div>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-6 px-3 py-2 font-medium text-primary text-sm transition-colors hover:bg-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add news source
        </button>
      </div>
    </div>
  );
};
