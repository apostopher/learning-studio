// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSql } from './render-sql';

const s = vi.hoisted(() => ({ wheres: [] as unknown[] }));
// Real schema tables so the rendered SQL names real columns; only the client
// is stubbed. Both queries end at an awaited chain, so it is a thenable.
vi.mock('#/db', () => {
  const chain = () => {
    const c = {
      from: () => c,
      where: (w: unknown) => {
        s.wheres.push(w);
        return c;
      },
      groupBy: () => c,
      orderBy: () => c,
      // biome-ignore lint/suspicious/noThenProperty: stubbing drizzle's awaitable query builder
      then: (resolve: (v: unknown[]) => void) => resolve([]),
    };
    return c;
  };
  return { db: { select: chain, delete: chain } };
});

import { deleteDocsBySource, listDocsBySource } from '../docs';

beforeEach(() => {
  s.wheres = [];
});

describe('admin doc list/delete', () => {
  it('listDocsBySource(null) excludes lesson chunks', async () => {
    await listDocsBySource(null);
    const sql = renderSql(s.wheres[0] as SQL);
    expect(sql).toContain('"lesson_slug" is null');
  });

  it('listDocsBySource(courseId) excludes lesson chunks', async () => {
    await listDocsBySource(3);
    expect(renderSql(s.wheres[0] as SQL)).toContain('"lesson_slug" is null');
  });

  it('deleteDocsBySource excludes lesson chunks', async () => {
    await deleteDocsBySource(null, 'a.pdf');
    expect(renderSql(s.wheres[0] as SQL)).toContain('"lesson_slug" is null');
  });
});
