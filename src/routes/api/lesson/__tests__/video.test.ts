// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, getVideoDetailsWithCache } = vi.hoisted(() => ({
  getSession: vi.fn(),
  getVideoDetailsWithCache: vi.fn(),
}));

vi.mock('#/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('#/integrations/synthesia/videos', () => ({
  getVideoDetailsWithCache,
}));

import { getLessonVideoHandler } from '../video';

const req = (query = '?videoId=vid_1') =>
  new Request(`http://test/api/lesson/video${query}`);

const details = {
  id: 'vid_1',
  status: 'complete',
  download: 'https://cdn.synthesia.io/v.mp4?Expires=999',
};

describe('getLessonVideoHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ user: { id: 'u1' } });
  });

  it('returns video details for a signed-in user', async () => {
    getVideoDetailsWithCache.mockResolvedValue(details);

    const res = await getLessonVideoHandler(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(details);
  });

  it('401s an anonymous caller without contacting Synthesia', async () => {
    getSession.mockResolvedValue(null);

    const res = await getLessonVideoHandler(req());

    expect(res.status).toBe(401);
    // The response body embeds a pre-signed download URL, so an unauthenticated
    // request must not reach the provider at all.
    expect(getVideoDetailsWithCache).not.toHaveBeenCalled();
  });

  it('checks the session before validating input', async () => {
    getSession.mockResolvedValue(null);

    const res = await getLessonVideoHandler(req(''));

    // A missing videoId must not shortcut past the auth gate into a 400 that
    // tells an anonymous caller the route exists and what it wants.
    expect(res.status).toBe(401);
  });

  it('400s a signed-in request with no videoId', async () => {
    const res = await getLessonVideoHandler(req(''));

    expect(res.status).toBe(400);
    expect(getVideoDetailsWithCache).not.toHaveBeenCalled();
  });

  it('reports every lookup failure identically', async () => {
    getVideoDetailsWithCache.mockRejectedValue(new Error('404 from provider'));
    const missing = await getLessonVideoHandler(req());

    getVideoDetailsWithCache.mockRejectedValue(new Error('503 from provider'));
    const broken = await getLessonVideoHandler(req());

    // Same status and body either way: differing responses would let a
    // signed-in caller enumerate which video IDs exist in the account.
    expect(missing.status).toBe(502);
    expect(broken.status).toBe(502);
    expect(await missing.text()).toBe(await broken.text());
  });
});
