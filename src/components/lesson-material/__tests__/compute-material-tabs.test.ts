import { describe, expect, it } from 'vitest';
import {
  computeMaterialTabs,
  defaultMaterialTab,
  resolveActiveTab,
} from '../compute-material-tabs';

/** A lesson with body text, so the Debrief tab hinges on `on` alone. */
const debriefOn = (on: boolean) => ({
  hasDebrief: on,
  materialText: 'body',
  transcriptUsable: false,
  readOnly: false,
});

const values = ({
  hasQuiz,
  hasDebriefTab,
}: {
  hasQuiz: boolean;
  hasDebriefTab: boolean;
}) =>
  computeMaterialTabs({
    extraTab: 'jobOfTheDay',
    courseSlug: '3d-airmanship',
    hasQuiz,
    debrief: debriefOn(hasDebriefTab),
  }).map((t) => t.value);

describe('computeMaterialTabs', () => {
  it('offers Quiz AND Debrief, in that order, when the lesson has both', () => {
    // The spec's tab order (design "Tabs", call 7). Quiz and Debrief used to
    // be mutually exclusive (ledger D21, superseded).
    const tabs = computeMaterialTabs({
      hasQuiz: true,
      debrief: debriefOn(true),
      extraTab: 'jobOfTheDay',
      courseSlug: '3d-airmanship',
    });
    expect(tabs).toEqual([
      { value: 'keyPoints', label: 'Key Points' },
      { value: 'quiz', label: 'Quiz' },
      { value: 'debrief', label: 'Debrief' },
      { value: 'proTips', label: 'Pro Tips' },
      { value: 'links', label: 'Links' },
      { value: 'assignments', label: 'Assignments' },
      { value: 'jobOfTheDay', label: 'Job of the Day' },
    ]);
  });

  it('has no Quiz tab when the lesson has no authored questions', () => {
    expect(values({ hasQuiz: false, hasDebriefTab: true })).toEqual([
      'keyPoints',
      'debrief',
      'proTips',
      'links',
      'assignments',
      'jobOfTheDay',
    ]);
  });

  it('has no Debrief tab when the lesson cannot offer one', () => {
    expect(values({ hasQuiz: true, hasDebriefTab: false })).toEqual([
      'keyPoints',
      'quiz',
      'proTips',
      'links',
      'assignments',
      'jobOfTheDay',
    ]);
  });

  it('has neither when there is no quiz and no debrief', () => {
    expect(values({ hasQuiz: false, hasDebriefTab: false })).toEqual([
      'keyPoints',
      'proTips',
      'links',
      'assignments',
      'jobOfTheDay',
    ]);
  });
});

describe('computeMaterialTabs — closing tab', () => {
  it('closes a 3D Airmanship lesson with Job of the Day, and no TEST THIS!', () => {
    const tabs = computeMaterialTabs({
      hasQuiz: true,
      debrief: debriefOn(false),
      extraTab: 'jobOfTheDay',
      courseSlug: '3d-airmanship',
    });
    expect(tabs.at(-1)).toEqual({
      value: 'jobOfTheDay',
      label: 'Job of the Day',
    });
    expect(tabs.map((t) => t.value)).not.toContain('testThis');
  });

  it('closes every other lesson with TEST THIS!, and no Job of the Day', () => {
    const tabs = computeMaterialTabs({
      hasQuiz: true,
      debrief: debriefOn(false),
      extraTab: 'testThis',
      courseSlug: 'uas-16-week-course',
    });
    expect(tabs.at(-1)).toEqual({ value: 'testThis', label: 'TEST THIS!' });
    expect(tabs.map((t) => t.value)).not.toContain('jobOfTheDay');
    // One closing slot either way, so the strip is the same length.
    expect(tabs).toHaveLength(6);
  });

  it('labels a 3D Airmanship lesson TEST THIS! inside a UAS course', () => {
    // The lesson is remixed into every course; the LABEL follows the course,
    // the content (and the progress key) stays the lesson's.
    const tabs = computeMaterialTabs({
      hasQuiz: true,
      debrief: debriefOn(false),
      extraTab: 'jobOfTheDay',
      courseSlug: 'uas-16-week-course',
    });
    expect(tabs.at(-1)).toEqual({ value: 'jobOfTheDay', label: 'TEST THIS!' });
  });

  it('labels the closing tab Job of the Day inside the 3D Airmanship course, whatever the lesson', () => {
    const tabs = computeMaterialTabs({
      hasQuiz: true,
      debrief: debriefOn(false),
      extraTab: 'testThis',
      courseSlug: '3d-airmanship',
    });
    expect(tabs.at(-1)).toEqual({ value: 'testThis', label: 'Job of the Day' });
  });

  it('falls back to Key Points when the remembered tab is the other closing tab', () => {
    // `activeTabAtom` is global, so a learner who left a 3D lesson on Job of
    // the Day lands on a UAS lesson with that tab still remembered.
    const tabs = computeMaterialTabs({
      hasQuiz: true,
      debrief: debriefOn(false),
      extraTab: 'testThis',
      courseSlug: 'uas-16-week-course',
    });
    expect(
      resolveActiveTab(
        tabs,
        { lessonSlug: 'l1', tab: 'jobOfTheDay' },
        'l1',
        'keyPoints',
      ),
    ).toBe('keyPoints');
  });
});

