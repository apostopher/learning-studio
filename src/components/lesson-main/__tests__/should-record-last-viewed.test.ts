import { describe, expect, it } from 'vitest';
import { shouldRecordLastViewed } from '#/components/lesson-main/should-record-last-viewed';
import type { LessonMainState } from '#/components/lesson-main/types';

const noop = () => {};

const states: Record<LessonMainState['kind'], LessonMainState> = {
  'course-loading': { kind: 'course-loading' },
  'course-error': { kind: 'course-error', message: 'x', onRetry: noop },
  'not-found': { kind: 'not-found', lessonSlug: 'l1' },
  'no-video': {
    kind: 'no-video',
    lessonName: 'L1',
    lessonSlug: 'l-1',
    courseSlug: 'c-1',
    hasDebrief: false,
    videoExpected: false,
  },
  locked: {
    kind: 'locked',
    lessonName: 'L1',
    courseSlug: 'c',
    lock: {
      locked: true,
      reason: 'lesson',
      blockedBy: { lessonSlug: 'l0', moduleSlug: 'm1', lessonName: 'L0' },
    },
  },
  ready: {
    kind: 'ready',
    lessonName: 'L1',
    lessonSlug: 'l1',
    courseSlug: 'c',
    hasDebrief: false,
    videoState: { status: 'fetching' },
  },
};

describe('shouldRecordLastViewed', () => {
  it('records for a lesson rendering its player', () => {
    expect(shouldRecordLastViewed(states.ready)).toBe(true);
  });

  it('records for a lesson with material but no video', () => {
    expect(shouldRecordLastViewed(states['no-video'])).toBe(true);
  });

  it('does not record a lock screen', () => {
    expect(shouldRecordLastViewed(states.locked)).toBe(false);
  });

  it.each([
    'course-loading',
    'course-error',
    'not-found',
  ] as const)('does not record while %s', (kind) => {
    expect(shouldRecordLastViewed(states[kind])).toBe(false);
  });

  it('covers every state kind, so a new one cannot silently default to recording', () => {
    // If LessonMainState gains a kind, `states` fails to type-check above and
    // this file breaks — forcing a deliberate decision rather than letting the
    // new state inherit whichever branch the boolean happens to fall into.
    expect(Object.keys(states)).toHaveLength(6);
  });
});
