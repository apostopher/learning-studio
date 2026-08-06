// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, getSkaProfileForCourse, reviewSkaProfile } = vi.hoisted(
  () => ({
    getSession: vi.fn(),
    getSkaProfileForCourse: vi.fn(),
    reviewSkaProfile: vi.fn(),
  }),
);

vi.mock('#/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('#/lib/ska-profile.server', () => ({
  getSkaProfileForCourse,
  reviewSkaProfile,
}));

import { getSkaProfileHandler, saveSkaProfileHandler } from '../ska-profile';

const PROFILE = {
  skills: 'Flies gliders.',
  knowledge: null,
  attitude: 'Goes slowly.',
  reviewedAt: null,
};

const getReq = (query = '?courseSlug=ppl') =>
  new Request(`http://t/api/course/ska-profile${query}`);

const postReq = (body: unknown) =>
  new Request('http://t/api/course/ska-profile', {
    method: 'POST',
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'u1' } });
  getSkaProfileForCourse.mockResolvedValue({ ok: true, profile: PROFILE });
  reviewSkaProfile.mockResolvedValue({
    ok: true,
    profile: { ...PROFILE, reviewedAt: '2026-08-03T00:00:00.000Z' },
  });
});

describe('getSkaProfileHandler', () => {
  it('401 without a session', async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await getSkaProfileHandler(getReq());
    expect(res.status).toBe(401);
    expect(getSkaProfileForCourse).not.toHaveBeenCalled();
  });

  it('400 without a courseSlug', async () => {
    const res = await getSkaProfileHandler(getReq(''));
    expect(res.status).toBe(400);
    expect(getSkaProfileForCourse).not.toHaveBeenCalled();
  });

  it('returns the profile scoped to the session user', async () => {
    const res = await getSkaProfileHandler(getReq());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ profile: PROFILE });
    // SECURITY: the user id comes from the session and nowhere else — no
    // request can name another learner's profile.
    expect(getSkaProfileForCourse).toHaveBeenCalledWith({
      userId: 'u1',
      courseSlug: 'ppl',
    });
  });

  it('200s with a null profile for a learner who has none', async () => {
    // Not a 404: having no profile is a permanently legitimate state, and a
    // 404 would make the settings page render an error for it.
    getSkaProfileForCourse.mockResolvedValueOnce({ ok: true, profile: null });

    const res = await getSkaProfileHandler(getReq());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ profile: null });
  });

  it('404 on an unknown course', async () => {
    getSkaProfileForCourse.mockResolvedValueOnce({
      ok: false,
      reason: 'course_not_found',
    });

    expect((await getSkaProfileHandler(getReq())).status).toBe(404);
  });
});

describe('saveSkaProfileHandler', () => {
  const BODY = {
    courseSlug: 'ppl',
    profile: { skills: 'Flies gliders.', knowledge: null, attitude: 'Direct.' },
  };

  it('401 without a session', async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await saveSkaProfileHandler(postReq(BODY));
    expect(res.status).toBe(401);
    expect(reviewSkaProfile).not.toHaveBeenCalled();
  });

  it('400 on invalid JSON', async () => {
    const res = await saveSkaProfileHandler(
      new Request('http://t/api/course/ska-profile', {
        method: 'POST',
        body: '{bad',
      }),
    );
    expect(res.status).toBe(400);
    expect(reviewSkaProfile).not.toHaveBeenCalled();
  });

  it('saves the edits and answers with the reviewed profile', async () => {
    const res = await saveSkaProfileHandler(postReq(BODY));

    expect(res.status).toBe(200);
    expect(reviewSkaProfile).toHaveBeenCalledWith({
      userId: 'u1',
      courseSlug: 'ppl',
      profile: BODY.profile,
    });
    const body = (await res.json()) as { profile: { reviewedAt: string } };
    expect(body.profile.reviewedAt).toBe('2026-08-03T00:00:00.000Z');
  });

  it('rejects a section over the storage cap instead of truncating it', async () => {
    // User input is rejected, model output is truncated — the learner is
    // present and can see the limit, so silently eating their last paragraph
    // would be worse than telling them.
    const res = await saveSkaProfileHandler(
      postReq({
        courseSlug: 'ppl',
        profile: {
          skills: 'a'.repeat(2001),
          knowledge: null,
          attitude: null,
        },
      }),
    );

    expect(res.status).toBe(400);
    expect(reviewSkaProfile).not.toHaveBeenCalled();
  });

  it('strips a smuggled userId rather than honouring it', async () => {
    await saveSkaProfileHandler(
      postReq({ ...BODY, userId: 'someone-else', reviewedAt: '2020-01-01' }),
    );

    // Zod strips unknown keys, so neither ever reaches the writer. The user id
    // is the session's; `reviewedAt` is the database's.
    expect(reviewSkaProfile).toHaveBeenCalledWith({
      userId: 'u1',
      courseSlug: 'ppl',
      profile: BODY.profile,
    });
  });

  it('404s when the profile no longer exists, without re-creating it', async () => {
    // A withdrawal landed between load and save. Upserting here would
    // resurrect data the learner just asked to erase.
    reviewSkaProfile.mockResolvedValueOnce({
      ok: false,
      reason: 'profile_not_found',
    });

    expect((await saveSkaProfileHandler(postReq(BODY))).status).toBe(404);
  });
});
