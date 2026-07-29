// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, getOnboardingProgress } = vi.hoisted(() => ({
  getSession: vi.fn(),
  getOnboardingProgress: vi.fn(),
}));
vi.mock('#/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('#/lib/onboarding-session.server', () => ({ getOnboardingProgress }));

import { onboardingProgressHandler } from '../status';

const post = (payload: unknown) =>
  new Request('http://test/api/course/onboarding/status', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'user-1' } });
  getOnboardingProgress.mockResolvedValue({ ok: true, status: 'not_started' });
});

describe('onboardingProgressHandler', () => {
  it('401 when not authenticated', async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await onboardingProgressHandler(post({ courseSlug: 'ppl' }));
    expect(res.status).toBe(401);
    expect(getOnboardingProgress).not.toHaveBeenCalled();
  });

  it('returns the status for the authed user', async () => {
    const res = await onboardingProgressHandler(post({ courseSlug: 'ppl' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'not_started' });
    expect(getOnboardingProgress).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', courseSlug: 'ppl' }),
    );
  });

  it('ignores a userId in the request body', async () => {
    // The property this pins: a client cannot read someone else's onboarding
    // status by naming them in the payload.
    const res = await onboardingProgressHandler(
      post({ courseSlug: 'ppl', userId: 'attacker' }),
    );
    expect(res.status).toBe(200);
    expect(getOnboardingProgress).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
    );
    expect(getOnboardingProgress).not.toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'attacker' }),
    );
  });

  it('404 when the course slug does not resolve', async () => {
    getOnboardingProgress.mockResolvedValueOnce({
      ok: false,
      reason: 'course_not_found',
    });
    const res = await onboardingProgressHandler(post({ courseSlug: 'nope' }));
    expect(res.status).toBe(404);
  });

  it('400 when courseSlug is missing', async () => {
    const res = await onboardingProgressHandler(post({}));
    expect(res.status).toBe(400);
    expect(getOnboardingProgress).not.toHaveBeenCalled();
  });

  it('400 when the body is not JSON', async () => {
    const res = await onboardingProgressHandler(
      new Request('http://test/api/course/onboarding/status', {
        method: 'POST',
        body: 'not json',
      }),
    );
    expect(res.status).toBe(400);
    expect(getOnboardingProgress).not.toHaveBeenCalled();
  });

  it('500 when getOnboardingProgress throws', async () => {
    getOnboardingProgress.mockRejectedValueOnce(new Error('db down'));
    const res = await onboardingProgressHandler(post({ courseSlug: 'ppl' }));
    expect(res.status).toBe(500);
  });
});
