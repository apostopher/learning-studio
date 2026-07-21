// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { embedMany, htmlToSections, chunkSectionTokens, dbMock, txMock } =
  vi.hoisted(() => {
    function makeInsert() {
      return vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
        })),
      }));
    }
    function makeDelete() {
      return vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
    }
    type Tx = { insert: ReturnType<typeof makeInsert>; delete: ReturnType<typeof makeDelete> };
    const tx: Tx = { insert: makeInsert(), delete: makeDelete() };
    const transaction = vi.fn(async (cb: (tx: Tx) => Promise<void>) => {
      await cb(tx);
    });
    return {
      embedMany: vi.fn(),
      htmlToSections: vi.fn(),
      chunkSectionTokens: vi.fn(),
      dbMock: { transaction },
      txMock: tx,
    };
  });

vi.mock('ai', () => ({ embedMany }));
vi.mock('#/ai/gemini', () => ({ embeddingModel: { id: 'gemini-embedding-001' } }));
vi.mock('#/ai/embeddings-helper', () => ({ htmlToSections, chunkSectionTokens }));
vi.mock('#/db', () => ({ db: dbMock }));
vi.mock('#/db/schema', () => ({ docs: { sourcePath: 'source_path', courseId: 'course_id' } }));
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ and: a }),
  eq: (c: unknown, v: unknown) => ({ eq: [c, v] }),
  isNull: (c: unknown) => ({ isNull: c }),
}));

import { generateHTMLEmbeddings } from '#/ai/embeddings';

function chunk(i: number) {
  return { heading: 'Section 1', text: `chunk-${i}`, name: 'file-x' };
}

/** The argument passed to `tx.delete(docs).where(<arg>)` for the nth delete call. */
function deleteWhereArg(callIndex = 0) {
  return txMock.delete.mock.results[callIndex]?.value.where.mock.calls[0][0];
}

beforeEach(() => {
  vi.clearAllMocks();
  htmlToSections.mockReturnValue([{ heading: 'Section 1', text: 't', name: 'file-x' }]);
});

describe('generateHTMLEmbeddings', () => {
  it('returns { chunks: 0 } and never deletes or embeds when there is nothing to embed', async () => {
    chunkSectionTokens.mockReturnValue([]);
    const result = await generateHTMLEmbeddings({
      courseId: 1,
      sourcePath: 'file-x',
      html: '<p>x</p>',
    });
    expect(result).toEqual({ chunks: 0 });
    expect(embedMany).not.toHaveBeenCalled();
    expect(dbMock.transaction).not.toHaveBeenCalled();
    expect(txMock.delete).toHaveBeenCalledTimes(0);
  });

  it('batches embedMany in groups of 100 and inserts via the transaction', async () => {
    chunkSectionTokens.mockReturnValue(
      Array.from({ length: 150 }, (_, i) => chunk(i)),
    );
    embedMany.mockImplementation(async ({ values }: { values: string[] }) => ({
      embeddings: values.map(() => [0.1, 0.2, 0.3]),
    }));
    const result = await generateHTMLEmbeddings({
      courseId: null,
      sourcePath: 'file-x',
      html: '<p>x</p>',
    });
    expect(result).toEqual({ chunks: 150 });
    expect(embedMany).toHaveBeenCalledTimes(2); // 100 + 50
    expect(dbMock.transaction).toHaveBeenCalledTimes(1);
    expect(txMock.insert).toHaveBeenCalledTimes(150);
    expect(txMock.delete).toHaveBeenCalledTimes(1);
  });

  it('scopes the delete to the given course via eq(docs.courseId, courseId)', async () => {
    chunkSectionTokens.mockReturnValue([chunk(0)]);
    embedMany.mockResolvedValue({ embeddings: [[0.1, 0.2, 0.3]] });
    await generateHTMLEmbeddings({
      courseId: 2,
      sourcePath: 'file-x',
      html: '<p>x</p>',
    });
    expect(deleteWhereArg()).toEqual({
      and: [{ eq: ['source_path', 'file-x'] }, { eq: ['course_id', 2] }],
    });
  });

  it('scopes the delete to org-wide docs via isNull(docs.courseId) when courseId is null', async () => {
    chunkSectionTokens.mockReturnValue([chunk(0)]);
    embedMany.mockResolvedValue({ embeddings: [[0.1, 0.2, 0.3]] });
    await generateHTMLEmbeddings({
      courseId: null,
      sourcePath: 'file-x',
      html: '<p>x</p>',
    });
    expect(deleteWhereArg()).toEqual({
      and: [{ eq: ['source_path', 'file-x'] }, { isNull: 'course_id' }],
    });
  });
});
