import { describe, expect, it } from 'vitest';
import { owedRewatch } from '#/lib/video-rewatch';

const at = (iso: string) => new Date(iso);
const FAILED = '2026-11-11T10:00:00.000Z';

describe('owedRewatch', () => {
  it('is null with no below-par attempt — nothing to rewatch for', () => {
    expect(
      owedRewatch([{ progress: 10, createdAt: at(FAILED) }], []),
    ).toBeNull();
  });

  it('is null once the debrief is passed', () => {
    expect(
      owedRewatch(
        [],
        [
          { totalScore: 50, completedAt: FAILED },
          { totalScore: 80, completedAt: '2026-11-11T12:00:00.000Z' },
        ],
      ),
    ).toBeNull();
  });

  it('counts only milestones reached after the latest below-par attempt', () => {
    expect(
      owedRewatch(
        [
          { progress: 10, createdAt: at('2026-11-10T09:00:00.000Z') },
          { progress: 15, createdAt: at('2026-11-10T09:00:00.000Z') },
          { progress: 15, createdAt: at('2026-11-11T11:00:00.000Z') },
          { progress: 10, createdAt: at('2026-11-11T11:01:00.000Z') },
          { progress: 100, createdAt: at('2026-11-11T11:02:00.000Z') },
        ],
        [
          { totalScore: 40, completedAt: '2026-11-09T10:00:00.000Z' },
          { totalScore: 60, completedAt: FAILED },
        ],
      ),
    ).toEqual({ since: FAILED, milestonesHit: [10, 15, 100] });
  });
});
