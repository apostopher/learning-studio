/**
 * Pure half of the lesson-completions backfill (the runner is
 * `backfill-lesson-completions-run.ts`). No imports from the db, so tests can
 * load it.
 *
 * A pilot who finished a lesson before `lesson_completions` existed has no
 * row, so the next lesson would stay locked and the debrief clock would never
 * start. The row's `done_at` is the moment the lesson's LAST required
 * component was finished, which is what these functions work out.
 */

export type CompletionParts = {
  videoWatchedAt: Date | null;
  sectionTappedAt: readonly Date[];
  quizFirstAt: Date | null;
  visitedAt: Date | null;
};

/** Latest of the non-null parts; null when there are none. */
export function completionTimestamp(parts: CompletionParts): Date | null {
  const all = [
    parts.videoWatchedAt,
    ...parts.sectionTappedAt,
    parts.quizFirstAt,
    parts.visitedAt,
  ].filter((d): d is Date => d !== null);
  if (all.length === 0) return null;
  return all.reduce((a, b) => (b.getTime() > a.getTime() ? b : a));
}

/**
 * When the video became "watched": the moment the LAST required milestone was
 * first reported (each milestone's earliest row, then the latest of those).
 * Null while any required milestone has never been hit.
 */
export function videoWatchedAt(
  firstHitByMilestone: ReadonlyMap<number, Date>,
  requiredMilestones: readonly number[],
): Date | null {
  const hits: Date[] = [];
  for (const m of requiredMilestones) {
    const at = firstHitByMilestone.get(m);
    if (!at) return null;
    hits.push(at);
  }
  return completionTimestamp({
    videoWatchedAt: null,
    sectionTappedAt: hits,
    quizFirstAt: null,
    visitedAt: null,
  });
}

/** Which parts a lesson asks of the learner (mirrors `lessonOutstanding`). */
export type LessonNeeds = {
  video: boolean;
  /** Number of applicable material tabs. */
  sections: number;
  quiz: boolean;
  /** The page visit counts only when nothing else applies. */
  visit: boolean;
};

/**
 * `done_at` for one lesson: the latest timestamp among the parts it NEEDS.
 * Null (not a guess) when any needed part has no timestamp, so the caller can
 * report the lesson instead of writing a wrong time.
 */
export function resolveDoneAt(
  needs: LessonNeeds,
  facts: CompletionParts,
): Date | null {
  if (needs.video && !facts.videoWatchedAt) return null;
  if (needs.quiz && !facts.quizFirstAt) return null;
  if (needs.visit && !facts.visitedAt) return null;
  if (needs.sections > 0 && facts.sectionTappedAt.length < needs.sections) {
    return null;
  }
  return completionTimestamp({
    videoWatchedAt: needs.video ? facts.videoWatchedAt : null,
    sectionTappedAt: needs.sections > 0 ? facts.sectionTappedAt : [],
    quizFirstAt: needs.quiz ? facts.quizFirstAt : null,
    visitedAt: needs.visit ? facts.visitedAt : null,
  });
}
