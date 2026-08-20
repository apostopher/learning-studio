// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Fully stub admin-functions.server (see mocking rules: no importOriginal on
// internal #/-using modules). The route imports ForbiddenError from this same
// mocked path, so this stub class is what `instanceof` checks against.
const {
  requireCoursePermission,
  absentResourceResponse,
  ForbiddenError,
  getCourseIdForLessonId,
  getLessonMaterialByLessonId,
  upsertLessonMaterial,
} = vi.hoisted(() => {
  class ForbiddenError extends Error {
    constructor() {
      super('Forbidden');
      this.name = 'ForbiddenError';
    }
  }
  return {
    requireCoursePermission: vi.fn(),
    absentResourceResponse: vi.fn(),
    ForbiddenError,
    getCourseIdForLessonId: vi.fn(),
    getLessonMaterialByLessonId: vi.fn(),
    upsertLessonMaterial: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({ ForbiddenError }));
vi.mock('#/lib/permissions.server', () => ({
  requireCoursePermission,
  absentResourceResponse,
}));
vi.mock('#/db/lesson-access', () => ({ getCourseIdForLessonId }));
vi.mock('#/db/lesson', () => ({
  getLessonMaterialByLessonId,
  upsertLessonMaterial,
}));

import {
  getMaterialHandler,
  saveMaterialHandler,
} from '../lessons.$lessonId.material';

const material = { text: '<p>x</p>', keyPoints: [], proTips: '', quiz: [] };
function postReq(body: unknown): Request {
  return new Request('http://test/api/admin/lessons/1/material', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function getReq(): Request {
  return new Request('http://test/api/admin/lessons/1/material');
}

beforeEach(() => {
  vi.clearAllMocks();
  getCourseIdForLessonId.mockResolvedValue(42);
  requireCoursePermission.mockResolvedValue({ userId: 'u1' });
  // Stands in for the real helper (unit-tested in
  // lib/__tests__/permissions-server.test.ts): it answers 404 to someone on
  // the teaching side and a flat 403 to everyone else, so a missing row
  // cannot be used to enumerate ids.
  absentResourceResponse.mockResolvedValue(new Response(null, { status: 404 }));
});

describe('lessons material route', () => {
  it('GET asks for content:read scoped to the lesson’s course', async () => {
    getLessonMaterialByLessonId.mockResolvedValueOnce(null);
    await getMaterialHandler(getReq(), '1');
    expect(requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(),
      42,
      'content',
      'read',
    );
  });

  it('GET returns 403 for a refused actor, without reading the material', async () => {
    requireCoursePermission.mockRejectedValueOnce(new ForbiddenError());
    const res = await getMaterialHandler(getReq(), '1');
    expect(res.status).toBe(403);
    expect(getLessonMaterialByLessonId).not.toHaveBeenCalled();
  });

  /**
   * The enumeration oracle. This handler resolves the row BEFORE guarding, so
   * an unauthenticated caller could walk sequential integer ids and read the
   * id space off the status code — 404 absent, 403 present. The absent branch
   * is delegated to `absentResourceResponse`, which answers 404 only to
   * someone on the teaching side (unit-tested in
   * lib/__tests__/permissions-server.test.ts).
   */
  it('GET hands an absent lesson to absentResourceResponse and returns its answer', async () => {
    getCourseIdForLessonId.mockResolvedValueOnce(null);
    absentResourceResponse.mockResolvedValueOnce(
      new Response('Forbidden', { status: 403 }),
    );
    const request = getReq();

    const res = await getMaterialHandler(request, '999');

    expect(absentResourceResponse).toHaveBeenCalledWith(
      request.headers,
      'Lesson not found',
    );
    expect(res.status).toBe(403);
    expect(getLessonMaterialByLessonId).not.toHaveBeenCalled();
  });

  it('POST hands an absent lesson to absentResourceResponse and returns its answer', async () => {
    getCourseIdForLessonId.mockResolvedValueOnce(null);
    absentResourceResponse.mockResolvedValueOnce(
      new Response('Forbidden', { status: 403 }),
    );
    const request = postReq(material);

    const res = await saveMaterialHandler(request, '999');

    expect(absentResourceResponse).toHaveBeenCalledWith(
      request.headers,
      'Lesson not found',
    );
    expect(res.status).toBe(403);
    expect(upsertLessonMaterial).not.toHaveBeenCalled();
  });

  it('GET 404s a lesson that does not exist, before guarding', async () => {
    getCourseIdForLessonId.mockResolvedValueOnce(null);
    const res = await getMaterialHandler(getReq(), '999');
    expect(res.status).toBe(404);
    expect(requireCoursePermission).not.toHaveBeenCalled();
  });

  it('GET 400 on a bad lesson id', async () => {
    const res = await getMaterialHandler(getReq(), 'abc');
    expect(res.status).toBe(400);
    expect(getCourseIdForLessonId).not.toHaveBeenCalled();
  });

  it('GET returns the material row (or null)', async () => {
    getLessonMaterialByLessonId.mockResolvedValueOnce(null);
    const res = await getMaterialHandler(getReq(), '1');
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it('POST asks for content:update scoped to the lesson’s course', async () => {
    upsertLessonMaterial.mockResolvedValueOnce({ id: 7, ...material });
    await saveMaterialHandler(postReq(material), '1');
    expect(requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(),
      42,
      'content',
      'update',
    );
  });

  it('POST 403s a course manager (read-only on content) without writing', async () => {
    requireCoursePermission.mockRejectedValueOnce(new ForbiddenError());
    const res = await saveMaterialHandler(postReq(material), '1');
    expect(res.status).toBe(403);
    expect(upsertLessonMaterial).not.toHaveBeenCalled();
  });

  it('POST 404s a lesson that does not exist, before guarding or parsing the body', async () => {
    getCourseIdForLessonId.mockResolvedValueOnce(null);
    const res = await saveMaterialHandler(postReq(material), '999');
    expect(res.status).toBe(404);
    expect(requireCoursePermission).not.toHaveBeenCalled();
    expect(upsertLessonMaterial).not.toHaveBeenCalled();
  });

  it('POST 400 on an invalid body', async () => {
    expect((await saveMaterialHandler(postReq({ text: 5 }), '1')).status).toBe(
      400,
    );
  });

  it("POST 404 when the lesson doesn't exist", async () => {
    upsertLessonMaterial.mockResolvedValueOnce(null);
    expect((await saveMaterialHandler(postReq(material), '1')).status).toBe(
      404,
    );
  });

  it('POST upserts and returns the saved row', async () => {
    const saved = { id: 7, lessonSlug: 'l', ...material };
    upsertLessonMaterial.mockResolvedValueOnce(saved);
    const res = await saveMaterialHandler(postReq(material), '1');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(saved);
    expect(upsertLessonMaterial).toHaveBeenCalledWith(1, material);
  });

  it('POST 500 when upsertLessonMaterial rejects', async () => {
    upsertLessonMaterial.mockRejectedValueOnce(new Error('db down'));
    expect((await saveMaterialHandler(postReq(material), '1')).status).toBe(
      500,
    );
  });
});
