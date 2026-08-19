import { describe, expect, it } from 'vitest';
import { debriefSessionForLesson } from '../debrief-session-owner';

const session = (lessonSlug: string) => ({ lessonSlug, questions: [] });

/**
 * The container consumes the RETURN VALUE, not a boolean flag: `test` is what
 * decides whether `DebriefIntro`, `QuestionCard` or `ScoreReport` renders, and
 * whether `isComplete` — the trigger for the auto-save write — can ever be
 * true. Handing back the foreign session under any circumstance is the bug.
 */
describe('debriefSessionForLesson', () => {
  it('withholds a session generated for a different lesson', () => {
    expect(debriefSessionForLesson(session('other'), 'this')).toBeNull();
  });

  it('passes through a session generated for this lesson', () => {
    const mine = session('this');
    expect(debriefSessionForLesson(mine, 'this')).toBe(mine);
  });

  it('answers null when there is no session at all', () => {
    expect(debriefSessionForLesson(null, 'this')).toBeNull();
  });

  it('does not match on a prefix or a near-miss slug', () => {
    // Slugs are compared whole. 'radio-telephony' must not inherit
    // 'radio-telephony-advanced''s session.
    expect(
      debriefSessionForLesson(
        session('radio-telephony-advanced'),
        'radio-telephony',
      ),
    ).toBeNull();
  });
});
