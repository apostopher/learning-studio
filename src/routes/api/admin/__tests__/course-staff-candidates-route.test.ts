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
    requireCoursePermission: vi.fn(),
    searchStaffCandidates: vi.fn(),
  };
});

vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/lib/permissions.server', () => ({
  requireCoursePermission: m.requireCoursePermission,
}));
vi.mock('#/db/users', () => ({
  searchStaffCandidates: m.searchStaffCandidates,
}));

import { getCourseStaffCandidatesHandler } from '../courses.$courseId.staff.candidates';

const SME = {
  userId: 's1',
  roles: [],
  courseRoles: ['subject-expert'],
  permissions: new Set(['staff:read', 'staff:create']),
  isOwner: false,
};

const MATCHES = [
  { userId: 'u3', email: 'sam@example.com', firstName: 'Sam', lastName: 'Lee' },
];

function req(query?: string): Request {
  const url = new URL('http://t/api/admin/courses/7/staff/candidates');
  if (query !== undefined) url.searchParams.set('q', query);
  return new Request(url, { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.requireCoursePermission.mockResolvedValue(SME);
  m.searchStaffCandidates.mockResolvedValue(MATCHES);
});

describe('GET /api/admin/courses/:courseId/staff/candidates', () => {
  /**
   * The same authority as the appointment itself. Guarding on anything else —
   * `user:read` in particular, which is what the picker used to go through —
   * makes the lookup narrower than the act it feeds, which is how a subject
   * expert ended up with an assign form and nobody to pick.
   */
  it('asks for staff:create on THIS course', async () => {
    await getCourseStaffCandidatesHandler(req('sam'), '7');

    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(),
      7,
      'staff',
      'create',
    );
  });

  it('answers a subject expert with the matches', async () => {
    const res = await getCourseStaffCandidatesHandler(req('sam'), '7');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(MATCHES);
    expect(m.searchStaffCandidates).toHaveBeenCalledWith('sam');
  });

  it('403s someone without staff:create on that course, without searching', async () => {
    m.requireCoursePermission.mockRejectedValueOnce(new m.ForbiddenError());

    const res = await getCourseStaffCandidatesHandler(req('sam'), '7');

    expect(res.status).toBe(403);
    expect(m.searchStaffCandidates).not.toHaveBeenCalled();
  });

  /**
   * This route reaches every account in the org, and is open to anyone
   * staffing any one course — a wider audience than the People screen. "Hand
   * me the directory" must not be askable.
   */
  it('refuses an absent search term', async () => {
    const res = await getCourseStaffCandidatesHandler(req(), '7');

    expect(res.status).toBe(400);
    expect(m.searchStaffCandidates).not.toHaveBeenCalled();
  });

  it('refuses a one-character term', async () => {
    const res = await getCourseStaffCandidatesHandler(req('a'), '7');

    expect(res.status).toBe(400);
    expect(m.searchStaffCandidates).not.toHaveBeenCalled();
  });

  it('refuses whitespace dressed up as a term', async () => {
    const res = await getCourseStaffCandidatesHandler(req('    '), '7');

    expect(res.status).toBe(400);
    expect(m.searchStaffCandidates).not.toHaveBeenCalled();
  });

  /**
   * Order matters: an unauthorised caller must not learn the route's
   * parameters by probing it with a bad one.
   */
  it('checks authority before it checks the term', async () => {
    m.requireCoursePermission.mockRejectedValueOnce(new m.ForbiddenError());

    const res = await getCourseStaffCandidatesHandler(req(), '7');

    expect(res.status).toBe(403);
  });

  it('400s an unparseable course id before guarding', async () => {
    const res = await getCourseStaffCandidatesHandler(req('sam'), 'nope');

    expect(res.status).toBe(400);
    expect(m.requireCoursePermission).not.toHaveBeenCalled();
  });

  it('rethrows a non-ForbiddenError failure', async () => {
    m.requireCoursePermission.mockRejectedValueOnce(new Error('db down'));

    await expect(
      getCourseStaffCandidatesHandler(req('sam'), '7'),
    ).rejects.toThrow('db down');
  });
});
