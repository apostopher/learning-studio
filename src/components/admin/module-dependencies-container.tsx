// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its component test.
import { BOARD_FORBIDDEN, useCourseBoard } from '#/data-hooks/use-course-board';
import { useUpdateModuleDependencies } from '@/data-hooks/use-update-module-dependencies';
import type { BoardModule } from '@/lib/admin-schemas';
import {
  cyclicPrerequisites,
  type DepModule,
  moduleGateWarning,
} from '@/lib/module-dependency-graph';
import { ConfigSettingRow } from './lesson-config/config-setting-row';
import {
  type DependencyOption,
  ModuleDependencyPicker,
} from './module-dependency-picker';

/** Board shape → the pure graph shape the predicates take. */
const toDepModule = (m: BoardModule): DepModule => ({
  slug: m.slug,
  name: m.name,
  dependsOn: m.dependsOn,
  lessons: m.lessons.map((l) => ({
    isAvailable: l.isAvailable,
    needsVideoWatch: l.needsVideoWatch,
    hasVideo: l.isConfigured,
  })),
});

const learnerNote = (count: number): string =>
  count === 0
    ? 'No learners have progress here yet.'
    : count === 1
      ? '1 learner has progress here — a new prerequisite locks them out until they finish it.'
      : `${count} learners have progress here — a new prerequisite locks them out until they finish it.`;

/**
 * Dependencies tab: one row per module, each choosing which other modules must
 * be finished first.
 *
 * The whole course is on one screen deliberately. A module's prerequisites only
 * mean anything relative to its siblings, and editing them one module at a time
 * hides the graph being built — which is how a cycle gets in unnoticed.
 *
 * Reads the board through the same query key the editor already populated, so
 * opening this tab costs no extra fetch.
 */
export const ModuleDependenciesContainer = ({
  courseId,
}: {
  courseId: number;
}) => {
  const { data: board, isLoading, error } = useCourseBoard(courseId);
  const updateDependencies = useUpdateModuleDependencies(courseId);

  if (isLoading) {
    return <p className="text-secondary text-sm">Loading modules…</p>;
  }
  if (error) {
    return (
      <p className="text-error-text text-sm">Failed to load this course.</p>
    );
  }

  // The same refusal the board itself reports — this tab reads the board's
  // cache, so it inherits the 403 and must not render it as an empty course.
  if (board === BOARD_FORBIDDEN) {
    return (
      <p className="text-secondary text-sm">
        You are not staff on this course. Ask an admin to assign you.
      </p>
    );
  }

  const modules = board?.modules ?? [];
  if (modules.length < 2) {
    return (
      <p className="text-secondary text-sm">
        {modules.length === 0
          ? 'Add modules to this course before you can sequence them.'
          : 'Add a second module before you can sequence them — a course with one module has nothing to depend on.'}
      </p>
    );
  }

  const graph = modules.map(toDepModule);
  const bySlug = new Map(graph.map((m) => [m.slug, m]));

  return (
    <div className="flex flex-col">
      {modules.map((mod) => {
        const forbidden = cyclicPrerequisites(graph, mod.slug);
        const options: DependencyOption[] = graph
          .filter((candidate) => candidate.slug !== mod.slug)
          .map((candidate) => ({
            slug: candidate.slug,
            name: candidate.name,
            blockedReason: forbidden.has(candidate.slug)
              ? `Would create a loop — ${candidate.name} already requires ${mod.name}.`
              : null,
          }));

        // Slugs with no matching module are orphans left by a deleted module
        // (depends_on has no foreign key). Gating ignores them; rendering them
        // would show a chip for a gate that does not exist.
        const selected = mod.dependsOn.filter((slug) => bySlug.has(slug));

        // The first selected prerequisite that cannot gate anything. One
        // warning per row: listing every inert prerequisite buries the row's
        // own description under caution text.
        const inertWarning = selected
          .map((slug) => bySlug.get(slug))
          .filter((prereq): prereq is DepModule => prereq !== undefined)
          .map(moduleGateWarning)
          .find((warning): warning is string => warning !== null);

        return (
          <ConfigSettingRow
            key={mod.id}
            layout="stacked"
            title={mod.name}
            description={learnerNote(mod.learnerCount)}
            warning={inertWarning}
          >
            <ModuleDependencyPicker
              label={mod.name}
              value={selected}
              options={options}
              // Deliberately never disabled while saving: the write is
              // optimistic and serialized per module, so the chips are already
              // correct, and greying every row because one is in flight would
              // be a locked state with no reason to give the admin.
              onValueChange={(next) =>
                updateDependencies.mutate({
                  moduleId: mod.id,
                  dependsOn: next,
                })
              }
            />
          </ConfigSettingRow>
        );
      })}
    </div>
  );
};
