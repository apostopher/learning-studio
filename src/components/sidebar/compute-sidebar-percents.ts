import { coursePercent as computeCoursePercent } from '#/lib/course-progress-agg';
import type { DebriefFacts } from '#/lib/debrief-schedule';
import { computeLessonRing, type LessonRing } from './compute-lesson-ring';

type DetailsLike = {
  modules: readonly {
    id: number;
    lessons: readonly { id: number; slug: string; name?: string }[];
  }[];
};

type ProgressLike = {
  lessons: readonly {
    lessonId: number;
    ringPercent: number;
    debrief: DebriefFacts & { bearing: boolean };
  }[];
};

const NO_DEBRIEF: DebriefFacts & { bearing: boolean } = {
  clockStartAt: null,
  passed: false,
  lastFinishedAt: null,
  hasOpenAttempt: false,
  mastery: null,
  bearing: false,
};

/**
 * Lesson, module and course percentages plus the per-lesson rings, over the
 * VISIBLE lessons only — `getCourseProgress` is not level-aware, so the
 * server's own module and course numbers would count lessons this pilot
 * cannot see.
 *
 * Every ring reads the lesson's staged `ringPercent` (video 50, quiz 75,
 * passed debrief 100). Module percent is the rounded mean of its lessons'
 * rings, and the course percent is `coursePercent` over the same rings. A
 * lesson with no progress row has done nothing: 0, with no debrief.
 */
export function computeSidebarPercents(
  details: DetailsLike | null | undefined,
  progress: ProgressLike | null | undefined,
  now: Date,
  opts: { includeTime?: boolean; timeZone?: string } = {},
): {
  lessonPercents: Record<string, number>;
  modulePercents: Record<number, number>;
  coursePercent: number;
  lessonRings: Record<string, LessonRing>;
} {
  const lessonPercents: Record<string, number> = {};
  const modulePercents: Record<number, number> = {};
  const lessonRings: Record<string, LessonRing> = {};
  if (!details || !progress) {
    return { lessonPercents, modulePercents, coursePercent: 0, lessonRings };
  }

  const byId = new Map(progress.lessons.map((l) => [l.lessonId, l]));
  const visible: { ringPercent: number }[] = [];

  for (const mod of details.modules) {
    let sum = 0;
    for (const lesson of mod.lessons) {
      const row = byId.get(lesson.id);
      const percent = row?.ringPercent ?? 0;
      const debrief = row?.debrief ?? NO_DEBRIEF;
      lessonPercents[lesson.slug] = percent;
      lessonRings[lesson.slug] = computeLessonRing({
        lessonName: lesson.name ?? lesson.slug,
        percent,
        debrief,
        now,
        includeTime: opts.includeTime,
        timeZone: opts.timeZone,
      });
      visible.push({ ringPercent: percent });
      sum += percent;
    }
    modulePercents[mod.id] =
      mod.lessons.length === 0 ? 0 : Math.round(sum / mod.lessons.length);
  }

  return {
    lessonPercents,
    modulePercents,
    coursePercent: computeCoursePercent(visible),
    lessonRings,
  };
}

/** The soonest `refreshAt` across the rings, or null when nothing will change. */
export function earliestRefreshAt(
  rings: Record<string, LessonRing>,
): string | null {
  let best: string | null = null;
  for (const ring of Object.values(rings)) {
    if (ring.refreshAt === null) continue;
    if (best === null || Date.parse(ring.refreshAt) < Date.parse(best)) {
      best = ring.refreshAt;
    }
  }
  return best;
}
