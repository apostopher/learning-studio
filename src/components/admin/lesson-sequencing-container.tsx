import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useCourseBoard } from '@/data-hooks/use-course-board';
import {
  useUpdateLessonDependencies,
  useUpdateModuleSequential,
} from '@/data-hooks/use-update-lesson-sequencing';
import {
  buildSequencingRows,
  toGateCourseFromBoard,
} from '@/lib/lesson-sequencing-rows';
import { BinaryToggle } from './lesson-config/binary-toggle';
import {
  type DependencyOption,
  ModuleDependencyPicker,
} from './module-dependency-picker';

type OrderValue = 'ordered' | 'any';

/**
 * Lesson sequencing tab: one collapsible section per module, each with a
 * "lessons run in order" toggle and a row per lesson showing what actually
 * gates it.
 *
 * The computed prerequisite is on screen for every lesson, not just the
 * overridden ones. The chain SKIPS lessons that cannot block, and drops
 * override edges that point forwards — both are prerequisites that look
 * configured and do nothing, and this screen is the only place either is ever
 * reported. Hiding the derivation would reproduce exactly the invisible inert
 * gate that `moduleGateWarning` exists to catch.
 *
 * Rows are built by `buildSequencingRows`, which calls the same predicate the
 * server enforces with, so the explanation here cannot drift from the gate.
 */
export const LessonSequencingContainer = ({
  courseId,
}: {
  courseId: number;
}) => {
  const { data: board, isLoading, error } = useCourseBoard(courseId);
  const updateSequential = useUpdateModuleSequential(courseId);
  const updateDependencies = useUpdateLessonDependencies(courseId);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [overriding, setOverriding] = useState<Record<number, boolean>>({});

  if (isLoading) {
    return <p className="text-secondary text-sm">Loading lessons…</p>;
  }
  if (error) {
    return (
      <p className="text-error-text text-sm">Failed to load this course.</p>
    );
  }

  const modules = board?.modules ?? [];
  const withLessons = modules.filter((m) => m.lessons.length > 0);
  if (withLessons.length === 0) {
    return (
      <p className="text-secondary text-sm">
        Add lessons to this course before you can sequence them.
      </p>
    );
  }

  const course = toGateCourseFromBoard(modules);
  const nameBySlug = new Map(
    modules.flatMap((m) => m.lessons.map((l) => [l.slug, l.name] as const)),
  );

  return (
    <div className="flex flex-col gap-2">
      {withLessons.map((mod) => {
        // Collapsed by default except the first: a 100-lesson course would
        // otherwise open as an unreadable wall, and the module heading plus
        // its toggle is the level most visits are here to change.
        const isOpen = expanded[mod.id] ?? mod === withLessons[0];
        const rows = buildSequencingRows(course, mod);

        return (
          <section
            key={mod.id}
            className="rounded-md border border-gray-6 bg-gray-1"
          >
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                onClick={() =>
                  setExpanded((prev) => ({ ...prev, [mod.id]: !isOpen }))
                }
                aria-expanded={isOpen}
                className="flex flex-1 items-center gap-2 text-start text-primary text-sm font-medium"
              >
                <ChevronRight
                  size={16}
                  aria-hidden="true"
                  className={isOpen ? 'rotate-90 transition-transform' : ''}
                />
                {mod.name}
                <span className="text-tertiary text-xs font-normal">
                  {mod.lessons.length}{' '}
                  {mod.lessons.length === 1 ? 'lesson' : 'lessons'}
                </span>
              </button>

              <BinaryToggle<OrderValue>
                label={`Lesson order for ${mod.name}`}
                value={mod.sequentialLessons ? 'ordered' : 'any'}
                onValueChange={(next) =>
                  updateSequential.mutate({
                    moduleId: mod.id,
                    sequentialLessons: next === 'ordered',
                  })
                }
                options={[
                  { value: 'ordered', label: 'In order' },
                  { value: 'any', label: 'Any order' },
                ]}
              />
            </div>

            {isOpen && (
              <ol className="flex flex-col border-gray-6 border-t">
                {rows.map((row) => {
                  const isOverriding =
                    overriding[row.lessonId] ?? row.source === 'explicit';
                  const options: DependencyOption[] = row.optionSlugs.map(
                    (slug) => ({
                      slug,
                      name: nameBySlug.get(slug) ?? slug,
                      blockedReason: null,
                    }),
                  );

                  return (
                    <li
                      key={row.lessonId}
                      className="flex flex-col gap-1 border-gray-6 border-b px-3 py-2 last:border-b-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-tertiary text-xs tabular-nums">
                          {String(row.position).padStart(2, '0')}
                        </span>
                        <span className="flex-1 text-primary text-sm">
                          {row.name}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setOverriding((prev) => ({
                              ...prev,
                              [row.lessonId]: !isOverriding,
                            }))
                          }
                          className="rounded px-2 py-1 text-secondary text-xs hover:bg-gray-a3 hover:text-primary"
                        >
                          {isOverriding ? 'Use module order' : 'Override'}
                        </button>
                      </div>

                      {isOverriding ? (
                        <ModuleDependencyPicker
                          label={row.name}
                          value={row.prerequisites.map((p) => p.slug)}
                          options={options}
                          onValueChange={(next) =>
                            updateDependencies.mutate({
                              lessonId: row.lessonId,
                              dependsOn: next,
                            })
                          }
                        />
                      ) : (
                        <p className="ps-6 text-secondary text-xs">
                          {row.prerequisites.length > 0
                            ? `After: ${row.prerequisites
                                .map((p) => p.name)
                                .join(', ')}`
                            : 'No prerequisite'}
                        </p>
                      )}

                      {row.note && (
                        <p className="ps-6 text-tertiary text-xs">{row.note}</p>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        );
      })}
    </div>
  );
};
