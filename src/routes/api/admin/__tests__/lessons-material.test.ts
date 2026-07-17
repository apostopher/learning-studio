// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

// Fully stub admin-functions.server (see mocking rules: no importOriginal on
// internal @/-using modules). The route imports ForbiddenError from this same
// mocked path, so this stub class is what `instanceof` checks against.
const {
  requireAdmin,
  ForbiddenError,
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
    requireAdmin: vi.fn(),
    ForbiddenError,
    getLessonMaterialByLessonId: vi.fn(),
    upsertLessonMaterial: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  requireAdmin,
  ForbiddenError,
}));
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

describe('lessons material route', () => {
  it('GET returns 403 for a non-admin', async () => {
    requireAdmin.mockRejectedValueOnce(new ForbiddenError());
    expect((await getMaterialHandler(getReq(), '1')).status).toBe(403);
  });

  it('GET 400 on a bad lesson id', async () => {
    requireAdmin.mockResolvedValueOnce({ userId: 'u', roles: ['admin'] });
    expect((await getMaterialHandler(getReq(), 'abc')).status).toBe(400);
  });

  it('GET returns the material row (or null)', async () => {
    requireAdmin.mockResolvedValueOnce({ userId: 'u', roles: ['admin'] });
    getLessonMaterialByLessonId.mockResolvedValueOnce(null);
    const res = await getMaterialHandler(getReq(), '1');
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it('POST 400 on an invalid body', async () => {
    requireAdmin.mockResolvedValueOnce({ userId: 'u', roles: ['admin'] });
    expect((await saveMaterialHandler(postReq({ text: 5 }), '1')).status).toBe(
      400,
    );
  });

  it("POST 404 when the lesson doesn't exist", async () => {
    requireAdmin.mockResolvedValueOnce({ userId: 'u', roles: ['admin'] });
    upsertLessonMaterial.mockResolvedValueOnce(null);
    expect((await saveMaterialHandler(postReq(material), '1')).status).toBe(
      404,
    );
  });

  it('POST upserts and returns the saved row', async () => {
    requireAdmin.mockResolvedValueOnce({ userId: 'u', roles: ['admin'] });
    const saved = { id: 7, lessonSlug: 'l', ...material };
    upsertLessonMaterial.mockResolvedValueOnce(saved);
    const res = await saveMaterialHandler(postReq(material), '1');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(saved);
    expect(upsertLessonMaterial).toHaveBeenCalledWith(1, material);
  });
});
