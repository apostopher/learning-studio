// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, deleteOnboardingSession } = vi.hoisted(() => ({
  getSession: vi.fn(),
  deleteOnboardingSession: vi.fn(),
}));
vi.mock('#/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('#/lib/onboarding-session.server', () => ({ deleteOnboardingSession }));

import { deleteOnboardingHandler } from '../delete';

const post = (payload: unknown) =>
  new Request('http://test/api/course/onboarding/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'user-1' } });
  deleteOnboardingSession.mockResolvedValue({ ok: true });
});

describe('deleteOnboardingHandler', () => {
  it('401 when not authenticated', async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await deleteOnboardingHandler(post({ courseSlug: 'ppl' }));
    expect(res.status).toBe(401);
    expect(deleteOnboardingSession).not.toHaveBeenCalled();
  });

  it('deletes only the authed user’s session', async () => {
    const res = await deleteOnboardingHandler(post({ courseSlug: 'ppl' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(deleteOnboardingSession).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', courseSlug: 'ppl' }),
    );
  });

  it('ignores a userId in the request body', async () => {
    // The property this pins, and the one that matters most on a destructive
    // route: a client cannot delete another user's onboarding data by naming
    // them in the payload.
    const res = await deleteOnboardingHandler(
      post({ courseSlug: 'x', userId: 'attacker' }),
    );
    expect(res.status).toBe(200);
    expect(deleteOnboardingSession).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
    );
    expect(deleteOnboardingSession).not.toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'attacker' }),
    );
  });

  it('404 when the course slug does not resolve', async () => {
    deleteOnboardingSession.mockResolvedValueOnce({ ok: false });
    const res = await deleteOnboardingHandler(post({ courseSlug: 'nope' }));
    expect(res.status).toBe(404);
  });

  it('400 when courseSlug is missing', async () => {
    const res = await deleteOnboardingHandler(post({}));
    expect(res.status).toBe(400);
    expect(deleteOnboardingSession).not.toHaveBeenCalled();
  });

  it('400 when the body is not JSON', async () => {
    const res = await deleteOnboardingHandler(
      new Request('http://test/api/course/onboarding/delete', {
        method: 'POST',
        body: 'not json',
      }),
    );
    expect(res.status).toBe(400);
    expect(deleteOnboardingSession).not.toHaveBeenCalled();
  });

  it('500 when the delete throws', async () => {
    deleteOnboardingSession.mockRejectedValueOnce(new Error('db down'));
    const res = await deleteOnboardingHandler(post({ courseSlug: 'ppl' }));
    expect(res.status).toBe(500);
  });
});
