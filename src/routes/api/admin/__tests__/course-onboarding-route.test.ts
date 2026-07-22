// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => {
  class ForbiddenError extends Error {
    constructor() {
      super('Forbidden');
      this.name = 'ForbiddenError';
    }
  }
  return {
    ForbiddenError,
    requireAdmin: vi.fn(),
    getCourseOnboarding: vi.fn(),
    updateCourseOnboarding: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  requireAdmin: m.requireAdmin,
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/db/admin', () => ({
  getCourseOnboarding: m.getCourseOnboarding,
  updateCourseOnboarding: m.updateCourseOnboarding,
}));

import {
  getOnboardingHandler,
  putOnboardingHandler,
} from '../courses.$courseId.onboarding';

function putReq(body: unknown): Request {
  return new Request('http://test/api/admin/courses/1/onboarding', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.requireAdmin.mockResolvedValue({ userId: 'u1', roles: ['admin'] });
});

describe('getOnboardingHandler', () => {
  it('403 when not admin', async () => {
    m.requireAdmin.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await getOnboardingHandler(new Request('http://t'), '1');
    expect(res.status).toBe(403);
  });
  it('400 on invalid course id', async () => {
    const res = await getOnboardingHandler(new Request('http://t'), 'abc');
    expect(res.status).toBe(400);
  });
  it('returns the questions', async () => {
    m.getCourseOnboarding.mockResolvedValue([{ id: 'a', text: 'Q1' }]);
    const res = await getOnboardingHandler(new Request('http://t'), '1');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 'a', text: 'Q1' }]);
    expect(m.getCourseOnboarding).toHaveBeenCalledWith(1);
  });
});

describe('putOnboardingHandler', () => {
  it('403 when not admin', async () => {
    m.requireAdmin.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await putOnboardingHandler(putReq({ questions: [] }), '1');
    expect(res.status).toBe(403);
  });
  it('400 on bad JSON', async () => {
    const bad = new Request('http://t', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{nope',
    });
    expect((await putOnboardingHandler(bad, '1')).status).toBe(400);
  });
  it('400 on schema failure', async () => {
    const res = await putOnboardingHandler(putReq({ questions: [{ text: 'x' }] }), '1');
    expect(res.status).toBe(400);
    expect(m.updateCourseOnboarding).not.toHaveBeenCalled();
  });
  it('saves and returns the questions', async () => {
    const questions = [{ id: 'a', text: 'Q1' }];
    m.updateCourseOnboarding.mockResolvedValue(questions);
    const res = await putOnboardingHandler(putReq({ questions }), '1');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(questions);
    expect(m.updateCourseOnboarding).toHaveBeenCalledWith(1, questions);
  });
});
