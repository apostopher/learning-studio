// @vitest-environment node

import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  where: undefined as unknown,
  limit: undefined as unknown,
}));

vi.mock('ai', () => ({
  embed: async () => ({ embedding: [0.1, 0.2, 0.3] }),
}));
vi.mock('#/ai/gemini', () => ({ embeddingModel: 'embedding-model' }));
// The real table, so the rendered SQL names real columns; only the client is
// stubbed, capturing what the query was built with.
vi.mock('#/db', () => {
  const chain = {
    from: () => chain,
    where: (w: unknown) => {
      m.where = w;
      return chain;
    },
    orderBy: () => chain,
    limit: async (n: unknown) => {
      m.limit = n;
      return [];
    },
  };
  return { db: { select: () => chain } };
});

import { KB_MAX_RESULTS, KB_MIN_SIMILARITY, searchKB } from '../knowledge-base';

const rendered = () => new PgDialect().sqlToQuery(m.where as SQL);

beforeEach(() => {
  m.where = undefined;
  m.limit = undefined;
});

describe('searchKB', () => {
  it('reads org-wide docs only when no course is resolved', async () => {
    await searchKB('q', { courseId: null });
    const { sql, params } = rendered();
    expect(sql).toContain('"docs"."course_id" is null');
    expect(sql).not.toMatch(/"docs"\."course_id" = /);
    expect(params).not.toContain(2);
  });

  it("reads one course's docs plus org-wide ones — never every course's", async () => {
    await searchKB('q', { courseId: 2 });
    const { sql, params } = rendered();
    expect(sql).toMatch(
      /\("docs"\."course_id" = \$\d+ or "docs"\."course_id" is null\)/,
    );
    expect(params).toContain(2);
  });

  it('applies the fixed relevance floor and result cap', async () => {
    await searchKB('q', { courseId: null });
    const { sql, params } = rendered();
    expect(sql).toMatch(/> \$\d+/);
    expect(params).toContain(KB_MIN_SIMILARITY);
    expect(m.limit).toBe(KB_MAX_RESULTS);
  });

  it('keeps the floor between measured off-topic and on-topic scores', () => {
    // See KB_MIN_SIMILARITY: off-topic peaked at 0.547, the weakest relevant
    // query bottomed at 0.572. A change outside that band needs re-measuring.
    expect(KB_MIN_SIMILARITY).toBeGreaterThan(0.547);
    expect(KB_MIN_SIMILARITY).toBeLessThan(0.572);
  });
});
