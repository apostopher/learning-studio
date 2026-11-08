import { canOfferDebrief, type DebriefOfferArgs } from '#/lib/debrief-offer';
import {
  computeDebriefState,
  type DebriefFacts,
  debriefBadge,
} from '#/lib/debrief-schedule';
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
   * What decides the Debrief tab: the shared `canOfferDebrief` rule (body
   * text, or failing that a usable caption transcript — the generator's own
   * order, so an empty-bodied material row on a captioned video still gets the
   * tab), and not a read-only archive view (call 12: no debrief clock there).
   */
  debrief: DebriefOfferArgs & { readOnly: boolean };
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
 * opens 12h after the video is watched, and the quiz is part of being done,
 * so hiding one behind the other would make the lesson impossible to finish.
 * Debrief gets its own value; reusing `'quiz'` only existed for the
 * post-video button's tab jump, which is gone.
 *
 * Extracted as a pure function because `LessonMaterialView` cannot be rendered
 * under Vitest — react-compiler nulls the dispatcher for this repo's
 * hook-calling components.
 */
export function computeMaterialTabs({
  hasQuiz,
  debrief,
  extraTab,
}: ComputeMaterialTabsArgs): MaterialTab[] {
  const hasDebriefTab = !debrief.readOnly && canOfferDebrief(debrief);
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

/** One lesson's debrief facts, as the course progress summary carries them. */
export type DebriefTabFacts = DebriefFacts & { bearing: boolean };

/** What the pilot last selected, and on which lesson (`activeTabAtom`). */
export type ChosenTab = { lessonSlug: string; tab: string };

/**
 * The tab a lesson opens on: Debrief when the debrief is waiting for the pilot
 * (the sidebar ring shows D — ready, or a retake pending), otherwise Key
 * Points. `debrief` is this lesson's entry from the course progress summary;
 * undefined while it loads.
 */
export function defaultMaterialTab(
  tabs: readonly MaterialTab[],
  debrief: DebriefTabFacts | undefined,
  now: Date,
): MaterialTabValue {
  const offersDebrief = tabs.some((tab) => tab.value === 'debrief');
  if (
    offersDebrief &&
    debrief?.bearing &&
    debriefBadge(computeDebriefState(debrief, now)) === 'debrief'
  ) {
    return 'debrief';
  }
  return 'keyPoints';
}

/**
 * The tab to actually show.
 *
 * A selection belongs to the lesson it was made on: arriving at another
 * lesson opens that lesson's own default (`defaultMaterialTab`), so a lesson
 * with a debrief waiting opens on it. A selection naming a tab this lesson
 * does not have falls back to Key Points — otherwise the panel would render a
 * tab strip with nothing selected and no body, a blank screen with no
 * explanation.
 */
export function resolveActiveTab(
  tabs: readonly MaterialTab[],
  chosen: ChosenTab | null,
  lessonSlug: string,
  defaultTab: MaterialTabValue,
): MaterialTabValue {
  if (chosen?.lessonSlug !== lessonSlug) return defaultTab;
  const match = tabs.find((tab) => tab.value === chosen.tab);
  return match ? match.value : 'keyPoints';
}
