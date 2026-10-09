import { Video } from 'lucide-react';
import type { LibraryLesson } from '#/lib/admin-schemas';
import { cn } from '#/lib/cn';
import { LEVEL_LABELS } from '#/lib/level-labels';
import { USER_LEVELS, type UserLevel } from '#/types';

export type DisciplineLevelsColumn = {
  /** A module id, or `'root'` for the lessons filed in no module. */
  key: number | 'root';
  name: string;
  lessons: LibraryLesson[];
};

/**
 * A discipline laid out kanban-style for tagging lesson levels: one column
 * per module, in rank order, its lessons stacked as rows — the same reading
 * order as the course editor's module board.
 *
 * Each lesson is its thumbnail, name and level badges, as a toggle button for
 * the board's current `mode`: pressed (accent outline) when the lesson
 * already carries that level. Pure — the container supplies the columns, the
 * posters, the mode and what a press does.
 */
export const DisciplineLevelsBoard = ({
  columns,
  mode,
  posters,
  postersLoading = false,
  onSelectLesson,
}: {
  columns: DisciplineLevelsColumn[];
  /** The level a press adds or removes. */
  mode: UserLevel;
  /** Lesson id → poster frame, when the discipline's shelf has one. */
  posters?: Record<string, string>;
  /**
   * The posters request is still out. It takes seconds (one provider call
   * per shelf), and without this a lesson that HAS a video would sit there
   * showing the no-video glyph — which reads as broken.
   */
  postersLoading?: boolean;
  onSelectLesson?: (lessonId: number) => void;
}) =>
  columns.length === 0 ? (
    <p className="p-6 text-center text-secondary text-sm">
      This discipline has no lessons yet.
    </p>
  ) : (
    <div className="flex h-full w-max items-start gap-4 p-4">
      {columns.map((column) => (
        <section
          key={column.key}
          aria-label={column.name}
          className="flex max-h-full w-80 shrink-0 flex-col rounded-xl border border-gray-6 bg-gray-2"
        >
          <header className="flex items-center gap-2 rounded-t-xl border-gray-6 border-b bg-gray-3 px-3 py-2">
            <h3 className="min-w-0 flex-1 truncate font-semibold text-primary text-sm">
              {column.name}
            </h3>
            <span className="shrink-0 text-tertiary text-xs tabular-nums">
              {column.lessons.length}{' '}
              {column.lessons.length === 1 ? 'lesson' : 'lessons'}
            </span>
          </header>
          <div className="flex min-h-0 flex-col gap-2 overflow-y-auto p-3">
            {column.lessons.length === 0 ? (
              <p className="px-1 py-4 text-center text-tertiary text-xs">
                No lessons
              </p>
            ) : (
              column.lessons.map((lesson) => {
                const poster = lesson.isConfigured
                  ? posters?.[lesson.id]
                  : undefined;
                const waiting = lesson.isConfigured && postersLoading;
                const tagged = lesson.levels.includes(mode);
                // In the canonical order, whatever order they were saved in.
                const badges = USER_LEVELS.filter((l) =>
                  lesson.levels.includes(l),
                );
                return (
                  <button
                    key={lesson.id}
                    type="button"
                    onClick={() => onSelectLesson?.(lesson.id)}
                    // A toggle for the current mode's level: the outline says
                    // it visually, `aria-pressed` says it to a screen reader.
                    aria-pressed={tagged}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-start text-primary text-sm outline outline-2 outline-offset-0 transition-[outline-color,background-color] duration-150 hover:bg-gray-2 focus-visible:ring-2 focus-visible:ring-apple-9 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-2',
                      // Hover stays neutral so it never reads as "tagged".
                      tagged
                        ? 'outline-accent'
                        : 'outline-transparent hover:outline-gray-8',
                    )}
                  >
                    {/* Decorative: the button is named by the lesson's name
                        beside it, so the frame adds nothing to announce. */}
                    <span
                      className={cn(
                        'relative flex aspect-video w-20 shrink-0 items-center justify-center overflow-hidden rounded bg-gray-3 text-gray-8',
                        waiting && 'motion-safe:animate-pulse',
                      )}
                      data-loading={waiting || undefined}
                    >
                      {poster ? (
                        <img
                          src={poster}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : (
                        // The no-video glyph only once we KNOW there is no
                        // frame coming: never while one is still loading.
                        !waiting && (
                          <Video className="h-4 w-4" aria-hidden="true" />
                        )
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="line-clamp-2">{lesson.name}</span>
                      {badges.length > 0 && (
                        <span className="flex flex-wrap gap-1">
                          {badges.map((level) => (
                            <span
                              key={level}
                              className={cn(
                                'rounded px-1.5 py-0.5 font-medium text-xs',
                                level === mode
                                  ? 'bg-accent-muted text-primary'
                                  : 'bg-gray-4 text-secondary',
                              )}
                            >
                              {LEVEL_LABELS[level]}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>
      ))}
    </div>
  );
