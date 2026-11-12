// @vitest-environment node
import { createHash } from 'node:crypto';
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSql, renderSqlParams } from '#/db/__tests__/render-sql';

type Stored = {
  lessonId: number;
  version: number;
  sourceFingerprint: string;
  chunks: { id: string; title: string; summary: string }[];
  previousMapping: Record<string, string | null> | null;
};

const m = vi.hoisted(() => ({
  claims: new Map<string, string>(),
  stored: null as unknown,
  resolveDebriefSource: vi.fn(),
  generateKnowledgeChunks: vi.fn(),
  matchKnowledgeChunks: vi.fn(),
  upsertLessonChunks: vi.fn(),
  txCalls: [] as { op: string; arg: unknown }[],
  clearedRows: [] as unknown[],
}));

vi.mock('#/integrations/upstash/redis', () => ({
  redis: {
    set: vi.fn(async (key: string, value: string, opts?: { nx?: boolean }) => {
      if (opts?.nx && m.claims.has(key)) return null;
      m.claims.set(key, value);
      return 'OK';
    }),
    del: vi.fn(async (key: string) => {
      m.claims.delete(key);
      return 1;
    }),
  },
}));
vi.mock('#/lib/lesson-debrief-source.server', () => ({
  resolveDebriefSource: m.resolveDebriefSource,
}));
vi.mock('#/ai/generate-knowledge-chunks', () => ({
  generateKnowledgeChunks: m.generateKnowledgeChunks,
}));
vi.mock('#/ai/match-knowledge-chunks', () => ({
  matchKnowledgeChunks: m.matchKnowledgeChunks,
}));
vi.mock('#/db', () => {
  const tx = {
    select: () => ({
      from: () => ({
        where: async (cond: unknown) => {
          m.txCalls.push({ op: 'select', arg: cond });
          return m.clearedRows;
        },
      }),
    }),
    delete: () => ({
      where: async (cond: unknown) => {
        m.txCalls.push({ op: 'delete', arg: cond });
      },
    }),
    insert: () => ({
      values: async (rows: unknown) => {
        m.txCalls.push({ op: 'insert', arg: rows });
      },
    }),
  };
  return {
    db: { transaction: async (fn: (t: typeof tx) => Promise<void>) => fn(tx) },
  };
});
vi.mock('#/db/knowledge-chunks', async () => {
  const actual = await vi.importActual<typeof import('#/db/knowledge-chunks')>(
    '#/db/knowledge-chunks',
  );
  return {
    ...actual,
    selectLessonChunks: vi.fn(async () => m.stored),
    upsertLessonChunks: m.upsertLessonChunks,
  };
});

import {
  carryOverMastery,
  chunkFingerprint,
  chunkIdVersion,
  ensureLessonChunks,
  mapToCurrentChunkIds,
} from '../knowledge-chunks.server';

const source = { kind: 'video', keyPoints: ['a', 'b'], context: 'ctx' };
const gen = [
  { id: 'c1', title: 'T1', summary: 'S1' },
  { id: 'c2', title: 'T2', summary: 'S2' },
];
const fp = createHash('sha256')
  .update(
    JSON.stringify(['knowledge-chunks-v1', source.keyPoints, source.context]),
  )
  .digest('hex');

beforeEach(() => {
  vi.clearAllMocks();
  m.claims.clear();
  m.stored = null;
  m.txCalls = [];
  m.clearedRows = [];
  m.resolveDebriefSource.mockResolvedValue(source);
  m.generateKnowledgeChunks.mockResolvedValue(gen);
  m.matchKnowledgeChunks.mockResolvedValue({ 'v1-c1': 'v2-c2', 'v1-c2': null });
});

