import { beforeEach, describe, expect, it, vi } from 'vitest';

// A level taken away is a newer `'none'` row (roster chip, 2026-11-27). Every
// reader must hand on "no level" (null / absent), never the string 'none'.

const db = vi.hoisted(() => {
  const state = { rows: [] as unknown[], executeRows: [] as unknown[] };
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: async () => state.rows,
  };
  return {
    state,
    select: () => chain,
    execute: async () => ({ rows: state.executeRows }),
  };
});

vi.mock('#/db', () => ({ db }));

import {
  getCurrentLevel,
  getCurrentLevelsByCourse,
  getUnacknowledgedLevelChange,
} from '#/db/user-levels';

const adminRow = (level: string) => ({
  id: 7,
  userId: 'u1',
  courseId: 3,
  level,
  source: 'admin',
  message: 'm',
  note: null,
  changedBy: 'a1',
  acknowledgedAt: null,
  createdAt: new Date(),
});

describe('a level taken away reads as no level', () => {
  beforeEach(() => {
    db.state.rows = [];
    db.state.executeRows = [];
  });

  it('getCurrentLevel answers null for a newest "none" row', async () => {
    db.state.rows = [{ level: 'none' }];
    expect(await getCurrentLevel('u1', 3)).toBeNull();
    db.state.rows = [{ level: 'basic' }];
    expect(await getCurrentLevel('u1', 3)).toBe('basic');
  });

  it('getCurrentLevelsByCourse leaves a "none" course out', async () => {
    db.state.executeRows = [
      { course_id: 3, level: 'none' },
      { course_id: 4, level: 'advanced' },
    ];
    const levels = await getCurrentLevelsByCourse('u1');
    expect([...levels]).toEqual([[4, 'advanced']]);
  });

  it('does not announce a level taken away to the pilot', async () => {
    db.state.rows = [adminRow('none')];
    expect(await getUnacknowledgedLevelChange('u1', 3)).toBeNull();
    db.state.rows = [adminRow('intermediate')];
    expect(await getUnacknowledgedLevelChange('u1', 3)).toMatchObject({
      level: 'intermediate',
    });
  });
});
