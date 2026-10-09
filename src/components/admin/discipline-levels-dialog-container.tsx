import { Dialog } from '@base-ui/react/dialog';
import { useAtom, useAtomValue } from 'jotai';
import { X } from 'lucide-react';
// `#/` not `@/`: vitest cannot resolve the `@/` alias.
import { disciplineLevelsTargetAtom, levelsBoardModeAtom } from '#/atoms/admin';
import { useDisciplineLessonPosters } from '#/data-hooks/use-discipline-lesson-posters';
import { useOrgLibrary } from '#/data-hooks/use-org-library';
import { useSetLibraryLessonLevels } from '#/data-hooks/use-set-library-lesson-levels';
import {
  DisciplineLevelsBoard,
  type DisciplineLevelsColumn,
} from './discipline-levels-board';
import { LevelModeToggle } from './level-mode-toggle';

/**
 * The open board's contents. Its own component so the posters query only
 * exists while a discipline is actually open — the dialog shell is mounted
 * for the life of the library.
 */
export const DisciplineLevelsBoardContainer = ({
  disciplineId,
}: {
  disciplineId: number;
}) => {
  // The library is already loaded by the editor behind this dialog, so this
  // reads the cache rather than refetching.
  const library = useOrgLibrary();
  const posters = useDisciplineLessonPosters(disciplineId);
  const mode = useAtomValue(levelsBoardModeAtom);
  const setLevels = useSetLibraryLessonLevels();
  const discipline = library.data?.disciplines.find(
    (d) => d.id === disciplineId,
  );

  if (library.isLoading) {
    return <p className="p-6 text-secondary text-sm">Loading lessons…</p>;
  }
  if (!discipline) {
    return (
      <p role="alert" className="p-6 text-error-text text-sm">
        This discipline could not be found. It may have been deleted.
      </p>
    );
  }

  const columns: DisciplineLevelsColumn[] = discipline.modules.map((m) => ({
    key: m.id,
    name: m.name,
    lessons: m.lessons,
  }));
  // Root-level lessons get a column only when there are some: an empty one
  // would be a heading over nothing.
  if (discipline.untitled.length > 0) {
    columns.push({
      key: 'root',
      name: 'Not in a module',
      lessons: discipline.untitled,
    });
  }

  // A press toggles the current mode's level on that lesson — added if
  // absent, removed if present — leaving its other levels alone.
  const toggleLesson = (lessonId: number) => {
    const lesson = [
      ...discipline.untitled,
      ...discipline.modules.flatMap((m) => m.lessons),
    ].find((l) => l.id === lessonId);
    if (!lesson) return;
    const levels = lesson.levels.includes(mode)
      ? lesson.levels.filter((l) => l !== mode)
      : [...lesson.levels, mode];
    setLevels.mutate({ lessonId, levels });
  };

  return (
    <>
      {posters.isError && (
        <output className="px-4 pt-3 text-secondary text-sm">
          Video thumbnails couldn't be loaded. The lessons are all here.
        </output>
      )}
      <DisciplineLevelsBoard
        columns={columns}
        mode={mode}
        onSelectLesson={toggleLesson}
        posters={posters.data}
        postersLoading={posters.isLoading}
      />
    </>
  );
};

/**
 * Full-screen "Update levels" board for one discipline, opened from its
 * column header. 16px from every viewport edge, so the library is still
 * visibly behind it and Escape or the close button returns there.
 */
export const DisciplineLevelsDialogContainer = () => {
  const [target, setTarget] = useAtom(disciplineLevelsTargetAtom);
  const [mode, setMode] = useAtom(levelsBoardModeAtom);

  return (
    <Dialog.Root
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) setTarget(null);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop fixed inset-0 bg-gray-1/70 backdrop-blur-sm" />
        <Dialog.Popup className="dialog-popup fixed inset-4 flex flex-col overflow-hidden rounded-xl border border-gray-6 bg-gray-1 shadow-xl">
          <header className="flex shrink-0 items-center gap-3 border-gray-6 border-b px-4 py-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="truncate font-semibold text-lg text-primary">
                Update levels · {target?.name}
              </Dialog.Title>
              <Dialog.Description className="text-secondary text-sm">
                Press a lesson to add or remove the selected level.
              </Dialog.Description>
            </div>
            <LevelModeToggle value={mode} onValueChange={setMode} />
            <Dialog.Close
              aria-label="Close"
              className="shrink-0 rounded-md p-1.5 text-secondary transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Dialog.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-auto">
            {target && (
              <DisciplineLevelsBoardContainer disciplineId={target.id} />
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
