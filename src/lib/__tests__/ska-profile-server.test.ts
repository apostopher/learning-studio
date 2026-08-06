import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getCourseIdentityBySlug,
  findReviewedSkaProfile,
  findLatestReviewedSkaProfile,
  findSkaProfile,
  saveSkaProfileReview,
} = vi.hoisted(() => ({
  getCourseIdentityBySlug: vi.fn(),
  findReviewedSkaProfile: vi.fn(),
  findLatestReviewedSkaProfile: vi.fn(),
  findSkaProfile: vi.fn(),
  saveSkaProfileReview: vi.fn(),
}));

vi.mock('#/db/course', () => ({ getCourseIdentityBySlug }));
vi.mock('#/db/ska-profile', () => ({
  findReviewedSkaProfile,
  findLatestReviewedSkaProfile,
  findSkaProfile,
  saveSkaProfileReview,
}));

import {
  getSkaProfileForCourse,
  resolveChatSkaProfile,
  reviewSkaProfile,
} from '#/lib/ska-profile.server';

const ROW = {
  skills: 'Flies gliders.',
  knowledge: 'Holds a Part 107.',
  attitude: 'Goes slowly.',
  reviewedAt: new Date('2026-08-01T00:00:00.000Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  getCourseIdentityBySlug.mockResolvedValue({ id: 7, name: 'PPL' });
});

describe('resolveChatSkaProfile — with a course in context', () => {
  it('returns that course’s profile with all three sections', async () => {
    findReviewedSkaProfile.mockResolvedValue(ROW);

    const result = await resolveChatSkaProfile({
      userId: 'u1',
      courseSlug: 'ppl',
    });

    expect(findReviewedSkaProfile).toHaveBeenCalledWith({
      userId: 'u1',
      courseId: 7,
    });
    // No `sections` narrowing: with a course in context, Skills and Knowledge
    // are exactly the material that applies.
    expect(result?.sections).toBeUndefined();
    expect(result?.profile).toBe(ROW);
  });

  it('reads through the REVIEWED-only finder, never the plain one', async () => {
    findReviewedSkaProfile.mockResolvedValue(ROW);

    await resolveChatSkaProfile({ userId: 'u1', courseSlug: 'ppl' });

    // The single most important invariant of this feature: an unreviewed
    // profile must never reach a prompt. The gate lives in the read, so this
    // asserts the read that was actually used.
    expect(findSkaProfile).not.toHaveBeenCalled();
  });

  it('returns undefined when this course has no reviewed profile', async () => {
    findReviewedSkaProfile.mockResolvedValue(null);

    expect(
      await resolveChatSkaProfile({ userId: 'u1', courseSlug: 'ppl' }),
    ).toBeUndefined();
    // It does NOT fall back to another course's profile: a course IS in
    // context, so answering from a different course's material would be worse
    // than not personalising.
    expect(findLatestReviewedSkaProfile).not.toHaveBeenCalled();
  });
});

describe('resolveChatSkaProfile — with no course in context', () => {
  it('returns the most recent reviewed profile narrowed to attitude', async () => {
    findLatestReviewedSkaProfile.mockResolvedValue(ROW);

    const result = await resolveChatSkaProfile({ userId: 'u1' });

    expect(findLatestReviewedSkaProfile).toHaveBeenCalledWith({
      userId: 'u1',
    });
    // Attitude describes the person and travels between courses; Skills and
    // Knowledge are course-specific and would cross-contaminate.
    expect(result?.sections).toEqual(['attitude']);
  });

  it('returns undefined when the learner has no reviewed profile anywhere', async () => {
    findLatestReviewedSkaProfile.mockResolvedValue(null);

    expect(await resolveChatSkaProfile({ userId: 'u1' })).toBeUndefined();
  });

  it('falls back to the attitude-only branch when the slug does not resolve', async () => {
    // A bad slug must not take down a perfectly valid conversation — answering
    // with less context beats throwing.
    getCourseIdentityBySlug.mockResolvedValue(null);
    findLatestReviewedSkaProfile.mockResolvedValue(ROW);

    const result = await resolveChatSkaProfile({
      userId: 'u1',
      courseSlug: 'does-not-exist',
    });

    expect(result?.sections).toEqual(['attitude']);
    expect(findReviewedSkaProfile).not.toHaveBeenCalled();
  });
});

describe('getSkaProfileForCourse', () => {
  it('returns an UNREVIEWED profile — this read is what the editor renders', async () => {
    const unreviewed = { ...ROW, reviewedAt: null };
    findSkaProfile.mockResolvedValue(unreviewed);

    const result = await getSkaProfileForCourse({
      userId: 'u1',
      courseSlug: 'ppl',
    });

    expect(result).toEqual({
      ok: true,
      profile: {
        skills: 'Flies gliders.',
        knowledge: 'Holds a Part 107.',
        attitude: 'Goes slowly.',
        reviewedAt: null,
      },
    });
  });

  it('reports no profile as ok with a null profile, not as a failure', async () => {
    findSkaProfile.mockResolvedValue(null);

    expect(
      await getSkaProfileForCourse({ userId: 'u1', courseSlug: 'ppl' }),
    ).toEqual({ ok: true, profile: null });
  });

  it('fails on an unknown course', async () => {
    getCourseIdentityBySlug.mockResolvedValue(null);

    expect(
      await getSkaProfileForCourse({ userId: 'u1', courseSlug: 'nope' }),
    ).toEqual({ ok: false, reason: 'course_not_found' });
  });
});

describe('reviewSkaProfile', () => {
  const EDIT = {
    skills: 'Flies gliders and a bit of FPV now.',
    knowledge: null,
    attitude: 'Goes slowly.',
  };

  it('passes the edits to the DB writer scoped to the session user', async () => {
    saveSkaProfileReview.mockResolvedValue({
      ...ROW,
      ...EDIT,
      reviewedAt: new Date('2026-08-03T00:00:00.000Z'),
    });

    await reviewSkaProfile({ userId: 'u1', courseSlug: 'ppl', profile: EDIT });

    expect(saveSkaProfileReview).toHaveBeenCalledWith({
      userId: 'u1',
      courseId: 7,
      profile: EDIT,
    });
  });

  it('returns the saved profile with reviewedAt stamped', async () => {
    saveSkaProfileReview.mockResolvedValue({
      ...ROW,
      ...EDIT,
      reviewedAt: new Date('2026-08-03T00:00:00.000Z'),
    });

    const result = await reviewSkaProfile({
      userId: 'u1',
      courseSlug: 'ppl',
      profile: EDIT,
    });

    if (!result.ok) throw new Error('expected ok');
    // The client renders straight from this: a response without the stamp
    // would leave the card showing "not in use yet" for a profile the learner
    // just activated.
    expect(result.profile?.reviewedAt).toBe('2026-08-03T00:00:00.000Z');
    expect(result.profile?.skills).toBe('Flies gliders and a bit of FPV now.');
  });

  it('reports profile_not_found rather than creating a row', async () => {
    // The only way the row disappears between load and save is a withdrawal
    // in another tab. Upserting here would resurrect, from a stale form, data
    // the learner just asked to erase.
    saveSkaProfileReview.mockResolvedValue(null);

    expect(
      await reviewSkaProfile({
        userId: 'u1',
        courseSlug: 'ppl',
        profile: EDIT,
      }),
    ).toEqual({ ok: false, reason: 'profile_not_found' });
  });
});
