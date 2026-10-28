import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { dataKeys } from '#/data-hooks/keys';
import { queryKeys } from '#/hooks/data/keys';
import { invalidateAfterCoverageComplete } from '../after-coverage-complete';

/**
 * The video's coverage completing can be the step that finishes the lesson
 * (a video-only lesson, or one whose tabs and quiz were already done), so the
 * readers of "done" refresh too — not just the material it unlocks.
 */
describe('invalidateAfterCoverageComplete', () => {
  it('refreshes the material, the video progress and the readers of done', async () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    await invalidateAfterCoverageComplete(client, {
      courseSlug: 'ppl',
      lessonSlug: 'l1',
    });
    expect(spy.mock.calls.map(([f]) => f?.queryKey)).toEqual([
      queryKeys.lessonMaterial({ courseSlug: 'ppl', lessonSlug: 'l1' }),
      dataKeys.lessonProgress('l1'),
      dataKeys.debriefStatus('ppl', 'l1'),
      dataKeys.courseProgressSummary('ppl'),
    ]);
  });
});
