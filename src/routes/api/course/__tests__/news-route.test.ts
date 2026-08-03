// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  getNewsForUser: vi.fn(),
  setNewsSourceMuted: vi.fn(),
}));

vi.mock('#/lib/auth', () => ({
  auth: { api: { getSession: m.getSession } },
}));
vi.mock('#/lib/news.server', () => ({
  getNewsForUser: m.getNewsForUser,
  setNewsSourceMuted: m.setNewsSourceMuted,
}));

import { getNewsHandler } from '../news';
import { postNewsMuteHandler } from '../news.mute';

const FEED = {
  articles: [],
  sources: [],
  lastUpdatedAt: null,
  adminBypass: false,
};

const getReq = (query = '?courseSlug=rpl') =>
  new Request(`http://test/api/course/news${query}`);

const postReq = (body: unknown) =>
  new Request('http://test/api/course/news/mute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  m.getSession.mockResolvedValue({ user: { id: 'u1' } });
  m.getNewsForUser.mockResolvedValue(FEED);
  m.setNewsSourceMuted.mockResolvedValue({
    ok: true,
    sourceId: 5,
    muted: true,
  });
});

describe('getNewsHandler', () => {
  it('401s without a session, and reads nothing', async () => {
    m.getSession.mockResolvedValue(null);
    const res = await getNewsHandler(getReq());
    expect(res.status).toBe(401);
    expect(m.getNewsForUser).not.toHaveBeenCalled();
  });

  it('400s without courseSlug', async () => {
    const res = await getNewsHandler(getReq(''));
    expect(res.status).toBe(400);
    expect(m.getNewsForUser).not.toHaveBeenCalled();
  });

  it('passes the session user and slug through', async () => {
    const res = await getNewsHandler(getReq('?courseSlug=rpl'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(FEED);
    expect(m.getNewsForUser).toHaveBeenCalledWith({
      userId: 'u1',
      courseSlug: 'rpl',
    });
  });

  it('decodes an encoded slug', async () => {
    await getNewsHandler(getReq('?courseSlug=rpl%2Bextra'));
    expect(m.getNewsForUser).toHaveBeenCalledWith(
      expect.objectContaining({ courseSlug: 'rpl+extra' }),
    );
  });

  it('404s for an unknown course', async () => {
    m.getNewsForUser.mockResolvedValue(null);
    expect((await getNewsHandler(getReq())).status).toBe(404);
  });

  it('500s without leaking the underlying error', async () => {
    m.getNewsForUser.mockRejectedValue(new Error('relation does not exist'));
    const res = await getNewsHandler(getReq());
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('relation');
  });
});

describe('postNewsMuteHandler', () => {
  it('401s without a session, and writes nothing', async () => {
    m.getSession.mockResolvedValue(null);
    const res = await postNewsMuteHandler(
      postReq({ sourceId: 5, muted: true }),
    );
    expect(res.status).toBe(401);
    expect(m.setNewsSourceMuted).not.toHaveBeenCalled();
  });

  it('400s on malformed JSON', async () => {
    const req = new Request('http://test/api/course/news/mute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not json',
    });
    expect((await postNewsMuteHandler(req)).status).toBe(400);
    expect(m.setNewsSourceMuted).not.toHaveBeenCalled();
  });

  it.each([
    ['missing muted', { sourceId: 5 }],
    ['missing sourceId', { muted: true }],
    ['non-numeric sourceId', { sourceId: 'five', muted: true }],
    ['negative sourceId', { sourceId: -1, muted: true }],
    ['unknown extra key', { sourceId: 5, muted: true, userId: 'someone-else' }],
  ])('400s on %s', async (_label, body) => {
    const res = await postNewsMuteHandler(postReq(body));
    expect(res.status).toBe(400);
    expect(m.setNewsSourceMuted).not.toHaveBeenCalled();
  });

  it('mutes, taking the user from the session and never the body', async () => {
    const res = await postNewsMuteHandler(
      postReq({ sourceId: 5, muted: true }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sourceId: 5, muted: true });
    expect(m.setNewsSourceMuted).toHaveBeenCalledWith({
      userId: 'u1',
      sourceId: 5,
      muted: true,
    });
  });

  it('unmutes', async () => {
    m.setNewsSourceMuted.mockResolvedValue({
      ok: true,
      sourceId: 5,
      muted: false,
    });
    const res = await postNewsMuteHandler(
      postReq({ sourceId: 5, muted: false }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sourceId: 5, muted: false });
  });

  it('404s when the source is unknown or not the caller’s', async () => {
    m.setNewsSourceMuted.mockResolvedValue({ ok: false, reason: 'not_found' });
    expect(
      (await postNewsMuteHandler(postReq({ sourceId: 999, muted: true })))
        .status,
    ).toBe(404);
  });

  it('500s without leaking the underlying error', async () => {
    m.setNewsSourceMuted.mockRejectedValue(new Error('deadlock detected'));
    const res = await postNewsMuteHandler(
      postReq({ sourceId: 5, muted: true }),
    );
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('deadlock');
  });
});
