// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, evaluateLessonGate, getLessonMaterial, recordLessonVisit } =
  vi.hoisted(() => ({
    getSession: vi.fn(),
    evaluateLessonGate: vi.fn(),
    getLessonMaterial: vi.fn(),
    recordLessonVisit: vi.fn(),
  }));

vi.mock('#/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('#/lib/lesson-gating.server', () => ({ evaluateLessonGate }));
vi.mock('#/db/lesson', () => ({ getLessonMaterial }));
vi.mock('#/db/lesson-visit', () => ({ recordLessonVisit }));

import { getLessonMaterialHandler } from '../material';

const req = (query = '?lessonSlug=b') =>
  new Request(`http://test/api/lesson/material${query}`);

const material = { lessonSlug: 'b', text: 'body', keyPoints: ['k'], quiz: [] };

const openGate = {
  courseSlug: 'c1',
  courseId: 7,
  isAdmin: false,
  subscribed: true,
  level: 'basic',
  outOfTier: null,
  lessonLock: { kind: 'open' },
  materialLock: { kind: 'open' },
};

describe('getLessonMaterialHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ user: { id: 'u1' } });
    evaluateLessonGate.mockResolvedValue(openGate);
    getLessonMaterial.mockResolvedValue(material);
  });

  it('401s an anonymous caller without touching the database', async () => {
    getSession.mockResolvedValue(null);
    const res = await getLessonMaterialHandler(req());
    expect(res.status).toBe(401);
    expect(getLessonMaterial).not.toHaveBeenCalled();
    expect(evaluateLessonGate).not.toHaveBeenCalled();
  });

  it('403s a signed-in caller with no subscription', async () => {
    evaluateLessonGate.mockResolvedValue({ ...openGate, subscribed: false });
    const res = await getLessonMaterialHandler(req());
    expect(res.status).toBe(403);
    expect(getLessonMaterial).not.toHaveBeenCalled();
  });

  it('returns the material, including text, when unlocked', async () => {
    const res = await getLessonMaterialHandler(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.locked).toBe(false);
    // lesson-player-container feeds material.text into debrief generation, so
    // dropping it (as the old platform's endpoint did) breaks the debrief.
    expect(body.material.text).toBe('body');
    expect(body.adminBypass).toBe(false);
  });

  it('reports the video gate without any material content', async () => {
    evaluateLessonGate.mockResolvedValue({
      ...openGate,
      materialLock: { kind: 'video-locked' },
    });
    const res = await getLessonMaterialHandler(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ locked: true, reason: 'video' });
    // Content must be structurally absent, not nulled — a nulled flat shape
    // leaks every column added to lesson_material later.
    expect(getLessonMaterial).not.toHaveBeenCalled();
  });

  it('names the blocking lesson when the lesson gate fails', async () => {
    evaluateLessonGate.mockResolvedValue({
      ...openGate,
      lessonLock: {
        kind: 'lesson-locked',
        lessonSlug: 'a',
        moduleSlug: 'm1',
        lessonName: 'A',
      },
    });
    const body = await (await getLessonMaterialHandler(req())).json();
    expect(body).toEqual({
      locked: true,
      reason: 'lesson',
      blockedBy: { lessonSlug: 'a', moduleSlug: 'm1', lessonName: 'A' },
    });
  });

  it('names the blocking module when the module gate fails', async () => {
    evaluateLessonGate.mockResolvedValue({
      ...openGate,
      lessonLock: { kind: 'module-locked', moduleSlug: 'm1', moduleName: 'M' },
    });
    const body = await (await getLessonMaterialHandler(req())).json();
    expect(body.reason).toBe('module');
    expect(body.blockedBy).toEqual({ moduleSlug: 'm1', moduleName: 'M' });
  });

  it('flags an admin bypass rather than hiding it', async () => {
    evaluateLessonGate.mockResolvedValue({ ...openGate, isAdmin: true });
    const body = await (await getLessonMaterialHandler(req())).json();
    expect(body.adminBypass).toBe(true);
  });

  it('404s an unknown lesson', async () => {
    evaluateLessonGate.mockResolvedValue(null);
    expect((await getLessonMaterialHandler(req())).status).toBe(404);
  });

  it('does not reveal whether material exists for a locked lesson', async () => {
    evaluateLessonGate.mockResolvedValue({
      ...openGate,
      materialLock: { kind: 'video-locked' },
    });
    getLessonMaterial.mockResolvedValue(null);
    const res = await getLessonMaterialHandler(req());
    expect(res.status).toBe(200);
    expect((await res.json()).reason).toBe('video');
  });

  it('500s when the gate throws instead of showing a false lock', async () => {
    evaluateLessonGate.mockRejectedValue(new Error('db down'));
    const res = await getLessonMaterialHandler(req());
    // A gate failure must not read as "locked" — the student would be told to
    // watch a video they already watched, with no way to recover.
    expect(res.status).toBe(500);
  });

  it('400s when lessonSlug is missing, after the auth check', async () => {
    getSession.mockResolvedValue(null);
    expect((await getLessonMaterialHandler(req(''))).status).toBe(401);
    getSession.mockResolvedValue({ user: { id: 'u1' } });
    expect((await getLessonMaterialHandler(req(''))).status).toBe(400);
  });
});

