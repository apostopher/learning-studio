// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => {
  class ForbiddenError extends Error {
    constructor() {
      super('Forbidden');
      this.name = 'ForbiddenError';
    }
  }
  return {
    ForbiddenError,
    requireAdmin: vi.fn(),
    results: [] as unknown[][],
    offsets: [] as unknown[],
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  requireAdmin: m.requireAdmin,
  ForbiddenError: m.ForbiddenError,
}));
// The real `viper-sessions` module runs; only the database is stood in for,
// so paging and the 404 are exercised from the rows up.
vi.mock('#/db', async () => {
  const { captureDb } = await import('#/db/__tests__/support/capture-db');
  const { db, results } = captureDb();
  m.results = results;
  db.offset = (n: unknown) => {
    m.offsets.push(n);
    return db;
  };
  return { db };
});

import {
  sessionsPageSchema,
  sessionTranscriptSchema,
} from '#/lib/viper-session-schemas';
import { listSessionsHandler } from '../viper.sessions';
import { getSessionHandler } from '../viper.sessions.$chatId';

const list = (query = '') =>
  listSessionsHandler(new Request(`http://t/api/admin/viper/sessions${query}`));
const one = (chatId: string) =>
  getSessionHandler(
    new Request(`http://t/api/admin/viper/sessions/${chatId}`),
    chatId,
  );

function row(i: number) {
  return {
    id: `c${i}`,
    title: `Chat ${i}`,
    learnerName: null,
    updatedAt: new Date('2026-11-19T08:00:00Z'),
    messageCount: 0,
    isVideoCall: i === 0,
  };
}

beforeEach(() => {
  m.requireAdmin.mockReset().mockResolvedValue({ userId: 'admin-1' });
  m.results.length = 0;
  m.offsets.length = 0;
});

describe('GET /api/admin/viper/sessions', () => {
  it('refuses non-admins', async () => {
    m.requireAdmin.mockRejectedValue(new m.ForbiddenError());
    expect((await list()).status).toBe(403);
    expect((await one('c1')).status).toBe(403);
    // Refused before anything is read.
    expect(m.offsets).toEqual([]);
  });

  it('400s a bad page', async () => {
    for (const bad of ['-1', 'x', '1.5', '']) {
      const res = await list(`?page=${bad}`);
      expect(res.status, `page=${bad}`).toBe(400);
    }
    expect(m.offsets).toEqual([]);
  });

  it('reads page 0 when no page is given', async () => {
    const res = await list();
    expect(res.status).toBe(200);
    expect(m.offsets).toEqual([0]);
  });

  it('pages 50 at a time and reports hasMore', async () => {
    m.results.push(Array.from({ length: 51 }, (_, i) => row(i)));
    const res = await list('?page=1');
    expect(res.status).toBe(200);
    expect(m.offsets).toEqual([50]);
    // The client parses with the same schema the route promises.
    const body = sessionsPageSchema.parse(await res.json());
    expect(body.sessions).toHaveLength(50);
    expect(body.hasMore).toBe(true);
    expect(body.sessions[0]).toEqual({
      ...row(0),
      updatedAt: new Date('2026-11-19T08:00:00Z'),
    });
  });
});

describe('GET /api/admin/viper/sessions/$chatId', () => {
  it('404s an unknown chat', async () => {
    m.results.push([]);
    expect((await one('missing')).status).toBe(404);
  });

  it('returns the summary and the messages', async () => {
    const messages = [
      { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
      { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'yo' }] },
    ];
    m.results.push([row(3)], messages);
    const res = await one('c3');
    expect(res.status).toBe(200);
    const body = sessionTranscriptSchema.parse(await res.json());
    expect(body.summary.id).toBe('c3');
    expect(body.messages).toEqual(messages);
  });
});
