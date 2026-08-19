// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getSession,
  getCourseIdentityBySlug,
  getCurrentLevel,
  getUnacknowledgedLevelChange,
  isSubscribedToCourse,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  getCourseIdentityBySlug: vi.fn(),
  getCurrentLevel: vi.fn(),
  getUnacknowledgedLevelChange: vi.fn(),
  isSubscribedToCourse: vi.fn(),
}));
vi.mock('#/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('#/db/course', () => ({ getCourseIdentityBySlug }));
vi.mock('#/db/lesson-access', () => ({ isSubscribedToCourse }));
vi.mock('#/db/user-levels', () => ({
  getCurrentLevel,
  getUnacknowledgedLevelChange,
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
  getUnacknowledgedLevelChange.mockResolvedValue(null);
  isSubscribedToCourse.mockResolvedValue(true);
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

  /**
   * An unknown slug and a real course the caller is not enrolled in must be
   * INDISTINGUISHABLE. A 404 for one and a 200 for the other turns this
   * endpoint into a catalogue-enumeration oracle for any signed-in caller —
   * the exact thing `course.$courseSlug.tsx` redirects both cases to `/app` to
   * avoid.
   */
  it('403s an unknown course, revealing nothing about whether it exists', async () => {
    getCourseIdentityBySlug.mockResolvedValueOnce(null);
    const res = await getMyLevelHandler(
      req('http://test/api/user/my-level?slug=nope'),
    );
    expect(res.status).toBe(403);
    expect(getCurrentLevel).not.toHaveBeenCalled();
  });

  it('403s a real course the caller is not subscribed to, identically', async () => {
    isSubscribedToCourse.mockResolvedValueOnce(false);
    const res = await getMyLevelHandler(
      req('http://test/api/user/my-level?slug=someone-elses'),
    );
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('Forbidden');
    expect(getCurrentLevel).not.toHaveBeenCalled();
  });

  it('reads the level and pending change scoped to the session user, not a client-supplied id', async () => {
    const res = await getMyLevelHandler(
      req('http://test/api/user/my-level?slug=c1'),
    );
    expect(res.status).toBe(200);
    expect(getCourseIdentityBySlug).toHaveBeenCalledWith('c1');
    expect(getCurrentLevel).toHaveBeenCalledWith('user-1', 7);
    expect(getUnacknowledgedLevelChange).toHaveBeenCalledWith('user-1', 7);
    expect(await res.json()).toEqual({ level: 'basic', pendingChange: null });
  });

  it('surfaces an unacknowledged admin change as pendingChange, carrying its message and source', async () => {
    getUnacknowledgedLevelChange.mockResolvedValueOnce({
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
        source: 'admin',
      },
    });
  });

  // The addition this task makes: a silently-earned promotion (from the
  // sendBeacon video-progress path, which has no readable response) must
  // surface here on the pilot's next load the same way an admin change does.
  it('surfaces an unacknowledged earned promotion as pendingChange, with a null message', async () => {
    getCurrentLevel.mockResolvedValueOnce('intermediate');
    getUnacknowledgedLevelChange.mockResolvedValueOnce({
      id: 43,
      level: 'intermediate',
      message: null,
      userId: 'user-1',
      courseId: 7,
      source: 'earned',
      acknowledgedAt: null,
    });
    const res = await getMyLevelHandler(
      req('http://test/api/user/my-level?slug=c1'),
    );
    expect(await res.json()).toEqual({
      level: 'intermediate',
      pendingChange: {
        id: 43,
        level: 'intermediate',
        message: null,
        source: 'earned',
      },
    });
  });
});