describe('ensureLessonChunks', () => {
  it('fingerprint is sha256 of version tag, key points and context', () => {
    expect(chunkFingerprint(source)).toBe(fp);
  });

  it('returns null with no source and never generates', async () => {
    m.resolveDebriefSource.mockResolvedValue(null);
    expect(await ensureLessonChunks(1, 'l', 2)).toBeNull();
    expect(m.generateKnowledgeChunks).not.toHaveBeenCalled();
  });

  it('matching fingerprint: no model call, returns stored', async () => {
    const stored: Stored = {
      lessonId: 1,
      version: 3,
      sourceFingerprint: fp,
      chunks: [{ id: 'v3-c1', title: 'x', summary: 'y' }],
      previousMapping: null,
    };
    m.stored = stored;
    const r = await ensureLessonChunks(1, 'l', 2);
    expect(m.generateKnowledgeChunks).not.toHaveBeenCalled();
    expect(m.upsertLessonChunks).not.toHaveBeenCalled();
    expect(r).toEqual({ version: 3, chunks: stored.chunks });
  });

  it('first store is version 1 with v1- prefixed ids and no matching', async () => {
    const r = await ensureLessonChunks(1, 'l', 2);
    expect(m.generateKnowledgeChunks).toHaveBeenCalledTimes(1);
    expect(m.generateKnowledgeChunks).toHaveBeenCalledWith({
      keyPoints: source.keyPoints,
      context: source.context,
    });
    expect(m.matchKnowledgeChunks).not.toHaveBeenCalled();
    const arg = m.upsertLessonChunks.mock.calls[0][0];
    expect(arg.version).toBe(1);
    expect(arg.sourceFingerprint).toBe(fp);
    expect(arg.chunks.map((c: { id: string }) => c.id)).toEqual([
      'v1-c1',
      'v1-c2',
    ]);
    expect(r?.chunks[0].id).toBe('v1-c1');
    expect(m.claims.size).toBe(0);
  });

  it('changed fingerprint: one generation, version +1, mapping stored and carried over', async () => {
    const oldChunks = [
      { id: 'v1-c1', title: 'o1', summary: '' },
      { id: 'v1-c2', title: 'o2', summary: '' },
    ];
    m.stored = {
      lessonId: 1,
      version: 1,
      sourceFingerprint: 'stale',
      chunks: oldChunks,
      previousMapping: null,
    };
    m.clearedRows = [
      {
        userId: 'u1',
        chunkId: 'v1-c1',
        latestScore: 80,
        clearedAt: new Date(),
      },
    ];
    const r = await ensureLessonChunks(1, 'l', 2);
    expect(m.generateKnowledgeChunks).toHaveBeenCalledTimes(1);
    const newStored = gen.map((c) => ({ ...c, id: `v2-${c.id}` }));
    expect(m.matchKnowledgeChunks).toHaveBeenCalledWith(oldChunks, newStored);
    const arg = m.upsertLessonChunks.mock.calls[0][0];
    expect(arg.version).toBe(2);
    expect(arg.previousMapping).toEqual({ 'v1-c1': 'v2-c2', 'v1-c2': null });
    expect(r).toEqual({ version: 2, chunks: newStored });
    // carryOver consumed the same mapping: v1-c1 -> v2-c2
    expect((m.txCalls[2].arg as { chunkId: string }[])[0].chunkId).toBe(
      'v2-c2',
    );
    expect(m.txCalls.map((c) => c.op)).toEqual(['select', 'delete', 'insert']);
  });

  it('claim held by another caller: returns stored row without generating', async () => {
    m.stored = {
      lessonId: 1,
      version: 1,
      sourceFingerprint: 'stale',
      chunks: [{ id: 'v1-c1', title: 'o', summary: '' }],
      previousMapping: null,
    };
    m.claims.set('knowledge-chunks:claim:1', '1');
    const r = await ensureLessonChunks(1, 'l', 2);
    expect(m.generateKnowledgeChunks).not.toHaveBeenCalled();
    expect(r?.version).toBe(1);
  });

  it('claim held and nothing stored: null', async () => {
    m.claims.set('knowledge-chunks:claim:1', '1');
    expect(await ensureLessonChunks(1, 'l', 2)).toBeNull();
  });

  it('empty generated list: null, nothing stored', async () => {
    m.generateKnowledgeChunks.mockResolvedValue([]);
    expect(await ensureLessonChunks(1, 'l', 2)).toBeNull();
    expect(m.upsertLessonChunks).not.toHaveBeenCalled();
    expect(m.claims.size).toBe(0);
  });

  it('releases the claim when generation throws', async () => {
    m.generateKnowledgeChunks.mockRejectedValue(new Error('boom'));
    await expect(ensureLessonChunks(1, 'l', 2)).rejects.toThrow('boom');
    expect(m.claims.size).toBe(0);
  });
});

