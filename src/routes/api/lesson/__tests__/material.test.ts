// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, evaluateLessonGate, getLessonMaterial } = vi.hoisted(
  () => ({
    getSession: vi.fn(),
    evaluateLessonGate: vi.fn(),
    getLessonMaterial: vi.fn(),
  }),
);

vi.mock('#/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('#/lib/lesson-gating.server', () => ({ evaluateLessonGate }));
vi.mock('#/db/lesson', () => ({ getLessonMaterial }));

import { getLessonMaterialHandler } from '../material';

const req = (query = '?lessonSlug=b') =>
  new Request(`http://test/api/lesson/material${query}`);

const material = { lessonSlug: 'b', text: 'body', keyPoints: ['k'], quiz: [] };

const openGate = {
  courseSlug: 'c1',
  courseId: 7,
  isAdmin: false,
  subscribed: true,
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
