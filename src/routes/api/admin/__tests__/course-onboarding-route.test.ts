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
    getCourseOnboarding: vi.fn(),
    updateCourseOnboarding: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/lib/permissions.server', () => ({
  requireCoursePermission: m.requireCoursePermission,
}));
vi.mock('#/db/admin', () => ({
  getCourseOnboarding: m.getCourseOnboarding,
  updateCourseOnboarding: m.updateCourseOnboarding,
}));

import {
  getOnboardingHandler,
  postOnboardingHandler,
} from '../courses.$courseId.onboarding';

function postReq(body: unknown): Request {
  return new Request('http://test/api/admin/courses/1/onboarding', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.requireCoursePermission.mockResolvedValue({ userId: 'u1' });
  m.getCourseOnboarding.mockResolvedValue([]);
  m.updateCourseOnboarding.mockResolvedValue([]);
});

describe('getOnboardingHandler', () => {
  it('asks for content:read on that specific course', async () => {
    await getOnboardingHandler(new Request('http://t'), '1');
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(),
      1,
      'content',
      'read',
    );
  });

  it('403 when refused, without reading onboarding', async () => {
    m.requireCoursePermission.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await getOnboardingHandler(new Request('http://t'), '1');
    expect(res.status).toBe(403);
    expect(m.getCourseOnboarding).not.toHaveBeenCalled();
  });

  it('400 on invalid course id, before guarding', async () => {
    const res = await getOnboardingHandler(new Request('http://t'), 'abc');
    expect(res.status).toBe(400);
    expect(m.requireCoursePermission).not.toHaveBeenCalled();
  });

  it('returns the questions', async () => {
    m.getCourseOnboarding.mockResolvedValue([{ id: 'a', text: 'Q1' }]);
    const res = await getOnboardingHandler(new Request('http://t'), '1');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 'a', text: 'Q1' }]);
    expect(m.getCourseOnboarding).toHaveBeenCalledWith(1);
  });
});

describe('postOnboardingHandler', () => {
  it('asks for content:update on that specific course', async () => {
    await postOnboardingHandler(postReq({ questions: [] }), '1');
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      expect.anything(),
      1,
      'content',
      'update',
    );
  });

  it('403 when refused, without saving', async () => {
    m.requireCoursePermission.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await postOnboardingHandler(postReq({ questions: [] }), '1');
    expect(res.status).toBe(403);
    expect(m.updateCourseOnboarding).not.toHaveBeenCalled();
  });

  it('400 on invalid course id, before guarding', async () => {
    const res = await postOnboardingHandler(postReq({ questions: [] }), 'abc');
    expect(res.status).toBe(400);
    expect(m.requireCoursePermission).not.toHaveBeenCalled();
  });

  it('400 on bad JSON', async () => {
    const bad = new Request('http://t', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{nope',
    });
    expect((await postOnboardingHandler(bad, '1')).status).toBe(400);
  });
  it('400 on schema failure', async () => {
    const res = await postOnboardingHandler(
      postReq({ questions: [{ text: 'x' }] }),
      '1',
    );
    expect(res.status).toBe(400);
    expect(m.updateCourseOnboarding).not.toHaveBeenCalled();
  });
  it('saves and returns the questions', async () => {
    const questions = [
      { id: 'c1', name: 'Background', questions: [{ id: 'a', text: 'Q1' }] },
    ];
    m.updateCourseOnboarding.mockResolvedValue(questions);
    const res = await postOnboardingHandler(postReq({ questions }), '1');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(questions);
    expect(m.updateCourseOnboarding).toHaveBeenCalledWith(1, questions);
  });
});
