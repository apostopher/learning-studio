import type { MaterialExtraTab } from '#/lib/flagship-course';
import { SECTION_LABELS } from '#/lib/lock-copy';

export type MaterialTabValue =
  | 'keyPoints'
  | 'quiz'
  | 'debrief'
  | 'proTips'
  | 'links'
  | 'assignments'
  | 'jobOfTheDay'
  | 'testThis';

export type MaterialTab = { value: MaterialTabValue; label: string };

export type ComputeMaterialTabsArgs = {
  /** The lesson has authored quiz questions. */
  hasQuiz: boolean;
  /**
   * The lesson offers a debrief to this pilot: `has_debrief` is on, the
   * server can generate one (body text is enough — see
   * `resolveDebriefSource`), and the lesson is not a read-only archive view
   * (call 12: no debrief clock there).
   */
  hasDebriefTab: boolean;
  /**
   * The closing tab — Job of the Day on 3D Airmanship lessons, TEST THIS! on
   * every other (see `materialExtraTabFor`). Never both.
   */
  extraTab: MaterialExtraTab;
};

/**
 * The material panel's tabs, in the spaced-review design's order: Key Points,
 * Quiz, Debrief, Pro Tips, Links, Assignments, then the closing tab.
 *
 * Quiz and Debrief are independent. They used to be mutually exclusive (one
 * `'quiz'` slot whose label flipped — ledger D21, superseded): the debrief now
 * opens 24h after the lesson is done, and the quiz is part of being done, so
 * hiding one behind the other would make the lesson impossible to finish.
 * Debrief gets its own value; reusing `'quiz'` only existed for the
 * post-video button's tab jump, which is gone.
 *
 * Extracted as a pure function because `LessonMaterialView` cannot be rendered
 * under Vitest — react-compiler nulls the dispatcher for this repo's
 * hook-calling components.
 */
export function computeMaterialTabs({
  hasQuiz,
  hasDebriefTab,
  extraTab,
}: ComputeMaterialTabsArgs): MaterialTab[] {
  return [
    { value: 'keyPoints', label: SECTION_LABELS.keyPoints },
    ...(hasQuiz ? [{ value: 'quiz', label: 'Quiz' } as const] : []),
    ...(hasDebriefTab ? [{ value: 'debrief', label: 'Debrief' } as const] : []),
    { value: 'proTips', label: SECTION_LABELS.proTips },
    { value: 'links', label: SECTION_LABELS.links },
    { value: 'assignments', label: SECTION_LABELS.assignments },
    extraTab === 'jobOfTheDay'
      ? { value: 'jobOfTheDay', label: SECTION_LABELS.jobOfTheDay }
      : { value: 'testThis', label: SECTION_LABELS.testThis },
  ];
}

/**
 * The tab to actually show, given what the learner last selected.
 *
 * `activeTabAtom` is global rather than per-lesson and is not reset between
 * lessons, so a learner who was on the Debrief tab can land on a lesson that
 * has none. Without this the panel would render a tab strip with nothing
 * selected and no panel body — a blank screen with no explanation.
 */
export function resolveActiveTab(
  tabs: readonly MaterialTab[],
  activeTab: string,
): MaterialTabValue {
  const match = tabs.find((tab) => tab.value === activeTab);
  return match ? match.value : 'keyPoints';
}
