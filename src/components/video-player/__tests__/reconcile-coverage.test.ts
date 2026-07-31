import { describe, expect, it, vi } from 'vitest';
import { reconcileCoverage } from '../reconcile-coverage';

describe('reconcileCoverage', () => {
  it('re-reports milestones the server is missing', async () => {
    const report = vi.fn();
    const fetchProgress = vi.fn().mockResolvedValue({
      milestonesHit: [10, 15],
      watched: false,
    });

    const resent = await reconcileCoverage({
      lessonSlug: 'v1',
      reported: new Set([10, 15, 20]),
      report,
      fetchProgress,
    });

    // Reports go by sendBeacon and are fire-and-forget; a dropped one would
    // otherwise strand the student behind a lock they legitimately cleared.
    expect(resent).toEqual([20]);
    expect(report).toHaveBeenCalledWith({ lessonSlug: 'v1', progress: 20 });
  });

  it('sends nothing when the server already agrees', async () => {
    const report = vi.fn();
    const fetchProgress = vi.fn().mockResolvedValue({
      milestonesHit: [10, 15, 20],
      watched: true,
    });

    const resent = await reconcileCoverage({
      lessonSlug: 'v1',
      reported: new Set([10, 15, 20]),
      report,
      fetchProgress,
    });

    expect(resent).toEqual([]);
    expect(report).not.toHaveBeenCalled();
  });

  it('never throws when the progress fetch fails', async () => {
    const report = vi.fn();
    const fetchProgress = vi.fn().mockRejectedValue(new Error('offline'));

    await expect(
      reconcileCoverage({
        lessonSlug: 'v1',
        reported: new Set([10]),
        report,
        fetchProgress,
      }),
    ).resolves.toEqual([]);
  });
});
