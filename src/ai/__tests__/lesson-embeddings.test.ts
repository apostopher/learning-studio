// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** One inserted `docs` row, as far as these tests look. */
type Row = {
  courseId: number | null;
  lessonSlug: string;
  lessonVersionId: number;
  sourcePath: string;
  heading: string;
  chunk: string;
  embedding: number[];
};
const h = vi.hoisted(() => ({
  embedMany: vi.fn(),
  inserted: [] as unknown[],
  deletedWhere: [] as unknown[],
  log: [] as string[],
}));

vi.mock('ai', () => ({ embedMany: h.embedMany }));
vi.mock('#/ai/gemini', () => ({ embeddingModel: 'embedding-model' }));
// The real schema and chunker, so the rows are the ones production would
// store; only the client is stubbed.
vi.mock('#/db', () => {
  const lock = {
    from: () => lock,
    where: () => lock,
    for: async (strength: string) => {
      h.log.push(`lock ${strength}`);
      return [];
    },
  };
  const tx = {
    select: () => lock,
    delete: () => ({
      where: async (w: unknown) => {
        h.log.push('delete');
        h.deletedWhere.push(w);
      },
    }),
    insert: () => ({
      values: (rows: unknown[]) => ({
        onConflictDoNothing: async () => {
          h.log.push('insert');
          h.inserted.push(...rows);
        },
      }),
    }),
  };
  return {
    db: {
      transaction: async (cb: (t: typeof tx) => Promise<void>) => {
        h.log.push('begin');
        await cb(tx);
      },
    },
  };
});

const { generateLessonEmbeddings } = await import('#/ai/embeddings');

/** Long enough for several chunks, no two of them alike. */
const HTML = `<p>${Array.from({ length: 80 }, (_, i) => `Report ${i} is routine, issued hourly.`).join(' ')}</p>`;
const index = (i: {
  lessonVersionId: number;
  lessonSlug: string;
  version: string;
  html?: string;
}) => generateLessonEmbeddings({ html: HTML, ...i });
const rows = () => h.inserted as Row[];
/** `uniq_course_source_heading_chunk`, NULLS NOT DISTINCT. */
const uniqueKey = (r: Row) =>
  JSON.stringify([r.courseId, r.sourcePath, r.heading, r.chunk]);

beforeEach(() => {
  vi.clearAllMocks();
  h.inserted.length = 0;
  h.deletedWhere.length = 0;
  h.log.length = 0;
  h.embedMany.mockImplementation(async ({ values }: { values: string[] }) => {
    h.log.push('embed');
    return { embeddings: values.map((_, i) => [i]) };
  });
});

describe('generateLessonEmbeddings', () => {
  it('replaces the rows of that snapshot only, with the embeddings ready first', async () => {
    const { chunks } = await index({
      lessonVersionId: 101,
      lessonSlug: 'wx-1',
      version: '1.0',
    });

    expect(chunks).toBeGreaterThan(1);
    expect(rows()).toHaveLength(chunks);
    rows().forEach((row, i) => {
      expect(row).toMatchObject({
        courseId: null,
        lessonSlug: 'wx-1',
        lessonVersionId: 101,
        sourcePath: 'lesson:wx-1@1.0',
        embedding: [i],
      });
    });
    expect(h.deletedWhere).toHaveLength(1);
    expect(new PgDialect().sqlToQuery(h.deletedWhere[0] as SQL)).toMatchObject({
      sql: '"docs"."lesson_version_id" = $1',
      params: [101],
    });
    // The lesson before its snapshot, as a lesson delete takes them.
    expect(h.log).toEqual([
      'embed',
      'begin',
      'lock key share',
      'lock no key update',
      'delete',
      'insert',
    ]);
  });

  it('a failed embedding writes nothing', async () => {
    h.embedMany.mockRejectedValue(new Error('quota'));
    await expect(
      index({ lessonVersionId: 101, lessonSlug: 'wx-1', version: '1.0' }),
    ).rejects.toThrow('quota');
    expect(h.log).toEqual([]);
  });

  it('empty material deletes the old rows and inserts nothing', async () => {
    const result = await index({
      lessonVersionId: 101,
      lessonSlug: 'wx-1',
      version: '1.0',
      html: '',
    });
    expect(result).toEqual({ chunks: 0 });
    expect(h.deletedWhere).toHaveLength(1);
    expect(h.inserted).toEqual([]);
    expect(h.embedMany).not.toHaveBeenCalled();
  });

  // The unique key omits lesson_version_id, and a collision is a silently
  // missing chunk (ON CONFLICT DO NOTHING).
  it('identical text in two snapshots, or two lessons, never shares a unique key', async () => {
    await index({ lessonVersionId: 101, lessonSlug: 'wx-1', version: '1.1' });
    await index({ lessonVersionId: 102, lessonSlug: 'wx-1', version: '1.10' });
    await index({ lessonVersionId: 103, lessonSlug: 'wx-11', version: '1.1' });

    const keys = rows().map(uniqueKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('a snapshot never shares a unique key with rows from before lesson versions', async () => {
    await index({ lessonVersionId: 101, lessonSlug: 'wx-1', version: '1.0' });
    // What the old indexer stored for the same text: the same chunks, under a
    // source path without a version.
    const legacy = rows().map((r) =>
      uniqueKey({ ...r, sourcePath: 'lesson:wx-1' }),
    );
    for (const row of rows()) expect(legacy).not.toContain(uniqueKey(row));
  });

  // Chunks reach the learner's browser as the search tool's output.
  it('the version is not in the chunk text', async () => {
    await index({ lessonVersionId: 101, lessonSlug: 'wx-1', version: '7.31' });
    for (const row of rows()) {
      expect(row.chunk).toContain('Name: lesson:wx-1 >');
      expect(row.chunk).not.toContain('7.31');
    }
    expect(h.embedMany.mock.calls[0][0].values.join()).not.toContain('7.31');
  });
});