describe('carryOverMastery', () => {
  it('replaces non-passed users rows with mapped cleared rows in one transaction', async () => {
    const t = new Date('2026-01-01T00:00:00Z');
    m.clearedRows = [
      { userId: 'u1', chunkId: 'c1', latestScore: 80, clearedAt: t },
      { userId: 'u1', chunkId: 'c2', latestScore: 90, clearedAt: t },
    ];
    await carryOverMastery(5, { c1: 'c2', c2: null });
    const [sel, del, ins] = m.txCalls;
    expect([sel.op, del.op, ins.op]).toEqual(['select', 'delete', 'insert']);

    for (const c of [sel, del]) {
      expect(renderSql(c.arg as SQL)).toBe(
        '"debrief_chunk_mastery"."lesson_id" = $1 and not exists (select 1 from debrief_passes dp inner join lessons l on l.slug = dp.lesson_slug where dp.user_id = "debrief_chunk_mastery"."user_id" and l.id = $2)',
      );
      expect(renderSqlParams(c.arg as SQL)).toEqual([5, 5]);
    }
    // c1 -> c2 keeps clearedAt and score; c2 (unmapped) is dropped.
    expect(ins.arg).toEqual([
      {
        userId: 'u1',
        lessonId: 5,
        chunkId: 'c2',
        latestScore: 80,
        clearedAt: t,
      },
    ]);
  });

  it('handles a swap without colliding (delete precedes insert)', async () => {
    const t = new Date();
    m.clearedRows = [
      { userId: 'u1', chunkId: 'c1', latestScore: 71, clearedAt: t },
      { userId: 'u1', chunkId: 'c2', latestScore: 72, clearedAt: t },
    ];
    await carryOverMastery(5, { c1: 'c2', c2: 'c1' });
    expect(m.txCalls.map((c) => c.op)).toEqual(['select', 'delete', 'insert']);
    expect(
      (m.txCalls[2].arg as { chunkId: string }[]).map((r) => r.chunkId),
    ).toEqual(['c2', 'c1']);
  });

  it('skips uncleared rows and does not insert when nothing carries', async () => {
    m.clearedRows = [
      { userId: 'u1', chunkId: 'c1', latestScore: 20, clearedAt: null },
    ];
    await carryOverMastery(5, { c1: 'c1' });
    expect(m.txCalls.map((c) => c.op)).toEqual(['select', 'delete']);
  });
});

describe('chunk id versions', () => {
  it('parses the version prefix', () => {
    expect(chunkIdVersion('v2-c3')).toBe(2);
    expect(chunkIdVersion('v12-c1')).toBe(12);
    expect(chunkIdVersion('c3')).toBeNull();
    expect(chunkIdVersion('x2-c3')).toBeNull();
  });

  it('keeps current ids, maps one-version-old ids, drops the rest', () => {
    const out = mapToCurrentChunkIds(
      {
        'v2-c1': 80,
        'v1-c1': 70,
        'v1-c2': 60,
        'v1-c3': 50,
        c9: 10,
        'v0-c1': 5,
      },
      { 'v1-c1': 'v2-c4', 'v1-c2': null },
      2,
    );
    expect(out).toEqual({ 'v2-c1': 80, 'v2-c4': 70 });
  });

  it('with no mapping drops old ids', () => {
    expect(mapToCurrentChunkIds({ 'v1-c1': 1, 'v2-c1': 2 }, null, 2)).toEqual({
      'v2-c1': 2,
    });
  });
});
