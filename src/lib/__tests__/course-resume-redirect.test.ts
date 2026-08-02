import type { QueryClient } from '@tanstack/react-query';
import { isRedirect } from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';
import type { ResumeTarget } from '#/lib/course-resume';
import { resumeCourseOrExplain } from '#/lib/course-resume-redirect';

const call = (resume: ResumeTarget, courseSlug = 'itps-uas-remote') =>
  resumeCourseOrExplain({
    queryClient: {
      ensureQueryData: vi.fn().mockResolvedValue(resume),
    } as unknown as QueryClient,
    courseSlug,
  });

/**
 * `redirect()` returns a `Response` subclass with the navigation options on an
 * `options` own-property — not a plain object. Asserting on the Response
 * itself silently matches nothing.
 */
const optionsOfThrown = async (promise: Promise<unknown>) => {
  const thrown = await promise.then(
    () => null,
    (e) => e,
  );
  expect(isRedirect(thrown)).toBe(true);
  return (thrown as { options: Record<string, unknown> }).options;
};

const LESSON: ResumeTarget = {
  kind: 'lesson',
  moduleSlug: 'wakeup-call',
  lessonSlug: 'rules-of-the-air',
};

describe('resumeCourseOrExplain', () => {
  it('redirects to the lesson the learner was last on', async () => {
    expect(await optionsOfThrown(call(LESSON))).toMatchObject({
      to: '/course/$courseSlug/modules/$moduleSlug/lessons/$lessonSlug',
      params: {
        courseSlug: 'itps-uas-remote',
        moduleSlug: 'wakeup-call',
        lessonSlug: 'rules-of-the-air',
      },
    });
  });

  /**
   * Without `replace`, the intermediate `/modules` (or `/course/x`) entry stays
   * in history, so Back from the lesson re-enters the redirector and bounces
   * the learner straight forward again — a Back button that does nothing.
   */
  it('replaces the intermediate URL rather than pushing it', async () => {
    expect(await optionsOfThrown(call(LESSON))).toMatchObject({
      replace: true,
    });
  });

  /**
   * The narrowed return type says a resumable course never reaches a caller.
   * If this ever returned instead of throwing, both routes would render the
   * "nowhere to send you" empty state to a learner who has somewhere to go.
   */
  it('never returns when there is a lesson to resume', async () => {
    await expect(call(LESSON)).rejects.toBeDefined();
  });

  it('returns the reason when the course has no lessons', async () => {
    await expect(call({ kind: 'none', reason: 'no-lessons' })).resolves.toEqual(
      {
        resume: { kind: 'none', reason: 'no-lessons' },
      },
    );
  });

  it('returns the blocking lock when every lesson is still locked', async () => {
    const lock = {
      kind: 'module-locked',
      moduleSlug: 'm1',
      moduleName: 'Module One',
    } as const;
    await expect(
      call({ kind: 'none', reason: 'all-locked', lock }),
    ).resolves.toEqual({
      resume: { kind: 'none', reason: 'all-locked', lock },
    });
  });

  it('carries the course slug it was asked about, not a hard-coded one', async () => {
    expect(await optionsOfThrown(call(LESSON, 'another-course'))).toMatchObject(
      {
        params: { courseSlug: 'another-course' },
      },
    );
  });
});
