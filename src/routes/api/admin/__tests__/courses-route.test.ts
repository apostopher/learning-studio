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
    requirePermission: vi.fn(),
    listAdminCourses: vi.fn(),
    createCourse: vi.fn(),
    getActiveOrgId: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/lib/permissions.server', () => ({
  requirePermission: m.requirePermission,
}));
vi.mock('#/db/admin', () => ({
  listAdminCourses: m.listAdminCourses,
  createCourse: m.createCourse,
}));
vi.mock('#/lib/active-org.server', () => ({
  getActiveOrgId: m.getActiveOrgId,
}));

import { createCourseHandler, listAdminCoursesHandler } from '../courses';

const COURSES = [{ id: 1, name: 'PPL' }];
const NEW_COURSE = { id: 2, name: 'CPL' };

function getReq(): Request {
  return new Request('http://t/api/admin/courses', { method: 'GET' });
}

function postReq(body: unknown = { name: 'CPL' }): Request {
  return new Request('http://t/api/admin/courses', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.requirePermission.mockResolvedValue({ userId: 'u1' });
  m.listAdminCourses.mockResolvedValue(COURSES);
  m.createCourse.mockResolvedValue(NEW_COURSE);
  m.getActiveOrgId.mockReturnValue(1);
});

describe('listAdminCoursesHandler', () => {
  it('asks for course:read — org-level, not per-course', async () => {
    await listAdminCoursesHandler(getReq());
    expect(m.requirePermission).toHaveBeenCalledWith(
      expect.anything(),
      'course',
      'read',
    );
  });

  it('returns the list on success', async () => {
    const res = await listAdminCoursesHandler(getReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(COURSES);
  });

  it('403s when refused, without listing courses', async () => {
    m.requirePermission.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await listAdminCoursesHandler(getReq());
    expect(res.status).toBe(403);
    expect(m.listAdminCourses).not.toHaveBeenCalled();
  });

  it('rethrows non-ForbiddenError failures', async () => {
    m.requirePermission.mockRejectedValueOnce(new Error('db down'));
    await expect(listAdminCoursesHandler(getReq())).rejects.toThrow('db down');
  });
});

describe('createCourseHandler', () => {
  it('asks for course:create — org-level, not per-course', async () => {
    await createCourseHandler(postReq());
    expect(m.requirePermission).toHaveBeenCalledWith(
      expect.anything(),
      'course',
      'create',
    );
  });

  it('creates the course on success', async () => {
    const res = await createCourseHandler(postReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(NEW_COURSE);
    expect(m.createCourse).toHaveBeenCalledWith({ name: 'CPL' }, 1);
  });

  it('403s when refused, without creating a course', async () => {
    m.requirePermission.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await createCourseHandler(postReq());
    expect(res.status).toBe(403);
    expect(m.createCourse).not.toHaveBeenCalled();
  });

  it('400s invalid JSON before it would ever be persisted', async () => {
    const req = new Request('http://t/api/admin/courses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    const res = await createCourseHandler(req);
    expect(res.status).toBe(400);
    expect(m.createCourse).not.toHaveBeenCalled();
  });

  it('400s a body that fails schema validation', async () => {
    const res = await createCourseHandler(postReq({}));
    expect(res.status).toBe(400);
    expect(m.createCourse).not.toHaveBeenCalled();
  });
});
