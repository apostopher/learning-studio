import { describe, expect, it } from 'vitest';
import { nextSectionTapWrite } from '#/data-hooks/use-record-section-tap';

const write = (over: Partial<Parameters<typeof nextSectionTapWrite>[0]> = {}) =>
  nextSectionTapWrite({
    recorded: new Set<string>(),
    section: 'proTips',
    enabled: true,
    ...over,
  });

describe('nextSectionTapWrite', () => {
  it('writes a tracked section the first time it is selected', () => {
    expect(write()).toBe('proTips');
  });

  it('does not write until the material has actually rendered', () => {
    // A tab the learner never saw must not count toward their progress.
    expect(write({ enabled: false })).toBeNull();
  });

  it('does not re-write a section already recorded this visit', () => {
    // Re-selecting a tab is normal; it must not fire a request every time.
    expect(write({ recorded: new Set(['proTips']) })).toBeNull();
  });

  it('never writes the quiz/debrief tab', () => {
    // That slot has its own completion signal in lesson_quiz_answers /
    // lesson_test_results. Counting the tap too would pay a learner twice for
    // one tab, and give partial credit for opening it and bouncing.
    expect(write({ section: 'quiz' })).toBeNull();
  });

  it('never writes the page-visit section', () => {
    // 'page' is server-verified from the material route. If a client call
    // could produce it, the one signal that is not self-reported would become
    // forgeable.
    expect(write({ section: 'page' })).toBeNull();
  });

  it('ignores a section name that is not a real tab', () => {
    // `downloads` existed on the old platform and does not here.
    expect(write({ section: 'downloads' })).toBeNull();
  });
});
