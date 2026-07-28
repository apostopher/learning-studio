// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, advanceOnboarding } = vi.hoisted(() => ({
  getSession: vi.fn(),
  advanceOnboarding: vi.fn(),
}));
vi.mock('#/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('#/lib/onboarding-session.server', () => ({ advanceOnboarding }));

import { startOnboardingHandler } from '../start';

const body = {
  status: 'awaiting_consent' as const,
  messages: [
    {
      id: 'onboarding-0',
      role: 'assistant' as const,
      parts: [{ type: 'text' as const, text: 'May I ask a few questions?' }],
    },
  ],
  updatedAt: '2026-07-28T00:00:00.000Z',
};

const post = (payload: unknown) =>
  new Request('http://test/api/course/onboarding/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'user-1' } });
  advanceOnboarding.mockResolvedValue({ ok: true, body });
});

describe('startOnboardingHandler', () => {
  it('401 when not authenticated', async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await startOnboardingHandler(post({ courseSlug: 'ppl' }));
    expect(res.status).toBe(401);
    expect(advanceOnboarding).not.toHaveBeenCalled();
  });

  it('starts the session for the authed user and returns the turn', async () => {
    const res = await startOnboardingHandler(post({ courseSlug: 'ppl' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(body);
    expect(advanceOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', courseSlug: 'ppl' }),
    );
  });

  it('sends no event, so the machine only runs to its settled state', async () => {
    await startOnboardingHandler(post({ courseSlug: 'ppl' }));
    expect(advanceOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({ event: null }),
    );
  });

  it('ignores a userId in the request body', async () => {
    // The property this pins: a client cannot start (or resume) someone
    // else's onboarding by naming them in the payload.
    const res = await startOnboardingHandler(
      post({ courseSlug: 'ppl', userId: 'attacker' }),
    );
    expect(res.status).toBe(200);
    expect(advanceOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
    );
    expect(advanceOnboarding).not.toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'attacker' }),
    );
  });

  it('404 when the course slug does not resolve', async () => {
    advanceOnboarding.mockResolvedValueOnce({
      ok: false,
      reason: 'course_not_found',
    });
    const res = await startOnboardingHandler(post({ courseSlug: 'nope' }));
    expect(res.status).toBe(404);
  });

  it('400 when courseSlug is missing', async () => {
    const res = await startOnboardingHandler(post({}));
    expect(res.status).toBe(400);
    expect(advanceOnboarding).not.toHaveBeenCalled();
  });

  it('400 when the body is not JSON', async () => {
    const res = await startOnboardingHandler(
      new Request('http://test/api/course/onboarding/start', {
        method: 'POST',
        body: 'not json',
      }),
    );
    expect(res.status).toBe(400);
    expect(advanceOnboarding).not.toHaveBeenCalled();
  });

  it('500 when the turn throws', async () => {
    advanceOnboarding.mockRejectedValueOnce(new Error('model down'));
    const res = await startOnboardingHandler(post({ courseSlug: 'ppl' }));
    expect(res.status).toBe(500);
  });
});
