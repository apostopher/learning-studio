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
    listCourseNewsSources: vi.fn(),
    createNewsSource: vi.fn(),
    updateNewsSource: vi.fn(),
    deleteNewsSource: vi.fn(),
    reorderNewsSource: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  requireAdmin: m.requireAdmin,
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/db/news-sources', () => ({
  listCourseNewsSources: m.listCourseNewsSources,
  createNewsSource: m.createNewsSource,
  updateNewsSource: m.updateNewsSource,
  deleteNewsSource: m.deleteNewsSource,
  reorderNewsSource: m.reorderNewsSource,
}));

import {
  getNewsSourcesHandler,
  postNewsSourceHandler,
} from '../courses.$courseId.news-sources';
import {
  deleteNewsSourceHandler,
  patchNewsSourceHandler,
} from '../courses.$courseId.news-sources.$sourceId';

const SOURCE = {
  id: 7,
  courseId: 1,
  name: 'AVweb',
  url: 'https://www.avweb.com/',
  imageUrlAvif: null,
  imageUrlWebp: null,
  tintColor: null,
  active: true,
  rank: 1,
};

const jsonReq = (method: 'POST' | 'PATCH', body: unknown): Request =>
  new Request('http://test/api/admin/courses/1/news-sources', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  m.requireAdmin.mockResolvedValue({ userId: 'u1', roles: ['admin'] });
});

describe('getNewsSourcesHandler', () => {
  it('403 when not admin', async () => {
    m.requireAdmin.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await getNewsSourcesHandler(new Request('http://t'), '1');
    expect(res.status).toBe(403);
    expect(m.listCourseNewsSources).not.toHaveBeenCalled();
  });

  it('400 on an invalid course id', async () => {
    const res = await getNewsSourcesHandler(new Request('http://t'), 'abc');
    expect(res.status).toBe(400);
    expect(m.listCourseNewsSources).not.toHaveBeenCalled();
  });

  it('scopes the query to the course in the path', async () => {
    m.listCourseNewsSources.mockResolvedValue([SOURCE]);
    const res = await getNewsSourcesHandler(new Request('http://t'), '42');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([SOURCE]);
    expect(m.listCourseNewsSources).toHaveBeenCalledWith(42);
  });
});

describe('postNewsSourceHandler', () => {
  it('403 when not admin', async () => {
    m.requireAdmin.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await postNewsSourceHandler(
      jsonReq('POST', { name: 'AVweb', url: 'https://www.avweb.com/' }),
      '1',
    );
    expect(res.status).toBe(403);
    expect(m.createNewsSource).not.toHaveBeenCalled();
  });

  it('400 on malformed JSON', async () => {
    const req = new Request('http://t', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not json',
    });
    const res = await postNewsSourceHandler(req, '1');
    expect(res.status).toBe(400);
    expect(m.createNewsSource).not.toHaveBeenCalled();
  });

  it('passes the validated input through to the writer', async () => {
    m.createNewsSource.mockResolvedValue({ ok: true, source: SOURCE });
    const res = await postNewsSourceHandler(
      jsonReq('POST', {
        name: '  AVweb  ',
        url: '  https://www.avweb.com/  ',
        tintColor: '',
      }),
      '1',
    );
    expect(res.status).toBe(201);
    // Assert on what the writer RECEIVED: trimmed name/url, and an empty tint
    // normalized away rather than stored as ''.
    expect(m.createNewsSource).toHaveBeenCalledWith(1, {
      name: 'AVweb',
      url: 'https://www.avweb.com/',
      tintColor: undefined,
      imageUrlAvif: undefined,
      imageUrlWebp: undefined,
    });
  });

  it('rejects a private-host URL before it reaches the writer', async () => {
    const res = await postNewsSourceHandler(
      jsonReq('POST', {
        name: 'Metadata',
        url: 'http://169.254.169.254/latest/meta-data/',
      }),
      '1',
    );
    expect(res.status).toBe(400);
    expect(m.createNewsSource).not.toHaveBeenCalled();
  });

  it('maps a duplicate URL to 409 naming the url field', async () => {
    m.createNewsSource.mockResolvedValue({
      ok: false,
      reason: 'duplicate_url',
    });
    const res = await postNewsSourceHandler(
      jsonReq('POST', { name: 'AVweb', url: 'https://www.avweb.com/' }),
      '1',
    );
    expect(res.status).toBe(409);
    // The field name is what lets the form mark the offending input instead of
    // firing an anonymous toast.
    expect(await res.json()).toMatchObject({ field: 'url' });
  });
});

