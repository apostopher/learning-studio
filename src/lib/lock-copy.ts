import type { OutstandingItem } from '#/lib/course-progress-agg';
import type { LessonLock } from '#/lib/lesson-gating';
import type { TrackedLessonSection } from '#/lib/lesson-visit-section';

/**
 * Tab labels, as the pilot sees them. The single source: both the lock
 * sentences and `compute-material-tabs.ts` read this object.
 */
export const SECTION_LABELS: Record<TrackedLessonSection, string> = {
  keyPoints: 'Key Points',
  proTips: 'Pro Tips',
  links: 'Links',
  assignments: 'Assignments',
  jobOfTheDay: 'Job of the Day',
  testThis: 'TEST THIS!',
};

/** "a", "a and b", "a, b and c". */
function joinAnd(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * What a pilot has to do, as a lowercase clause: "watch the video, take the
 * quiz, and open Links and Assignments". Sections fold into one "open" clause.
 */
export function describeOutstanding(items: readonly OutstandingItem[]): string {
  const actions: string[] = [];
  const sections: string[] = [];
  for (const item of items) {
    if (item.kind === 'video') actions.push('watch the video');
    else if (item.kind === 'quiz') actions.push('take the quiz');
    else if (item.kind === 'visit') actions.push('open the lesson');
    else sections.push(SECTION_LABELS[item.section]);
  }
  if (sections.length > 0) actions.push(`open ${joinAnd(sections)}`);

  if (actions.length <= 2) return joinAnd(actions);
  return `${actions.slice(0, -1).join(', ')}, and ${actions[actions.length - 1]}`;
}

/** One sentence: why the pilot is locked out and exactly what unlocks it. */
export function lessonLockSentence(
  lock: Exclude<LessonLock, { kind: 'open' }>,
): string {
  if (lock.kind === 'lesson-locked') {
    const todo = describeOutstanding(lock.outstanding);
    return todo
      ? `Finish ${lock.lessonName} first: ${todo}.`
      : `Finish ${lock.lessonName} first.`;
  }
  const left = `${lock.lessonsLeft} ${lock.lessonsLeft === 1 ? 'lesson' : 'lessons'} left`;
  const todo = describeOutstanding(lock.next.outstanding);
  const next = todo
    ? `${lock.next.lessonName} — ${todo}`
    : lock.next.lessonName;
  return `Finish the ${lock.moduleName} module first: ${left}. Next: ${next}.`;
}
