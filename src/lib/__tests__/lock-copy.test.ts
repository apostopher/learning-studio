import { describe, expect, it } from 'vitest';
import type { OutstandingItem } from '#/lib/course-progress-agg';
import type { LessonLock } from '#/lib/lesson-gating';
import { describeOutstanding, lessonLockSentence } from '#/lib/lock-copy';

const video: OutstandingItem = { kind: 'video' };
const quiz: OutstandingItem = { kind: 'quiz' };
const visit: OutstandingItem = { kind: 'visit' };
const sec = (
  section: Extract<OutstandingItem, { kind: 'section' }>['section'],
): OutstandingItem => ({ kind: 'section', section });

describe('describeOutstanding', () => {
  it('joins actions and folds sections into one clause', () => {
    expect(
      describeOutstanding([video, quiz, sec('links'), sec('assignments')]),
    ).toBe('watch the video, take the quiz, and open Links and Assignments');
  });
  it('handles one, two and section-only lists', () => {
    expect(describeOutstanding([quiz])).toBe('take the quiz');
    expect(describeOutstanding([video, quiz])).toBe(
      'watch the video and take the quiz',
    );
    expect(describeOutstanding([sec('links')])).toBe('open Links');
    expect(
      describeOutstanding([sec('keyPoints'), sec('links'), sec('assignments')]),
    ).toBe('open Key Points, Links and Assignments');
    expect(describeOutstanding([visit])).toBe('open the lesson');
  });
  it('labels every section', () => {
    expect(describeOutstanding([sec('proTips')])).toBe('open Pro Tips');
    expect(describeOutstanding([sec('testThis')])).toBe('open TEST THIS!');
  });
});

describe('lessonLockSentence', () => {
  const lessonLock = (
    outstanding: OutstandingItem[],
  ): Extract<LessonLock, { kind: 'lesson-locked' }> => ({
    kind: 'lesson-locked',
    lessonSlug: 'l4',
    moduleSlug: 'm',
    lessonName: 'Lesson 4',
    outstanding,
  });
  const moduleLock = (
    lessonsLeft: number,
  ): Extract<LessonLock, { kind: 'module-locked' }> => ({
    kind: 'module-locked',
    moduleSlug: 'b',
    moduleName: 'Basics',
    lessonsLeft,
    next: { lessonName: 'Lesson 4', outstanding: [quiz] },
  });
  it('names the lesson and what is left', () => {
    expect(lessonLockSentence(lessonLock([quiz, sec('links')]))).toBe(
      'Finish Lesson 4 first: take the quiz and open Links.',
    );
  });
  it('falls back when nothing is outstanding', () => {
    expect(lessonLockSentence(lessonLock([]))).toBe('Finish Lesson 4 first.');
  });
  it('names the module, count and next lesson', () => {
    expect(lessonLockSentence(moduleLock(3))).toBe(
      'Finish the Basics module first: 3 lessons left. Next: Lesson 4 — take the quiz.',
    );
    expect(lessonLockSentence(moduleLock(1))).toBe(
      'Finish the Basics module first: 1 lesson left. Next: Lesson 4 — take the quiz.',
    );
  });
});