describe('patchNewsSourceHandler', () => {
  it('403 when not admin', async () => {
    m.requireAdmin.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await patchNewsSourceHandler(
      jsonReq('PATCH', { prevSourceId: 1, nextSourceId: null }),
      '1',
      '7',
    );
    expect(res.status).toBe(403);
    expect(m.reorderNewsSource).not.toHaveBeenCalled();
    expect(m.updateNewsSource).not.toHaveBeenCalled();
  });

  it('routes a neighbour payload to the reorder writer, not the field writer', async () => {
    m.reorderNewsSource.mockResolvedValue({ id: 7, rank: 1.5 });
    const res = await patchNewsSourceHandler(
      jsonReq('PATCH', { prevSourceId: 3, nextSourceId: 4 }),
      '1',
      '7',
    );
    expect(res.status).toBe(200);
    expect(m.updateNewsSource).not.toHaveBeenCalled();
    expect(m.reorderNewsSource).toHaveBeenCalledWith({
      courseId: 1,
      sourceId: 7,
      prevSourceId: 3,
      nextSourceId: 4,
    });
  });

  it('404s a reorder whose neighbour is not in this course', async () => {
    m.reorderNewsSource.mockResolvedValue(null);
    const res = await patchNewsSourceHandler(
      jsonReq('PATCH', { prevSourceId: 999, nextSourceId: null }),
      '1',
      '7',
    );
    expect(res.status).toBe(404);
  });

  it('rejects a reorder with both neighbours null', async () => {
    const res = await patchNewsSourceHandler(
      jsonReq('PATCH', { prevSourceId: null, nextSourceId: null }),
      '1',
      '7',
    );
    expect(res.status).toBe(400);
    expect(m.reorderNewsSource).not.toHaveBeenCalled();
  });

  it('routes a field payload to the field writer with both path ids', async () => {
    m.updateNewsSource.mockResolvedValue({ ok: true, source: SOURCE });
    const res = await patchNewsSourceHandler(
      jsonReq('PATCH', {
        name: 'AVweb',
        url: 'https://www.avweb.com/',
        active: false,
      }),
      '1',
      '7',
    );
    expect(res.status).toBe(200);
    expect(m.reorderNewsSource).not.toHaveBeenCalled();
    expect(m.updateNewsSource).toHaveBeenCalledWith(
      1,
      7,
      expect.objectContaining({ name: 'AVweb', active: false }),
    );
  });

  it('maps a duplicate URL on edit to 409 naming the url field', async () => {
    m.updateNewsSource.mockResolvedValue({
      ok: false,
      reason: 'duplicate_url',
    });
    const res = await patchNewsSourceHandler(
      jsonReq('PATCH', { name: 'AVweb', url: 'https://www.avweb.com/' }),
      '1',
      '7',
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ field: 'url' });
  });

  it('404s when the source belongs to another course', async () => {
    m.updateNewsSource.mockResolvedValue({ ok: false, reason: 'not_found' });
    const res = await patchNewsSourceHandler(
      jsonReq('PATCH', { name: 'AVweb', url: 'https://www.avweb.com/' }),
      '1',
      '7',
    );
    expect(res.status).toBe(404);
  });
});

describe('deleteNewsSourceHandler', () => {
  it('403 when not admin', async () => {
    m.requireAdmin.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await deleteNewsSourceHandler(new Request('http://t'), '1', '7');
    expect(res.status).toBe(403);
    expect(m.deleteNewsSource).not.toHaveBeenCalled();
  });

  it('deletes scoped to both the course and the source', async () => {
    m.deleteNewsSource.mockResolvedValue(true);
    const res = await deleteNewsSourceHandler(new Request('http://t'), '1', '7');
    expect(res.status).toBe(204);
    expect(m.deleteNewsSource).toHaveBeenCalledWith(1, 7);
  });

  it('404s when nothing matched', async () => {
    m.deleteNewsSource.mockResolvedValue(false);
    const res = await deleteNewsSourceHandler(new Request('http://t'), '1', '7');
    expect(res.status).toBe(404);
  });
});
