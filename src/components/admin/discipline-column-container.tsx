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
  expandedLibraryModuleIdsAtom,
  renameDisciplineTargetAtom,
} from '#/atoms/admin';
import { disciplineLessons, type LibraryDiscipline } from '#/lib/admin-schemas';
import { cn } from '#/lib/cn';
import {
  disciplineDndId,
  libraryModuleDndId,
  UNTITLED_DISCIPLINE_ID,
} from '#/lib/dnd-ids';
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
 * `discipline` carries its modules and its Untitled group — never a flat
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
  const openAddLesson = useSetAtom(createLibraryLessonTargetAtom);
  const openAddModule = useSetAtom(createDisciplineModuleTargetAtom);
  const openRename = useSetAtom(renameDisciplineTargetAtom);
  const openDelete = useSetAtom(deleteDisciplineTargetAtom);

  // The "Untitled" column is not a discipline: there is nothing to rename or
  // delete, and a lesson filed under nothing is a triage-queue entry rather
  // than something to create on purpose. It gets no action row at all, and
  // its lessons stay draggable with no Untitled droppable of their own — see
  // `LibraryUntitledContainer`'s `isOrgLevel`.
  const isUntitled = disciplineId === UNTITLED_DISCIPLINE_ID;

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
          isUntitled ? undefined : (
            <DisciplineColumnActions
              disciplineName={name}
              canManage={canManageDisciplines}
              onAddModule={() =>
                openAddModule({
                  disciplineId,
                  disciplineName: name,
                })
              }
              onAddLesson={() => openAddLesson({ id: disciplineId, name })}
              onRename={() => openRename({ id: disciplineId, name })}
              onDelete={() =>
                openDelete({
                  id: disciplineId,
                  name,
                  lessonCount,
                })
              }
            />
          )
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
            />
          ))}
        </SortableContext>
        <LibraryUntitledContainer
          disciplineId={disciplineId}
          lessons={discipline.untitled}
          isOrgLevel={isUntitled}
        />
      </DisciplineColumn>
    </div>
  );
};
