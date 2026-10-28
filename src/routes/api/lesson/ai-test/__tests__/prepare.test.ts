// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  getDebriefAccess: vi.fn(),
  prepareDebrief: vi.fn(),
}));

vi.mock('#/lib/auth', () => ({ auth: { api: { getSession: m.getSession } } }));
vi.mock('#/lib/debrief-access.server', () => ({
  getDebriefAccess: m.getDebriefAccess,
}));
vi.mock('#/lib/prepared-debrief.server', () => ({
  prepareDebrief: m.prepareDebrief,
}));

import { prepareTestHandler } from '../prepare';

const post = (body: unknown) =>
  new Request('http://t/api/lesson/ai-test/prepare', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const access = (state: unknown) => ({
  ok: true,
  courseId: 7,
  lessonId: 41,
  state,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.getSession.mockResolvedValue({ user: { id: 'u1' } });
  m.getDebriefAccess.mockResolvedValue(access({ kind: 'not-done' }));
  m.prepareDebrief.mockResolvedValue('prepared');
});

const body = { lessonSlug: 'l1', courseSlug: 'c1' };

describe('prepare', () => {
  it('asks the access authority about this pilot, in the course the request names', async () => {
    await prepareTestHandler(post(body));
    expect(m.getDebriefAccess).toHaveBeenCalledWith({
      userId: 'u1',
      lessonSlug: 'l1',
      courseSlug: 'c1',
      now: expect.any(Date),
    });
  });

  it.each([
    ['not-done (video still playing)', { kind: 'not-done' }],
    ['waiting', { kind: 'waiting', availableAt: '2026-10-28T00:00:00.000Z' }],
    ['open', { kind: 'open', retake: false }],
    [
      'retake-waiting',
      { kind: 'retake-waiting', availableAt: '2026-10-28T00:00:00.000Z' },
    ],
  ])('prepares for this pilot when the state is %s', async (_why, state) => {
    m.getDebriefAccess.mockResolvedValue(access(state));
    const res = await prepareTestHandler(post(body));
    expect(res.status).toBe(204);
    expect(m.prepareDebrief).toHaveBeenCalledWith({
      userId: 'u1',
      courseId: 7,
      lessonSlug: 'l1',
    });
  });

  it('returns no body, so nothing about the debrief leaks before it opens', async () => {
    const res = await prepareTestHandler(post(body));
    expect(await res.text()).toBe('');
  });

  it('skips the model once the debrief is passed', async () => {
    m.getDebriefAccess.mockResolvedValue(access({ kind: 'passed' }));
    const res = await prepareTestHandler(post(body));
    expect(res.status).toBe(204);
    expect(m.prepareDebrief).not.toHaveBeenCalled();
  });

  it.each([
    ['refused (out-of-tier, locked, unsubscribed, unknown)', 403],
    ['has no debrief', 404],
  ])('skips the model, with a body-less 204, when access is %s', async (_why, status) => {
    m.getDebriefAccess.mockResolvedValue({ ok: false, status });
    const res = await prepareTestHandler(post(body));
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(m.prepareDebrief).not.toHaveBeenCalled();
  });

  it('swallows a failed preparation — the debrief still generates on demand', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    m.prepareDebrief.mockRejectedValue(new Error('model down'));
    const res = await prepareTestHandler(post(body));
    expect(res.status).toBe(204);
  });

  it('401s without a session', async () => {
    m.getSession.mockResolvedValue(null);
    const res = await prepareTestHandler(post(body));
    expect(res.status).toBe(401);
    expect(m.getDebriefAccess).not.toHaveBeenCalled();
  });

  it('400s without a courseSlug', async () => {
    const res = await prepareTestHandler(post({ lessonSlug: 'l1' }));
    expect(res.status).toBe(400);
  });
});
