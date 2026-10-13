// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const s = vi.hoisted(() => ({
  results: [] as unknown[][],
  wheres: [] as unknown[],
  limits: [] as number[],
  updateResult: [] as unknown[],
  updateSet: undefined as unknown,
  updateWhere: undefined as unknown,
}));
// The real schema tables, so the rendered SQL names real columns; only the
// client is stubbed. Every query here ends in `.limit()`, which serves the
// queued results.
vi.mock('#/db', () => {
  const chain = () => {
    const c = {
      from: () => c,
      where: (w: unknown) => {
        s.wheres.push(w);
        return c;
      },
      orderBy: () => c,
      limit: async (n: number) => {
        s.limits.push(n);
        return s.results.shift() ?? [];
      },
      // An unlimited query is awaited directly, so the chain is a thenable.
      // biome-ignore lint/suspicious/noThenProperty: stubbing drizzle's awaitable query builder
      then: (resolve: (v: unknown[]) => void) =>
        resolve(s.results.shift() ?? []),
    };
    return c;
  };
  const update = () => {
    const u = {
      set: (v: unknown) => {
        s.updateSet = v;
        return u;
      },
      where: (w: unknown) => {
        s.updateWhere = w;
        return u;
      },
      returning: async () => s.updateResult,
    };
    return u;
  };
  return { db: { select: chain, update } };
});
vi.mock('#/lib/chat-title', () => ({ chatTitleFromText: (t: string) => t }));

import { HISTORY_HARD_CAP } from '#/lib/chat-history';
import { loadChatContext, saveChatSummary } from '../chat';

const rendered = (i: number) => new PgDialect().sqlToQuery(s.wheres[i] as SQL);

beforeEach(() => {
  s.results = [];
  s.wheres = [];
  s.limits = [];
});

describe('loadChatContext', () => {
  it('returns null for a chat this user does not own', async () => {
    s.results = [[]];
    expect(await loadChatContext('u1', 'c1')).toBeNull();
    expect(rendered(0).params).toEqual(expect.arrayContaining(['c1', 'u1']));
  });

  it('reads only messages after the summarized order', async () => {
    s.results = [
      [{ summary: 'S', summarizedThroughOrder: 7 }],
      [{ id: 'm8', role: 'user', order: 8, parts: [] }],
    ];
    const ctx = await loadChatContext('u1', 'c1');
    expect(rendered(1).sql).toMatch(/"ai_messages"\."order" > \$\d+/);
    expect(rendered(1).params).toContain(7);
    expect(ctx).toEqual({
      summary: 'S',
      summarizedThroughOrder: 7,
      entries: [{ order: 8, message: { id: 'm8', role: 'user', parts: [] } }],
    });
  });

  it('keeps the summary when every stored message is already summarized', async () => {
    s.results = [[{ summary: 'S', summarizedThroughOrder: 9 }], []];
    expect(await loadChatContext('u1', 'c1')).toEqual({
      summary: 'S',
      summarizedThroughOrder: 9,
      entries: [],
    });
  });
});

describe('loadChatContext uncapped (compactor read)', () => {
  it('applies no row limit and returns more than HISTORY_HARD_CAP entries', async () => {
    const rows = Array.from({ length: HISTORY_HARD_CAP + 10 }, (_, i) => ({
      id: `m${i}`,
      role: 'user',
      order: i + 1,
      parts: [],
    }));
    s.results = [[{ summary: null, summarizedThroughOrder: null }], rows];
    const ctx = await loadChatContext('u1', 'c1', { cap: Infinity });
    expect(ctx?.entries).toHaveLength(HISTORY_HARD_CAP + 10);
    expect(ctx?.entries[0].order).toBe(1);
    // Only the ownership lookup's .limit(1); the message query has none.
    expect(s.limits).toEqual([1]);
  });

  it('the default read is still capped', async () => {
    s.results = [[{ summary: null, summarizedThroughOrder: null }], []];
    await loadChatContext('u1', 'c1');
    expect(s.limits).toEqual([1, HISTORY_HARD_CAP * 2]);
  });
});

describe('saveChatSummary', () => {
  it('only writes if nobody compacted in between', async () => {
    s.updateResult = [{ id: 'c1' }];
    expect(
      await saveChatSummary({
        chatId: 'c1',
        summary: 'S',
        throughOrder: 9,
        expectedThroughOrder: 3,
      }),
    ).toBe(true);
    const { sql, params } = new PgDialect().sqlToQuery(s.updateWhere as SQL);
    expect(sql).toMatch(
      /"ai_chats"\."summarized_through_order" is not distinct from \$\d+/,
    );
    expect(params).toEqual(expect.arrayContaining(['c1', 3]));
    expect(s.updateSet).toEqual({ summary: 'S', summarizedThroughOrder: 9 });
    s.updateResult = [];
    expect(
      await saveChatSummary({
        chatId: 'c1',
        summary: 'S',
        throughOrder: 9,
        expectedThroughOrder: 3,
      }),
    ).toBe(false);
  });
});
