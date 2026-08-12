export type MaterialTabValue =
  | 'keyPoints'
  | 'quiz'
  | 'proTips'
  | 'links'
  | 'assignments'
  | 'jobOfTheDay';

export type MaterialTab = { value: MaterialTabValue; label: string };

export type ComputeMaterialTabsArgs = {
  /** `lessons.has_debrief` — decides which activity tab 2 is. */
  hasDebrief: boolean;
  /**
   * Whether a debrief could actually be generated. Body text is enough — the
   * server derives key points from it when none were authored, and falls back
   * to the video transcript when there is no material at all (see
   * `resolveDebriefSource`).
   */
  canDebrief: boolean;
};

/**
 * The material panel's tabs.
 *
 * Tab 2 is Quiz XOR Debrief, decided by `hasDebrief` alone — when it is on,
 * the authored quiz is never offered, even if no debrief can be generated. The
 * flag is authoritative so its meaning does not depend on how complete a
 * lesson's material happens to be; the cost of hiding an authored quiz is
 * surfaced to admins under the Debrief toggle instead of handled silently
 * here.
 *
 * The VALUE stays `'quiz'` in both cases and only the label changes. The
 * post-video overlay switches to this tab by value (`setActiveTab('quiz')`),
 * and a second value would mean that jump silently missing whenever a lesson
 * happened to be configured the other way.
 *
 * Extracted as a pure function because `LessonMaterialView` cannot be rendered
 * under Vitest — react-compiler nulls the dispatcher for this repo's
 * hook-calling components — and this branching is where the expensive mistakes
 * live: offering a quiz that should be hidden, or an empty tab that can never
 * fill.
 */
export function computeMaterialTabs({
  hasDebrief,
  canDebrief,
}: ComputeMaterialTabsArgs): MaterialTab[] {
  const activity: MaterialTab[] = hasDebrief
    ? // No generator input means no debrief is possible, and the quiz is
      // suppressed anyway — so there is no tab 2 at all. Rendering an empty
      // one would be a tab that can never do anything.
      canDebrief
      ? [{ value: 'quiz', label: 'Debrief' }]
      : []
    : [{ value: 'quiz', label: 'Quiz' }];

  return [
    { value: 'keyPoints', label: 'Key Points' },
    ...activity,
    { value: 'proTips', label: 'Pro Tips' },
    { value: 'links', label: 'Links' },
    { value: 'assignments', label: 'Assignments' },
    { value: 'jobOfTheDay', label: 'Job of the Day' },
  ];
}

/**
 * The tab to actually show, given what the learner last selected.
 *
 * `activeTabAtom` is global rather than per-lesson and is not reset between
 * lessons, so a learner who was on the Debrief tab can land on a lesson that
 * has no tab 2. Without this the panel would render a tab strip with nothing
 * selected and no panel body — a blank screen with no explanation.
 */
export function resolveActiveTab(
  tabs: readonly MaterialTab[],
  activeTab: string,
): MaterialTabValue {
  const match = tabs.find((tab) => tab.value === activeTab);
  return match ? match.value : 'keyPoints';
}
