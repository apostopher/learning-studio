// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getSession,
  getCourseIdentityBySlug,
  getCurrentLevel,
  getUnacknowledgedAdminChange,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  getCourseIdentityBySlug: vi.fn(),
  getCurrentLevel: vi.fn(),
  getUnacknowledgedAdminChange: vi.fn(),
}));
vi.mock('#/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('#/db/course', () => ({ getCourseIdentityBySlug }));
vi.mock('#/db/user-levels', () => ({
  getCurrentLevel,
  getUnacknowledgedAdminChange,
}));

import { getMyLevelHandler } from '../my-level';

function req(url: string): Request {
  return new Request(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'user-1' } });
  getCourseIdentityBySlug.mockResolvedValue({ id: 7, name: 'Course' });
  getCurrentLevel.mockResolvedValue('basic');
  getUnacknowledgedAdminChange.mockResolvedValue(null);
});

describe('getMyLevelHandler', () => {
  it('401 when not authenticated', async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await getMyLevelHandler(
      req('http://test/api/user/my-level?slug=c1'),
    );
    expect(res.status).toBe(401);
    expect(getCurrentLevel).not.toHaveBeenCalled();
  });

  it('400 when slug is missing', async () => {
    const res = await getMyLevelHandler(req('http://test/api/user/my-level'));
    expect(res.status).toBe(400);
    expect(getCourseIdentityBySlug).not.toHaveBeenCalled();
  });

  it('404 when the course does not exist', async () => {
    getCourseIdentityBySlug.mockResolvedValueOnce(null);
    const res = await getMyLevelHandler(
      req('http://test/api/user/my-level?slug=nope'),
    );
    expect(res.status).toBe(404);
    expect(getCurrentLevel).not.toHaveBeenCalled();
  });

  it('reads the level and pending change scoped to the session user, not a client-supplied id', async () => {
    const res = await getMyLevelHandler(
      req('http://test/api/user/my-level?slug=c1'),
    );
    expect(res.status).toBe(200);
    expect(getCourseIdentityBySlug).toHaveBeenCalledWith('c1');
    expect(getCurrentLevel).toHaveBeenCalledWith('user-1', 7);
    expect(getUnacknowledgedAdminChange).toHaveBeenCalledWith('user-1', 7);
    expect(await res.json()).toEqual({ level: 'basic', pendingChange: null });
  });

  it('surfaces an unacknowledged admin change as pendingChange', async () => {
    getUnacknowledgedAdminChange.mockResolvedValueOnce({
      id: 42,
      level: 'advanced',
      message: 'Nice flying at the fly-in.',
      userId: 'user-1',
      courseId: 7,
      source: 'admin',
      acknowledgedAt: null,
    });
    const res = await getMyLevelHandler(
      req('http://test/api/user/my-level?slug=c1'),
    );
    expect(await res.json()).toEqual({
      level: 'basic',
      pendingChange: {
        id: 42,
        level: 'advanced',
        message: 'Nice flying at the fly-in.',
      },
    });
  });
});
