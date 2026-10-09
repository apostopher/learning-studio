import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useAtom, useSetAtom } from 'jotai';
import {
  createDisciplineModuleTargetAtom,
  createLibraryLessonTargetAtom,
  deleteDisciplineTargetAtom,
  disciplineLevelsTargetAtom,
  expandedLibraryModuleIdsAtom,
  renameDisciplineTargetAtom,
} from '#/atoms/admin';
import { useDisciplineLessonPosters } from '#/data-hooks/use-discipline-lesson-posters';
import { disciplineLessons, type LibraryDiscipline } from '#/lib/admin-schemas';
import { cn } from '#/lib/cn';
import { disciplineDndId, libraryModuleDndId } from '#/lib/dnd-ids';
import { DisciplineColumn } from './discipline-column';
import { DisciplineColumnActions } from './discipline-column-actions';
import { LibraryModuleContainer } from './library-module-container';
import { LibraryUntitledContainer } from './library-untitled-container';

/**
 * One discipline column, registered as a drop target.
 *
 * It is a droppable it will always refuse. That is deliberate: the editor
 * shares one DndContext across both panes, so a lesson dragged over the
 * library is over *something*, and the only way to answer "you cannot put it
 * back here, and here is why" is to be a real target that `resolveDrop`
 * refuses by name.
 *
 * `discipline` carries its modules and its root-level lessons — never a flat
 * lesson list — because `disciplineLessons` is the ONE definition of "every
 * lesson in this discipline, in display order", and this column and the drop
 * resolver must never be able to disagree about membership.
 */
export const DisciplineColumnContainer = ({
  disciplineId,
  name,
  discipline,
  canManageDisciplines = false,
}: {
  disciplineId: number;
  name: string;
  discipline: Pick<LibraryDiscipline, 'modules' | 'untitled'>;
  /**
   * Whether this actor may rename or delete a discipline — both `requireAdmin`
   * on the server. Add-lesson is not gated here: authority over a lesson
   * follows its discipline, which the router context cannot answer, so the
   * control is offered and the server refuses if it must.
   */
  canManageDisciplines?: boolean;
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: disciplineDndId(disciplineId),
    data: { type: 'discipline', disciplineId },
  });
  const openAddModule = useSetAtom(createDisciplineModuleTargetAtom);
  const openRename = useSetAtom(renameDisciplineTargetAtom);
  const openDelete = useSetAtom(deleteDisciplineTargetAtom);

  const openAddLesson = useSetAtom(createLibraryLessonTargetAtom);
  const openLevels = useSetAtom(disciplineLevelsTargetAtom);
  // Warms this shelf's posters as soon as the column is on screen. The
  // request takes seconds (it lists videos at the provider), and both the
  // lesson cards and the Update levels board read this same cache entry —
  // started only when one of them mounted, the board opened onto blank tiles.
  useDisciplineLessonPosters(disciplineId);

  const [expandedModuleIds, setExpandedModuleIds] = useAtom(
    expandedLibraryModuleIdsAtom,
  );
  const ownModuleIds = new Set(discipline.modules.map((m) => m.id));
  const lessonCount = disciplineLessons(discipline).length;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'h-full shrink-0 rounded-xl',
        // The ring is the error colour, not the accent: hovering here is
        // never going to work, and a welcoming highlight would say otherwise.
        isOver && 'ring-2 ring-error-9/40',
      )}
    >
      <DisciplineColumn
        name={name}
        lessonCount={lessonCount}
        actions={
          <DisciplineColumnActions
            disciplineName={name}
            canManage={canManageDisciplines}
            onUpdateLevels={() => openLevels({ id: disciplineId, name })}
            onAddLesson={() =>
              openAddLesson({ id: disciplineId, name, module: null })
            }
            onAddModule={() =>
              openAddModule({
                disciplineId,
                disciplineName: name,
              })
            }
            onRename={() => openRename({ id: disciplineId, name })}
            onDelete={() =>
              openDelete({
                id: disciplineId,
                name,
                lessonCount,
              })
            }
          />
        }
        expandedModuleIds={expandedModuleIds.filter((id) =>
          ownModuleIds.has(id),
        )}
        onExpandedModuleIdsChange={(next) => {
          setExpandedModuleIds((prev) => [
            ...prev.filter((id) => !ownModuleIds.has(id)),
            ...next,
          ]);
        }}
      >
        <SortableContext
          items={discipline.modules.map((m) => libraryModuleDndId(m.id))}
          strategy={verticalListSortingStrategy}
        >
          {discipline.modules.map((mod) => (
            <LibraryModuleContainer
              key={mod.id}
              module={mod}
              disciplineId={disciplineId}
              disciplineName={name}
            />
          ))}
        </SortableContext>
        <LibraryUntitledContainer
          disciplineId={disciplineId}
          lessons={discipline.untitled}
        />
      </DisciplineColumn>
    </div>
  );
};
