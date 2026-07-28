// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, advanceOnboarding } = vi.hoisted(() => ({
  getSession: vi.fn(),
  advanceOnboarding: vi.fn(),
}));
vi.mock('#/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('#/lib/onboarding-session.server', () => ({ advanceOnboarding }));

import { replyOnboardingHandler } from '../reply';

const body = {
  status: 'awaiting_answer' as const,
  messages: [
    {
      id: 'onboarding-0',
      role: 'user' as const,
      parts: [{ type: 'text' as const, text: 'yes' }],
    },
  ],
  updatedAt: '2026-07-28T00:00:01.000Z',
};

const post = (payload: unknown) =>
  new Request('http://test/api/course/onboarding/reply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'user-1' } });
  advanceOnboarding.mockResolvedValue({ ok: true, body });
});

describe('replyOnboardingHandler', () => {
  it('401 when not authenticated', async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await replyOnboardingHandler(
      post({ courseSlug: 'ppl', text: 'yes' }),
    );
    expect(res.status).toBe(401);
    expect(advanceOnboarding).not.toHaveBeenCalled();
  });

  it('sends the reply as a REPLY event for the authed user', async () => {
    const res = await replyOnboardingHandler(
      post({ courseSlug: 'ppl', text: 'yes please' }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(body);
    expect(advanceOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        courseSlug: 'ppl',
        event: { type: 'REPLY', text: 'yes please' },
      }),
    );
  });

  it('forwards expectedUpdatedAt so the concurrency guard can fire', async () => {
    await replyOnboardingHandler(
      post({
        courseSlug: 'ppl',
        text: 'yes',
        expectedUpdatedAt: '2026-07-28T00:00:00.000Z',
      }),
    );
    expect(advanceOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedUpdatedAt: '2026-07-28T00:00:00.000Z',
      }),
    );
  });

  it('409 when the session moved on since the client last read it', async () => {
    // Two tabs replying at once: the loser is told, rather than silently
    // overwriting the turn the other tab produced.
    advanceOnboarding.mockResolvedValueOnce({ ok: false, reason: 'stale' });
    const res = await replyOnboardingHandler(
      post({
        courseSlug: 'ppl',
        text: 'yes',
        expectedUpdatedAt: '2026-07-28T00:00:00.000Z',
      }),
    );
    expect(res.status).toBe(409);
  });

  it('ignores a userId in the request body', async () => {
    // The property this pins: naming another user in the payload must not
    // reach the glue, which is where every ownership check keys off userId.
    const res = await replyOnboardingHandler(
      post({ courseSlug: 'x', text: 'hi', userId: 'attacker' }),
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
    const res = await replyOnboardingHandler(
      post({ courseSlug: 'nope', text: 'yes' }),
    );
    expect(res.status).toBe(404);
  });

  it('400 when text is missing', async () => {
    const res = await replyOnboardingHandler(post({ courseSlug: 'ppl' }));
    expect(res.status).toBe(400);
    expect(advanceOnboarding).not.toHaveBeenCalled();
  });

  it('400 when text is empty', async () => {
    const res = await replyOnboardingHandler(
      post({ courseSlug: 'ppl', text: '' }),
    );
    expect(res.status).toBe(400);
    expect(advanceOnboarding).not.toHaveBeenCalled();
  });

  it('400 when text is longer than storage accepts', async () => {
    // Matches OnboardingAnswersSchema's 5000-char per-answer cap: the
    // transport must not accept what the row could never store.
    const res = await replyOnboardingHandler(
      post({ courseSlug: 'ppl', text: 'a'.repeat(5001) }),
    );
    expect(res.status).toBe(400);
    expect(advanceOnboarding).not.toHaveBeenCalled();
  });

  it('400 when courseSlug is missing', async () => {
    const res = await replyOnboardingHandler(post({ text: 'yes' }));
    expect(res.status).toBe(400);
    expect(advanceOnboarding).not.toHaveBeenCalled();
  });

  it('400 when the body is not JSON', async () => {
    const res = await replyOnboardingHandler(
      new Request('http://test/api/course/onboarding/reply', {
        method: 'POST',
        body: 'not json',
      }),
    );
    expect(res.status).toBe(400);
    expect(advanceOnboarding).not.toHaveBeenCalled();
  });

  it('500 when the turn throws', async () => {
    advanceOnboarding.mockRejectedValueOnce(new Error('model down'));
    const res = await replyOnboardingHandler(
      post({ courseSlug: 'ppl', text: 'yes' }),
    );
    expect(res.status).toBe(500);
  });
});
