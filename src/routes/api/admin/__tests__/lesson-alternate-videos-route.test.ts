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
    requireLessonContentPermission: vi.fn(),
    absentResourceResponse: vi.fn(),
    getDisciplineIdForLessonId: vi.fn(),
    getLessonAlternateVideos: vi.fn(),
    setLessonAlternateVideo: vi.fn(),
    removeLessonAlternateVideo: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/lib/permissions.server', () => ({
  requireLessonContentPermission: m.requireLessonContentPermission,
  absentResourceResponse: m.absentResourceResponse,
}));
vi.mock('#/db/lesson-access', () => ({
  getDisciplineIdForLessonId: m.getDisciplineIdForLessonId,
}));
vi.mock('#/db/admin', () => ({
  getLessonAlternateVideos: m.getLessonAlternateVideos,
  setLessonAlternateVideo: m.setLessonAlternateVideo,
  removeLessonAlternateVideo: m.removeLessonAlternateVideo,
}));

import {
  deleteAlternateVideoHandler,
  getAlternateVideosHandler,
  putAlternateVideoHandler,
} from '../lessons.$lessonId.alternate-videos';

const json = (method: string, body: unknown) =>
  new Request('http://test/api/admin/lessons/10/alternate-videos', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const entry = { lang: 'fr-CA', provider: 'synthesia', ref: 'e9eecce0' };

beforeEach(() => {
  vi.clearAllMocks();
  m.getDisciplineIdForLessonId.mockResolvedValue({
    found: true,
    disciplineId: 7,
  });
  m.requireLessonContentPermission.mockResolvedValue(undefined);
  m.absentResourceResponse.mockResolvedValue(
    new Response(null, { status: 404 }),
  );
  m.getLessonAlternateVideos.mockResolvedValue([entry]);
  m.setLessonAlternateVideo.mockResolvedValue({ id: 10 });
  m.removeLessonAlternateVideo.mockResolvedValue({ id: 10 });
});

describe('GET', () => {
  it("lists the alternates under content:read on the lesson's discipline", async () => {
    const res = await getAlternateVideosHandler(
      new Request('http://test/x'),
      '10',
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([entry]);
    expect(m.requireLessonContentPermission).toHaveBeenCalledWith(
      expect.anything(),
      7,
      'read',
    );
  });
});

describe('PUT', () => {
  it('upserts a valid entry under content:update', async () => {
    const res = await putAlternateVideoHandler(json('PUT', entry), '10');
    expect(res.status).toBe(200);
    expect(m.setLessonAlternateVideo).toHaveBeenCalledWith(10, entry);
    expect(m.requireLessonContentPermission).toHaveBeenCalledWith(
      expect.anything(),
      7,
      'update',
    );
  });

  it('400s an unknown lang or provider without writing', async () => {
    const res = await putAlternateVideoHandler(
      json('PUT', { ...entry, lang: 'FR' }),
      '10',
    );
    expect(res.status).toBe(400);
    expect(m.setLessonAlternateVideo).not.toHaveBeenCalled();
  });

  it('403s without permission', async () => {
    m.requireLessonContentPermission.mockRejectedValueOnce(
      new m.ForbiddenError(),
    );
    const res = await putAlternateVideoHandler(json('PUT', entry), '10');
    expect(res.status).toBe(403);
    expect(m.setLessonAlternateVideo).not.toHaveBeenCalled();
  });
});

describe('DELETE', () => {
  it('removes by lang', async () => {
    const res = await deleteAlternateVideoHandler(
      json('DELETE', { lang: 'fr-CA' }),
      '10',
    );
    expect(res.status).toBe(200);
    expect(m.removeLessonAlternateVideo).toHaveBeenCalledWith(10, 'fr-CA');
  });

  it('404s an unknown lesson', async () => {
    m.getDisciplineIdForLessonId.mockResolvedValueOnce({ found: false });
    const res = await deleteAlternateVideoHandler(
      json('DELETE', { lang: 'fr-CA' }),
      '10',
    );
    expect(res.status).toBe(404);
  });
});
