// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const s = vi.hoisted(() => ({
  results: [] as unknown[][],
  wheres: [] as unknown[],
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
      limit: async () => s.results.shift() ?? [],
    };
    return c;
  };
  return { db: { select: chain } };
});
vi.mock('#/lib/chat-title', () => ({ chatTitleFromText: (t: string) => t }));

import { loadChatContext } from '../chat';

const rendered = (i: number) => new PgDialect().sqlToQuery(s.wheres[i] as SQL);

beforeEach(() => {
  s.results = [];
  s.wheres = [];
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
