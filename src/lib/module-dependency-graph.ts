/**
 * Pure predicates over the module prerequisite graph, shared by the admin
 * picker (which disables cycle-forming options) and the PATCH handler (which
 * rejects them). Both must agree, so this file has no DB, network, or React
 * dependency — the same argument `lesson-gating.ts` makes for itself.
 *
 * Edge direction: `module.dependsOn` holds the slugs of modules that must be
 * finished BEFORE that module opens. Read an edge as "requires".
 */

export type DepLesson = {
  isAvailable: boolean;
  needsVideoWatch: boolean;
  /**
   * Whether the lesson has a `video_id`, NOT whether it has a video at all.
   *
   * `isLessonSatisfied` short-circuits to satisfied on a null `video_id`, and
   * watch progress joins on that column — so a lesson configured through the
   * admin video flow (which writes `video_ref` and `video_provider` only)
   * cannot block, however configured it looks on the board.
   */
  hasVideoId: boolean;
};

export type DepModule = {
  slug: string;
  name: string;
  dependsOn: readonly string[];
  lessons: readonly DepLesson[];
};

/**
 * Every module that transitively requires `slug`, plus `slug` itself.
 *
 * These are exactly the modules that may NOT become prerequisites of `slug`:
 * an edge to any of them closes a loop, and a loop deadlocks both ends
 * permanently — the dependent waits on lessons it is itself gating, so no
 * student action can ever satisfy it.
 *
 * Walks the reversed graph from `slug`, so the module's own outgoing edges
 * never participate: they are the ones being replaced. Dangling slugs match
 * no module and simply contribute no edges.
 */
export function cyclicPrerequisites(
  modules: readonly DepModule[],
  slug: string,
): Set<string> {
  const dependents = new Map<string, string[]>();
  for (const module of modules) {
    for (const prereq of module.dependsOn) {
      const list = dependents.get(prereq);
      if (list) list.push(module.slug);
      else dependents.set(prereq, [module.slug]);
    }
  }

  // `seen` doubles as the cycle guard: rows written before this validation
  // existed can already be cyclic, and the traversal must terminate on them.
  const seen = new Set<string>([slug]);
  const queue = [slug];
  while (queue.length > 0) {
    const current = queue.pop() as string;
    for (const dependent of dependents.get(current) ?? []) {
      if (seen.has(dependent)) continue;
      seen.add(dependent);
      queue.push(dependent);
    }
  }
  return seen;
}

/**
 * Whether replacing `slug`'s prerequisites with `next` would create a cycle.
 *
 * Every proposed edge originates at `slug`, so any new loop passes through it
 * exactly once — checking each candidate against the existing graph is
 * sufficient, and one safe edge never excuses an unsafe one.
 */
export function createsCycle(
  modules: readonly DepModule[],
  slug: string,
  next: readonly string[],
): boolean {
  if (!modules.some((m) => m.slug === slug)) return false;
  const forbidden = cyclicPrerequisites(modules, slug);
  return next.some((candidate) => forbidden.has(candidate));
}

/** Mirrors `isLessonSatisfied`: the conditions under which a lesson can block. */
const canBlock = (lesson: DepLesson): boolean =>
  lesson.isAvailable && lesson.needsVideoWatch && lesson.hasVideoId;

/**
 * Why depending on `prereq` currently gates nothing, or null when it does.
 *
 * Deliberately a warning and not a rejection: wiring the graph before the
 * videos exist is normal mid-authoring, and blocking it would make sequencing
 * unusable during the phase it is most needed. But a permanently inert
 * prerequisite has no other detection path in the system — nothing else will
 * ever tell an admin that a gate they configured does nothing.
 *
 * The two cases are worded apart, as `videoWatchWarning` words its own: one
 * resolves itself as content is added, the other is a live misconfiguration.
 */
export function moduleGateWarning(prereq: DepModule): string | null {
  if (prereq.lessons.length === 0) {
    return `${prereq.name} has no lessons yet, so this prerequisite won’t lock anything until it does.`;
  }
  if (!prereq.lessons.some(canBlock)) {
    return `No lesson in ${prereq.name} has a video that must be watched, so this prerequisite can never block.`;
  }
  return null;
}
