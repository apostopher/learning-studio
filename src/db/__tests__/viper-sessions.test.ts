// @vitest-environment node
import { asc, desc, type SQL } from 'drizzle-orm';
import { QueryBuilder } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSql } from '#/db/__tests__/render-sql';
import type { Captured } from './support/capture-db';

const cap = vi.hoisted(() => {
  const captured = {
    select: [] as unknown[],
    from: [] as unknown[],
    joins: [] as unknown[],
    joinOn: [] as unknown[],
    where: [] as unknown[],
    orderBy: [] as unknown[],
    groupBy: [] as unknown[],
  } satisfies Captured;
  return {
    captured,
    limit: [] as unknown[],
    offset: [] as unknown[],
    results: [] as unknown[][],
  };
});
vi.mock('#/db', async () => {
  const { captureDb } = await import('./support/capture-db');
  const { db, captured, results } = captureDb();
  Object.assign(cap.captured, captured);
  cap.results = results;
  // The shared chain does not record paging; wrap it here so the offset a
  // page asks for is assertable.
  db.limit = (n: unknown) => {
    cap.limit.push(n);
    return db;
  };
  db.offset = (n: unknown) => {
    cap.offset.push(n);
    return db;
  };
  return { db };
});

const { listViperSessions, getViperSession } = await import(
  '../viper-sessions'
);
const { aiChats, aiMessages, userProfileTable } = await import('../schema');

beforeEach(() => {
  for (const list of Object.values(cap.captured)) list.length = 0;
  cap.limit.length = 0;
  cap.offset.length = 0;
  cap.results.length = 0;
});

function row(i: number) {
  return {
    id: `c${i}`,
    title: `Chat ${i}`,
    learnerName: 'Ada Lovelace',
    updatedAt: new Date('2026-11-19T00:00:00Z'),
    messageCount: 3,
    isVideoCall: false,
  };
}

/**
 * The worst case for a correlated subquery: the fragment selected from
 * `ai_chats` ALONE, where drizzle renders an unqualified column as bare
 * `"id"` — which Postgres would bind to the subquery's own table (prod bug,
 * 2026-11-12). Rendering only the fragment would qualify it anyway and hide
 * that, so it goes through a real single-table select.
 */
const inSingleTableSelect = (fragment: SQL) =>
  new QueryBuilder().select({ v: fragment }).from(aiChats).toSQL().sql;

const predicate = (sqlText: string, column: string) =>
  sqlText.match(new RegExp(`${column} = [^\\s)]+`))?.[0];

describe('listViperSessions', () => {
  it('counts messages of the outer chat, not every chat', async () => {
    await listViperSessions(0);
    const columns = cap.captured.select[0] as Record<string, SQL>;
    expect(
      predicate(inSingleTableSelect(columns.messageCount), 'm.chat_id'),
    ).toBe('m.chat_id = "ai_chats"."id"');
    expect(
      predicate(inSingleTableSelect(columns.isVideoCall), 'v.chat_id'),
    ).toBe('v.chat_id = "ai_chats"."id"');
  });

  it('names the learner from their profile, joined on user id', async () => {
    await listViperSessions(0);
    expect(cap.captured.from[0]).toBe(aiChats);
    expect(cap.captured.joins[0]).toBe(userProfileTable);
    expect(renderSql(cap.captured.joinOn[0] as SQL)).toBe(
      '"user_profiles"."user_id" = "ai_chats"."user_id"',
    );
  });

  it('pages 50 at a time and reports hasMore', async () => {
    cap.results.push(Array.from({ length: 51 }, (_, i) => row(i)));
    const page = await listViperSessions(2);
    expect(page.sessions).toHaveLength(50);
    expect(page.sessions[49]?.id).toBe('c49');
    expect(page.hasMore).toBe(true);
    // Fetch one past the page to learn whether another exists.
    expect(cap.limit).toEqual([51]);
    expect(cap.offset).toEqual([100]);
  });

  it('reports no more on the last page', async () => {
    cap.results.push(Array.from({ length: 50 }, (_, i) => row(i)));
    const page = await listViperSessions(0);
    expect(page.sessions).toHaveLength(50);
    expect(page.hasMore).toBe(false);
  });

  it('orders newest activity first, id breaking ties so pages never overlap', async () => {
    await listViperSessions(0);
    expect(cap.captured.orderBy.map((o) => renderSql(o as SQL))).toEqual([
      renderSql(desc(aiChats.updatedAt)),
      renderSql(desc(aiChats.id)),
    ]);
  });
});

describe('getViperSession', () => {
  it('returns null for an unknown chat, without reading messages', async () => {
    cap.results.push([]);
    expect(await getViperSession('nope')).toBeNull();
    expect(cap.captured.from).toEqual([aiChats]);
  });

  it('returns the summary and the messages in order', async () => {
    const messages = [
      { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
    ];
    cap.results.push([row(1)], messages);
    const session = await getViperSession('c1');
    expect(session).toEqual({ summary: row(1), messages });
    expect(cap.captured.from).toEqual([aiChats, aiMessages]);
    expect(renderSql(cap.captured.where[1] as SQL)).toBe(
      '"ai_messages"."chat_id" = $1',
    );
    expect(renderSql(cap.captured.orderBy.at(-1) as SQL)).toBe(
      renderSql(asc(aiMessages.order)),
    );
  });
});
