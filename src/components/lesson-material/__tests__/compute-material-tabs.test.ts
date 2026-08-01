import { describe, expect, it } from 'vitest';
import {
  computeMaterialTabs,
  resolveActiveTab,
} from '../compute-material-tabs';

const labels = (args: { hasDebrief: boolean; canDebrief: boolean }) =>
  computeMaterialTabs(args).map((t) => t.label);

describe('computeMaterialTabs', () => {
  it('offers the authored Quiz when the lesson has no debrief', () => {
    expect(labels({ hasDebrief: false, canDebrief: false })).toEqual([
      'Key Points',
      'Quiz',
      'Pro Tips',
      'Links',
      'Assignments',
      'Job of the Day',
    ]);
  });

  it('replaces the Quiz tab with Debrief — never both', () => {
    const tabs = computeMaterialTabs({ hasDebrief: true, canDebrief: true });
    expect(tabs.map((t) => t.label)).toContain('Debrief');
    expect(tabs.map((t) => t.label)).not.toContain('Quiz');
    // One activity slot, so the count matches the no-debrief case exactly.
    expect(tabs).toHaveLength(6);
  });

  it('keeps the value as "quiz" so the post-video overlay still lands', () => {
    // The overlay switches tabs by value (`setActiveTab('quiz')`). A distinct
    // value for the debrief would make that jump silently miss on exactly the
    // lessons the overlay appears on.
    const tabs = computeMaterialTabs({ hasDebrief: true, canDebrief: true });
    expect(tabs.find((t) => t.label === 'Debrief')?.value).toBe('quiz');
  });

  it('drops the activity tab entirely when a debrief is configured but impossible', () => {
    // has_debrief suppresses the quiz unconditionally, and with no key points
    // no debrief can be generated — so there is no second tab at all. This is
    // the accepted dead state; it must render as absent, not as an empty tab.
    const tabs = computeMaterialTabs({ hasDebrief: true, canDebrief: false });
    expect(tabs.map((t) => t.value)).not.toContain('quiz');
    expect(tabs).toHaveLength(5);
  });

  it('suppresses the quiz even when no debrief can replace it', () => {
    // The flag is authoritative: an admin who turns Debrief on hides the
    // authored quiz whether or not the debrief works. The admin note under the
    // toggle is what makes that visible rather than silent.
    expect(labels({ hasDebrief: true, canDebrief: false })).not.toContain(
      'Quiz',
    );
  });
});

describe('resolveActiveTab', () => {
  const tabs = computeMaterialTabs({ hasDebrief: true, canDebrief: true });

  it('keeps a selection that exists', () => {
    expect(resolveActiveTab(tabs, 'proTips')).toBe('proTips');
  });

  it('falls back to Key Points when the selected tab is gone', () => {
    // activeTabAtom is global and is not reset between lessons, so a learner
    // who was on the Debrief tab can land on a lesson that has no tab 2.
    // Without this the panel renders a strip with nothing selected and no
    // body — a blank screen with no explanation.
    const noActivity = computeMaterialTabs({
      hasDebrief: true,
      canDebrief: false,
    });
    expect(resolveActiveTab(noActivity, 'quiz')).toBe('keyPoints');
  });

  it('falls back for a value that was never a tab', () => {
    expect(resolveActiveTab(tabs, 'downloads')).toBe('keyPoints');
  });
});
