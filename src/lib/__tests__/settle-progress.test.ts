import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCourseProgress: vi.fn(),
  recordLessonCompletions: vi.fn(),
  maybePromote: vi.fn(),
}));

vi.mock('#/db/course-progress', () => ({
  getCourseProgress: mocks.getCourseProgress,
}));
vi.mock('#/db/lesson-completions', () => ({
  recordLessonCompletions: mocks.recordLessonCompletions,
}));
vi.mock('#/lib/promotion.server', () => ({
  maybePromote: mocks.maybePromote,
}));

import { settleProgress } from '#/lib/settle-progress.server';

const lessons = (
  rows: Array<{ lessonId: number; percent: number; done: boolean }>,
) => mocks.getCourseProgress.mockResolvedValue({ lessons: rows });

const opts = { userId: 'u1', courseSlug: 'c' };

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.recordLessonCompletions.mockResolvedValue(undefined);
  mocks.maybePromote.mockResolvedValue(null);
});

describe('settleProgress', () => {
  it('records only lessons at 100 that are not yet done', async () => {
    lessons([
      { lessonId: 1, percent: 100, done: false },
      { lessonId: 2, percent: 100, done: true },
      { lessonId: 3, percent: 60, done: false },
    ]);
    await settleProgress(opts);
    expect(mocks.recordLessonCompletions).toHaveBeenCalledWith('u1', [1]);
  });

  it('never records when nothing new', async () => {
    lessons([
      { lessonId: 2, percent: 100, done: true },
      { lessonId: 3, percent: 60, done: false },
    ]);
    await settleProgress(opts);
    expect(mocks.recordLessonCompletions).not.toHaveBeenCalled();
  });

  it('records before promoting', async () => {
    lessons([{ lessonId: 1, percent: 100, done: false }]);
    await settleProgress(opts);
    expect(mocks.maybePromote).toHaveBeenCalledWith(opts);
    expect(
      mocks.recordLessonCompletions.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.maybePromote.mock.invocationCallOrder[0]);
  });

  it('never deletes or rewrites a completion', async () => {
    lessons([{ lessonId: 2, percent: 60, done: true }]);
    await settleProgress(opts);
    expect(mocks.recordLessonCompletions).not.toHaveBeenCalled();
  });

  it('a recording failure still runs the promotion check and returns its result', async () => {
    const promotion = { id: 1, from: 'basic', to: 'intermediate' };
    lessons([{ lessonId: 1, percent: 100, done: false }]);
    mocks.recordLessonCompletions.mockRejectedValue(new Error('db down'));
    mocks.maybePromote.mockResolvedValue(promotion);
    await expect(settleProgress(opts)).resolves.toBe(promotion);
    expect(mocks.maybePromote).toHaveBeenCalledWith(opts);
  });

  it('a progress read failure still runs the promotion check', async () => {
    mocks.getCourseProgress.mockRejectedValue(new Error('boom'));
    await settleProgress(opts);
    expect(mocks.recordLessonCompletions).not.toHaveBeenCalled();
    expect(mocks.maybePromote).toHaveBeenCalledWith(opts);
  });
});