describe('resolveActiveTab', () => {
  const tabs = computeMaterialTabs({
    hasQuiz: true,
    debrief: debriefOn(true),
    extraTab: 'jobOfTheDay',
    courseSlug: '3d-airmanship',
  });
  const on = (lessonSlug: string, tab: string) => ({ lessonSlug, tab });

  it("keeps the pilot's selection on the lesson they made it on", () => {
    expect(resolveActiveTab(tabs, on('l1', 'proTips'), 'l1', 'debrief')).toBe(
      'proTips',
    );
    expect(resolveActiveTab(tabs, on('l1', 'debrief'), 'l1', 'keyPoints')).toBe(
      'debrief',
    );
  });

  it("opens a different lesson on that lesson's default, not the last lesson's tab", () => {
    expect(resolveActiveTab(tabs, on('l1', 'links'), 'l2', 'debrief')).toBe(
      'debrief',
    );
    expect(resolveActiveTab(tabs, on('l1', 'links'), 'l2', 'keyPoints')).toBe(
      'keyPoints',
    );
  });

  it('opens on the default before anything is selected', () => {
    expect(resolveActiveTab(tabs, null, 'l1', 'debrief')).toBe('debrief');
  });

  it('falls back to Key Points when the selected tab is gone', () => {
    // A tab can vanish under a selection (an admin switches the debrief off).
    // Without this the panel renders a strip with nothing selected and no
    // body — a blank screen with no explanation.
    const noDebrief = computeMaterialTabs({
      hasQuiz: true,
      debrief: debriefOn(false),
      extraTab: 'jobOfTheDay',
      courseSlug: '3d-airmanship',
    });
    expect(
      resolveActiveTab(noDebrief, on('l1', 'debrief'), 'l1', 'keyPoints'),
    ).toBe('keyPoints');
  });

  it('falls back for a value that was never a tab', () => {
    expect(
      resolveActiveTab(tabs, on('l1', 'downloads'), 'l1', 'keyPoints'),
    ).toBe('keyPoints');
  });
});

describe('defaultMaterialTab', () => {
  const now = new Date('2026-11-09T12:00:00Z');
  const withDebrief = computeMaterialTabs({
    hasQuiz: true,
    debrief: debriefOn(true),
    extraTab: 'jobOfTheDay',
    courseSlug: '3d-airmanship',
  });
  const facts = (over: Record<string, unknown> = {}) => ({
    clockStartAt: '2026-11-08T00:00:00Z', // well past the 12h wait
    passed: false,
    lastFailedAt: null,
    hasVideo: false,
    rewatchedAt: null,
    bearing: true,
    ...over,
  });

  it('opens on Debrief when the debrief is ready (the sidebar shows D)', () => {
    expect(defaultMaterialTab(withDebrief, facts(), now)).toBe('debrief');
  });

  it('opens on Debrief while a retake is pending (still D)', () => {
    expect(
      defaultMaterialTab(
        withDebrief,
        facts({ lastFailedAt: '2026-11-09T11:00:00Z' }),
        now,
      ),
    ).toBe('debrief');
  });

  it.each([
    ['not started', facts({ clockStartAt: null })],
    ['still in the wait', facts({ clockStartAt: '2026-11-09T11:00:00Z' })],
    ['passed', facts({ passed: true })],
    ['not debrief-bearing', facts({ bearing: false })],
  ])('opens on Key Points when the debrief is %s', (_why, debrief) => {
    expect(defaultMaterialTab(withDebrief, debrief, now)).toBe('keyPoints');
  });

  it('opens on Key Points while progress is still loading', () => {
    expect(defaultMaterialTab(withDebrief, undefined, now)).toBe('keyPoints');
  });

  it('opens on Key Points when the lesson offers no Debrief tab', () => {
    const noDebrief = computeMaterialTabs({
      hasQuiz: true,
      debrief: debriefOn(false),
      extraTab: 'jobOfTheDay',
      courseSlug: '3d-airmanship',
    });
    expect(defaultMaterialTab(noDebrief, facts(), now)).toBe('keyPoints');
  });
});

describe('computeMaterialTabs — Debrief tab source (call 11)', () => {
  const has = (debrief: Parameters<typeof computeMaterialTabs>[0]['debrief']) =>
    computeMaterialTabs({
      hasQuiz: false,
      debrief,
      extraTab: 'testThis',
      courseSlug: 'uas-16-week-course',
    }).some((t) => t.value === 'debrief');

  it('offers the tab on an empty-bodied material row when the video has captions', () => {
    // The defect: this lesson was prepared from its transcript and counted
    // debrief-bearing, but had no tab — so it could never reach 100%.
    expect(
      has({
        hasDebrief: true,
        materialText: '',
        transcriptUsable: true,
        readOnly: false,
      }),
    ).toBe(true);
  });

  it('offers no tab with neither body text nor captions', () => {
    expect(
      has({
        hasDebrief: true,
        materialText: null,
        transcriptUsable: false,
        readOnly: false,
      }),
    ).toBe(false);
  });

  it('offers no tab on a read-only lesson', () => {
    expect(
      has({
        hasDebrief: true,
        materialText: 'body',
        transcriptUsable: true,
        readOnly: true,
      }),
    ).toBe(false);
  });
});
