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
    absentResourceResponse: vi.fn(),
    getCourseIdsForLesson: vi.fn<() => Promise<number[]>>(),
    getLessonCaptionsStatus: vi.fn(),
    getCaptionsTarget: vi.fn(),
    requestLessonCaptions: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/lib/permissions.server', () => ({
  requireCoursePermission: m.requireCoursePermission,
  absentResourceResponse: m.absentResourceResponse,
}));
vi.mock('#/db/placements', () => ({
  getCourseIdsForLesson: m.getCourseIdsForLesson,
}));
vi.mock('#/db/video-captions', () => ({
  getLessonCaptionsStatus: m.getLessonCaptionsStatus,
  getCaptionsTarget: m.getCaptionsTarget,
  requestLessonCaptions: m.requestLessonCaptions,
}));

import {
  getCaptionsHandler,
  postCaptionsHandler,
} from '../lessons.$lessonId.captions';

const req = (query = 'courseId=42', method = 'GET') =>
  new Request(`http://test/api/admin/lessons/1/captions?${query}`, { method });

beforeEach(() => {
  vi.clearAllMocks();
  m.getCourseIdsForLesson.mockResolvedValue([42, 99]);
  m.requireCoursePermission.mockResolvedValue(undefined);
  m.absentResourceResponse.mockResolvedValue(
    new Response(null, { status: 404 }),
  );
  m.getLessonCaptionsStatus.mockResolvedValue({
    status: 'generating',
    error: null,
    lang: 'fr',
  });
  m.getCaptionsTarget.mockResolvedValue({
    provider: 'mux',
    ref: 'm2',
    lang: 'fr',
  });
  m.requestLessonCaptions.mockResolvedValue('generating');
});

describe('GET captions', () => {
  it('400s a request with no courseId', async () => {
    const res = await getCaptionsHandler(req(''), '1');
    expect(res.status).toBe(400);
    expect(m.getLessonCaptionsStatus).not.toHaveBeenCalled();
  });

  it('answers absentResourceResponse for a lesson not placed in the course', async () => {
    m.absentResourceResponse.mockResolvedValue(
      new Response('Forbidden', { status: 403 }),
    );
    const request = req('courseId=7');
    const res = await getCaptionsHandler(request, '1');
    expect(m.absentResourceResponse).toHaveBeenCalledWith(
      request.headers,
      'Lesson not found',
    );
    expect(res.status).toBe(403);
    expect(m.requireCoursePermission).not.toHaveBeenCalled();
  });

  it('403s a forbidden user, having asked for content:read on the named course', async () => {
    m.requireCoursePermission.mockRejectedValueOnce(new m.ForbiddenError());
    const request = req();
    const res = await getCaptionsHandler(request, '1');
    expect(res.status).toBe(403);
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      request.headers,
      42,
      'content',
      'read',
    );
    expect(m.getLessonCaptionsStatus).not.toHaveBeenCalled();
  });

  it('answers the status for the requested language', async () => {
    const res = await getCaptionsHandler(req('courseId=42&lang=fr'), '1');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: 'generating',
      error: null,
      lang: 'fr',
    });
    expect(m.getLessonCaptionsStatus).toHaveBeenCalledWith(1, 'fr');
  });

  it('falls back to English for an unknown language', async () => {
    await getCaptionsHandler(req('courseId=42&lang=xx'), '1');
    expect(m.getLessonCaptionsStatus).toHaveBeenCalledWith(1, 'en');
  });

  it('404s when there is no status (no lesson video)', async () => {
    m.getLessonCaptionsStatus.mockResolvedValue(null);
    const res = await getCaptionsHandler(req(), '1');
    expect(res.status).toBe(404);
  });
});

describe('POST captions', () => {
  const post = (query = 'courseId=42&lang=fr') => req(query, 'POST');

  it('asks for content:update on the named course', async () => {
    const request = post();
    await postCaptionsHandler(request, '1');
    expect(m.requireCoursePermission).toHaveBeenCalledWith(
      request.headers,
      42,
      'content',
      'update',
    );
  });

  it('requests captions for a Mux target and answers the outcome', async () => {
    const res = await postCaptionsHandler(post(), '1');
    expect(m.getCaptionsTarget).toHaveBeenCalledWith(1, 'fr');
    expect(m.requestLessonCaptions).toHaveBeenCalledWith({
      lessonId: 1,
      playbackId: 'm2',
      lang: 'fr',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'generating' });
  });

  it('409s a Synthesia target without calling Mux', async () => {
    m.getCaptionsTarget.mockResolvedValue({
      provider: 'synthesia',
      ref: 's1',
      lang: 'fr',
    });
    const res = await postCaptionsHandler(post(), '1');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'Captions come from the provider for this video.',
    });
    expect(m.requestLessonCaptions).not.toHaveBeenCalled();
  });

  it('404s a lesson with no video', async () => {
    m.getCaptionsTarget.mockResolvedValue(null);
    const res = await postCaptionsHandler(post(), '1');
    expect(res.status).toBe(404);
    expect(m.requestLessonCaptions).not.toHaveBeenCalled();
  });
});
