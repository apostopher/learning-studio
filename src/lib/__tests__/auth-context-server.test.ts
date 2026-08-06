// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  ensureUserProfile: vi.fn(),
  getUserRoleNames: vi.fn(),
}));
vi.mock('#/lib/auth', () => ({ auth: { api: { getSession: m.getSession } } }));
vi.mock('#/db/user-profile', () => ({
  ensureUserProfile: m.ensureUserProfile,
}));
vi.mock('#/db/user-roles', () => ({ getUserRoleNames: m.getUserRoleNames }));

import { resolveAuthContext } from '#/lib/auth-context.server';

const HEADERS = new Headers();

beforeEach(() => {
  vi.clearAllMocks();
  m.getSession.mockResolvedValue({
    user: { id: 'user-1', email: 'pilot@example.com' },
  });
  m.ensureUserProfile.mockResolvedValue(undefined);
  m.getUserRoleNames.mockResolvedValue([]);
});

/**
 * The repair only works if it is actually handed this session's user, which
 * nothing downstream reveals — `getUserRoleNames` returns `[]` both for "no
 * profile" and "no roles". So these assert the arguments the collaborator
 * received rather than the shape of the returned context.
 */
describe('resolveAuthContext', () => {
  it("hands the session's user to the profile ensure", async () => {
    await resolveAuthContext(HEADERS);

    expect(m.ensureUserProfile).toHaveBeenCalledWith(
      'user-1',
      'pilot@example.com',
    );
  });

  it('ensures the profile BEFORE reading roles', async () => {
    const order: string[] = [];
    m.ensureUserProfile.mockImplementation(async () => {
      order.push('ensure');
    });
    m.getUserRoleNames.mockImplementation(async () => {
      order.push('roles');
      return [];
    });

    await resolveAuthContext(HEADERS);

    // getUserRoleNames joins user_profiles: run it first and a freshly
    // repaired admin reads back as having no roles, silently losing access
    // for that request.
    expect(order).toEqual(['ensure', 'roles']);
  });

  it('does not touch the database without a session', async () => {
    m.getSession.mockResolvedValueOnce(null);

    const result = await resolveAuthContext(HEADERS);

    expect(m.ensureUserProfile).not.toHaveBeenCalled();
    expect(m.getUserRoleNames).not.toHaveBeenCalled();
    expect(result).toEqual({ session: null, roles: [] });
  });

  it('still returns roles when the profile ensure fails', async () => {
    m.ensureUserProfile.mockRejectedValueOnce(new Error('db down'));
    m.getUserRoleNames.mockResolvedValueOnce(['admin']);

    const result = await resolveAuthContext(HEADERS);

    // This is the fallback path, not the primary one — a transient write
    // error must not take down every authenticated page load.
    expect(result.roles).toEqual(['admin']);
  });

  it('falls back to no roles when the role lookup fails', async () => {
    m.getUserRoleNames.mockRejectedValueOnce(new Error('db down'));

    const result = await resolveAuthContext(HEADERS);

    expect(result.roles).toEqual([]);
  });
});
