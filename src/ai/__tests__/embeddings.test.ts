// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { embedMany, htmlToSections, chunkSectionTokens, dbMock } = vi.hoisted(
  () => {
    const insert = vi.fn(() => ({
      values: vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue(undefined) })),
    }));
    const del = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
    return {
      embedMany: vi.fn(),
      htmlToSections: vi.fn(),
      chunkSectionTokens: vi.fn(),
      dbMock: { insert, delete: del },
    };
  },
);

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

beforeEach(() => {
  vi.clearAllMocks();
  htmlToSections.mockReturnValue([{ heading: 'Section 1', text: 't', name: 'file-x' }]);
});

describe('generateHTMLEmbeddings', () => {
  it('returns { chunks: 0 } and never calls embedMany when there is nothing to embed', async () => {
    chunkSectionTokens.mockReturnValue([]);
    const result = await generateHTMLEmbeddings({
      courseId: 1,
      sourcePath: 'file-x',
      html: '<p>x</p>',
    });
    expect(result).toEqual({ chunks: 0 });
    expect(embedMany).not.toHaveBeenCalled();
    expect(dbMock.delete).toHaveBeenCalledTimes(1);
  });

  it('batches embedMany in groups of 100', async () => {
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
    expect(dbMock.insert).toHaveBeenCalledTimes(150);
  });
});
