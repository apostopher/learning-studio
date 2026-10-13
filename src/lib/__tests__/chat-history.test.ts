import { describe, expect, it } from 'vitest';
import { HISTORY_HARD_CAP, toHistoryEntries } from '#/lib/chat-history';

const row = (order: number, role = 'user') => ({
  id: `m${order}`,
  role,
  order,
  parts: [{ type: 'text', text: `t${order}` }],
});

describe('toHistoryEntries', () => {
  it('keeps only learner and Viper turns, oldest first', () => {
    const out = toHistoryEntries([
      row(3, 'assistant'),
      row(1),
      row(2, 'system'),
    ]);
    expect(out.map((e) => e.order)).toEqual([1, 3]);
    expect(out[1].message).toEqual({
      id: 'm3',
      role: 'assistant',
      parts: [{ type: 'text', text: 't3' }],
    });
  });

  it('caps at the newest HISTORY_HARD_CAP', () => {
    const rows = Array.from({ length: HISTORY_HARD_CAP + 5 }, (_, i) => row(i));
    const out = toHistoryEntries(rows);
    expect(out).toHaveLength(HISTORY_HARD_CAP);
    expect(out[0].order).toBe(5);
  });

  it('an infinite cap returns every turn (the compactor read)', () => {
    const rows = Array.from({ length: HISTORY_HARD_CAP + 5 }, (_, i) => row(i));
    const out = toHistoryEntries(rows, Number.POSITIVE_INFINITY);
    expect(out).toHaveLength(HISTORY_HARD_CAP + 5);
    expect(out[0].order).toBe(0);
  });
});
