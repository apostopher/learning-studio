import {
  computeDebriefState,
  type DebriefFacts,
  debriefBadge,
} from '#/lib/debrief-schedule';
import { formatDebriefTime } from '#/lib/format-debrief-time';

export type LessonRing = {
  percent: number;
  badge: 'debrief' | 'passed' | null;
  ariaLabel: string;
  /** ISO instant at which this ring's state next changes, if it will. */
  refreshAt: string | null;
};

/**
 * What one lesson's ring shows and says.
 *
 * `includeTime: false` swaps the clock time for "later". The time is formatted
 * in the viewer's timezone, which the server cannot know, and the sidebar is
 * server-rendered: the container passes `false` until the client has mounted
 * so the first client render matches the server HTML byte for byte.
 */
export function computeLessonRing(a: {
  lessonName: string;
  percent: number;
  debrief: DebriefFacts & { bearing: boolean };
  now: Date;
  includeTime?: boolean;
  timeZone?: string;
}): LessonRing {
  const includeTime = a.includeTime ?? true;
  if (!a.debrief.bearing) {
    return {
      percent: a.percent,
      badge: null,
      ariaLabel: `Lesson ${a.lessonName}, ${a.percent}% complete`,
      refreshAt: null,
    };
  }

  const state = computeDebriefState(a.debrief, a.now);
  const badge = debriefBadge(state);
  const percent = badge === 'passed' ? 100 : a.percent;
  const lead = `Lesson ${a.lessonName}, ${percent}% complete`;
  const when = (availableAt: string) =>
    includeTime ? formatDebriefTime(availableAt, a.now, a.timeZone) : 'later';

  switch (state.kind) {
    case 'passed':
      return {
        percent,
        badge,
        ariaLabel: `${lead}, debrief passed`,
        refreshAt: null,
      };
    case 'open':
      return {
        percent,
        badge,
        ariaLabel: `${lead}, debrief ready`,
        refreshAt: null,
      };
    case 'retake-waiting':
      return {
        percent,
        badge,
        ariaLabel: `${lead}, debrief reopens ${when(state.availableAt)}`,
        refreshAt: state.availableAt,
      };
    // No D yet, but the wait still states its reason: the debrief has not
    // opened, and when it will.
    case 'waiting':
      return {
        percent,
        badge,
        ariaLabel: `${lead}, debrief opens ${when(state.availableAt)}`,
        refreshAt: state.availableAt,
      };
    case 'not-done':
      return { percent, badge, ariaLabel: lead, refreshAt: null };
  }
}