/**
 * Out-of-tier lessons. The gate reports both locks open for these — the course
 * is filtered to the pilot's level before the locks are evaluated — so the
 * only thing standing between a pilot and content outside their level is this
 * branch. Its two outcomes are asserted on the response AND, for the read-only
 * one, on `recordLessonVisit`: serving an archive must not look like attendance.
 */
describe('out-of-tier lessons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ user: { id: 'u1' } });
    getLessonMaterial.mockResolvedValue(material);
  });

  it('403s a lesson outside the level that was never completed, and names the level', async () => {
    evaluateLessonGate.mockResolvedValue({
      ...openGate,
      level: 'intermediate',
      outOfTier: { readOnly: false },
    });
    const res = await getLessonMaterialHandler(req());
    expect(res.status).toBe(403);
    // The client turns this into copy naming the tier, so the level has to
    // travel with the refusal.
    expect(await res.json()).toEqual({
      error: 'out-of-tier',
      level: 'intermediate',
    });
    expect(getLessonMaterial).not.toHaveBeenCalled();
  });

  it('serves a completed out-of-tier lesson flagged read-only', async () => {
    evaluateLessonGate.mockResolvedValue({
      ...openGate,
      level: 'intermediate',
      outOfTier: { readOnly: true },
    });
    const res = await getLessonMaterialHandler(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      locked: false,
      adminBypass: false,
      readOnly: true,
      material,
    });
  });

  it('records no visit for a read-only view — an archive is not attendance', async () => {
    evaluateLessonGate.mockResolvedValue({
      ...openGate,
      level: 'intermediate',
      outOfTier: { readOnly: true },
    });
    await getLessonMaterialHandler(req());
    expect(recordLessonVisit).not.toHaveBeenCalled();
  });
});

/**
 * The visit record is the only completion signal a lesson with nothing to
 * watch ever gets, so these assert on what `recordLessonVisit` was CALLED
 * with, not on the response. A response can stay correct while the write
 * silently stops happening.
 */
describe('recording the visit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ user: { id: 'u1' } });
    evaluateLessonGate.mockResolvedValue(openGate);
    getLessonMaterial.mockResolvedValue(material);
  });

  it('records the session user and the requested lesson when unlocked', async () => {
    await getLessonMaterialHandler(req('?lessonSlug=b'));
    expect(recordLessonVisit).toHaveBeenCalledWith({
      userId: 'u1',
      lessonSlug: 'b',
    });
  });

  it('serves an unlocked response with null material when a lesson has none', async () => {
    // Video-only lessons are normal, and this used to 404 — which the client
    // turned into a page-level error that hid the video too. The visit is still
    // recorded, since the learner was let in.
    getLessonMaterial.mockResolvedValue(null);
    const res = await getLessonMaterialHandler(req());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      locked: false,
      adminBypass: false,
      material: null,
    });
    expect(recordLessonVisit).toHaveBeenCalledOnce();
  });

  it('does not record a locked lesson — a lock screen is a door you bounced off', async () => {
    evaluateLessonGate.mockResolvedValue({
      ...openGate,
      materialLock: { kind: 'video-locked' },
    });
    await getLessonMaterialHandler(req());
    expect(recordLessonVisit).not.toHaveBeenCalled();
  });

  it('does not record for an anonymous or unsubscribed caller', async () => {
    getSession.mockResolvedValue(null);
    await getLessonMaterialHandler(req());
    getSession.mockResolvedValue({ user: { id: 'u1' } });
    evaluateLessonGate.mockResolvedValue({ ...openGate, subscribed: false });
    await getLessonMaterialHandler(req());
    expect(recordLessonVisit).not.toHaveBeenCalled();
  });

  it('still serves the material when the write fails', async () => {
    // The learner came here for the content. A dropped write self-corrects on
    // the next visit; a 500 here would cost them the lesson.
    recordLessonVisit.mockRejectedValue(new Error('db down'));
    const res = await getLessonMaterialHandler(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ locked: false });
  });
});
