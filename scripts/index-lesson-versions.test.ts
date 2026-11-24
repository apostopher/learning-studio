// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  indexLessonVersions: vi.fn(),
  unindexedLessonVersionIds: vi.fn(),
}));
vi.mock('#/lib/index-lesson-versions.server', () => m);

import { run } from './index-lesson-versions';

beforeEach(() => {
  vi.clearAllMocks();
  m.unindexedLessonVersionIds.mockResolvedValue([4, 5, 6]);
});

describe('db:index-lesson-versions', () => {
  it('indexes what has no search rows, says how many and exits 0', async () => {
    m.indexLessonVersions.mockResolvedValue({ indexed: 3, failed: [] });
    const print = vi.fn();
    expect(await run(print)).toBe(0);
    expect(m.indexLessonVersions).toHaveBeenCalledWith([4, 5, 6]);
    expect(print.mock.calls).toEqual([['Indexed 3 lesson versions.']]);
  });

  it('names the failed ids and exits non-zero', async () => {
    m.indexLessonVersions.mockResolvedValue({ indexed: 1, failed: [4, 6] });
    const print = vi.fn();
    expect(await run(print)).toBe(1);
    expect(print.mock.calls).toEqual([
      ['Indexed 1 lesson versions.'],
      ['2 failed: 4, 6. Run this again to retry them.'],
    ]);
  });
});
