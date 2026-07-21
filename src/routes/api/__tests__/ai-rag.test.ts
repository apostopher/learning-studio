// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  class ForbiddenError extends Error {
    constructor() {
      super('Forbidden');
      this.name = 'ForbiddenError';
    }
  }
  return {
    ForbiddenError,
    requireAdmin: vi.fn(),
    generateHTMLEmbeddings: vi.fn(),
    convertWordToHtml: vi.fn(),
    convertPdfToHtml: vi.fn(),
    courseExists: vi.fn(),
    listDocsBySource: vi.fn(),
    deleteDocsBySource: vi.fn(),
    getDocUrls: vi.fn(),
    deleteDocUrls: vi.fn(),
    upsertDocUrl: vi.fn(),
    del: vi.fn(),
    fetchMock: vi.fn(),
  };
});

vi.mock('#/lib/admin-functions.server', () => ({
  requireAdmin: mocks.requireAdmin,
  ForbiddenError: mocks.ForbiddenError,
}));
vi.mock('#/ai/embeddings', () => ({ generateHTMLEmbeddings: mocks.generateHTMLEmbeddings }));
vi.mock('#/common/html-converters', () => ({
  convertWordToHtml: mocks.convertWordToHtml,
  convertPdfToHtml: mocks.convertPdfToHtml,
}));
vi.mock('#/db/docs', () => ({
  courseExists: mocks.courseExists,
  listDocsBySource: mocks.listDocsBySource,
  deleteDocsBySource: mocks.deleteDocsBySource,
  getDocUrls: mocks.getDocUrls,
  deleteDocUrls: mocks.deleteDocUrls,
  upsertDocUrl: mocks.upsertDocUrl,
}));
vi.mock('@vercel/blob', () => ({ del: mocks.del }));

import {
  addEmbeddingsHandler,
  listEmbeddingsHandler,
  deleteEmbeddingsHandler,
} from '../ai-rag';

const LONG = 'x'.repeat(40);
function post(body: unknown): Request {
  return new Request('http://test/api/ai-rag', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ userId: 'u1', roles: ['admin'] });
  mocks.generateHTMLEmbeddings.mockResolvedValue({ chunks: 3 });
  mocks.courseExists.mockResolvedValue(true);
  vi.stubGlobal('fetch', mocks.fetchMock);
});

describe('addEmbeddingsHandler (POST)', () => {
  it('403 when not admin', async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new mocks.ForbiddenError());
    const res = await addEmbeddingsHandler(post({ mode: 'text', sourcePath: 'd', html: LONG }));
    expect(res.status).toBe(403);
    expect(mocks.generateHTMLEmbeddings).not.toHaveBeenCalled();
  });

  it('400 on invalid JSON', async () => {
    const bad = new Request('http://test/api/ai-rag', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect((await addEmbeddingsHandler(bad)).status).toBe(400);
  });

  it('400 on schema failure', async () => {
    expect((await addEmbeddingsHandler(post({ mode: 'text' }))).status).toBe(400);
  });

  it('400 when courseId does not exist', async () => {
    mocks.courseExists.mockResolvedValueOnce(false);
    const res = await addEmbeddingsHandler(
      post({ mode: 'text', courseId: 99, sourcePath: 'd', html: LONG }),
    );
    expect(res.status).toBe(400);
    expect(mocks.generateHTMLEmbeddings).not.toHaveBeenCalled();
  });

  it('text mode → embeds and returns chunks', async () => {
    const res = await addEmbeddingsHandler(
      post({ mode: 'text', courseId: 2, sourcePath: 'doc-1', html: LONG }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, sourcePath: 'doc-1', chunks: 3 });
    expect(mocks.generateHTMLEmbeddings).toHaveBeenCalledWith({
      courseId: 2,
      sourcePath: 'doc-1',
      html: LONG,
    });
  });

  it('file mode (docx) → fetches, converts, embeds, records url', async () => {
    mocks.fetchMock.mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(8) });
    mocks.convertWordToHtml.mockResolvedValue(LONG);
    const res = await addEmbeddingsHandler(
      post({
        mode: 'file',
        courseId: 2,
        url: 'https://blob.vercel-storage.com/x.docx',
        fileName: 'x.docx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    );
    expect(res.status).toBe(200);
    expect(mocks.convertWordToHtml).toHaveBeenCalled();
    expect(mocks.generateHTMLEmbeddings).toHaveBeenCalledWith({
      courseId: 2,
      sourcePath: 'file-x.docx',
      html: LONG,
    });
    expect(mocks.upsertDocUrl).toHaveBeenCalledWith(
      2,
      'file-x.docx',
      'https://blob.vercel-storage.com/x.docx',
    );
  });

  it('file mode invalid mimeType → 400', async () => {
    mocks.fetchMock.mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(8) });
    const res = await addEmbeddingsHandler(
      post({
        mode: 'file',
        url: 'https://x/y.txt',
        fileName: 'y.txt',
        mimeType: 'text/plain',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('empty extracted text → 400', async () => {
    mocks.generateHTMLEmbeddings.mockResolvedValueOnce({ chunks: 0 });
    const res = await addEmbeddingsHandler(
      post({ mode: 'text', sourcePath: 'd', html: LONG }),
    );
    expect(res.status).toBe(400);
  });
});

describe('listEmbeddingsHandler (GET)', () => {
  it('403 when not admin', async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new mocks.ForbiddenError());
    const res = await listEmbeddingsHandler(new Request('http://test/api/ai-rag'));
    expect(res.status).toBe(403);
  });

  it('400 on invalid courseId param', async () => {
    const res = await listEmbeddingsHandler(
      new Request('http://test/api/ai-rag?courseId=abc'),
    );
    expect(res.status).toBe(400);
  });

  it('returns docs grouped by source (org-wide when omitted)', async () => {
    mocks.listDocsBySource.mockResolvedValue([{ sourcePath: 'd', count: 5 }]);
    const res = await listEmbeddingsHandler(new Request('http://test/api/ai-rag'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ docsBySource: [{ sourcePath: 'd', count: 5 }] });
    expect(mocks.listDocsBySource).toHaveBeenCalledWith(null);
  });
});

describe('deleteEmbeddingsHandler (DELETE)', () => {
  it('403 when not admin', async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new mocks.ForbiddenError());
    const res = await deleteEmbeddingsHandler(
      new Request('http://test/api/ai-rag', { method: 'DELETE', body: '{}' }),
    );
    expect(res.status).toBe(403);
  });

  it('400 when sourcePath missing', async () => {
    const res = await deleteEmbeddingsHandler(
      new Request('http://test/api/ai-rag', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ courseId: 1 }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('deletes docs, blob, and doc_urls', async () => {
    mocks.getDocUrls.mockResolvedValue([
      { url: 'https://blob.vercel-storage.com/x.pdf' },
      { url: 'https://example.com/not-blob' },
    ]);
    const res = await deleteEmbeddingsHandler(
      new Request('http://test/api/ai-rag', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ courseId: 2, sourcePath: 'file-x.pdf' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(mocks.deleteDocsBySource).toHaveBeenCalledWith(2, 'file-x.pdf');
    expect(mocks.del).toHaveBeenCalledTimes(1); // only the vercel blob url
    expect(mocks.del).toHaveBeenCalledWith('https://blob.vercel-storage.com/x.pdf');
    expect(mocks.deleteDocUrls).toHaveBeenCalledWith(2, 'file-x.pdf');
  });
});
