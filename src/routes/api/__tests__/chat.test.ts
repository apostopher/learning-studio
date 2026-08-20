// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getSession,
  buildChatStream,
  resolvePersonaForChat,
  ensureChat,
  appendMessages,
  resolveChatSkaProfile,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  buildChatStream: vi.fn(),
  resolvePersonaForChat: vi.fn(),
  ensureChat: vi.fn(),
  appendMessages: vi.fn(),
  resolveChatSkaProfile: vi.fn(),
}));
vi.mock('#/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('#/ai/chat', () => ({ buildChatStream, isAssociateFrom: () => false }));
// Mocked rather than left real because the module reaches `#/db/schema`
// transitively (whose `@/types` value import can't resolve under vitest).
vi.mock('#/db/course-orgs', () => ({ resolvePersonaForChat }));
vi.mock('#/lib/active-org.server', () => ({ getActiveOrgId: () => 1 }));
vi.mock('#/db/chat', () => ({ ensureChat, appendMessages }));
// Mocked rather than left real because the module reaches `#/db/schema`
// transitively; the route only passes its result through to `buildChatStream`,
// which is mocked too, so nothing here depends on its internals.
vi.mock('#/lib/ska-profile.server', () => ({ resolveChatSkaProfile }));

import { chatHandler } from '../chat';

function postReq(body: unknown): Request {
  return new Request('http://t/api/chat', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'u1', name: 'R' } });
  resolvePersonaForChat.mockResolvedValue({
    content: { basicInfo: 'published' },
    source: 'course',
  });
  resolveChatSkaProfile.mockResolvedValue(undefined);
  ensureChat.mockResolvedValue('chat-1');
  appendMessages.mockResolvedValue(undefined);
  buildChatStream.mockResolvedValue({
    toUIMessageStream: () => (async function* () {})(),
  });
});

describe('chatHandler', () => {
  it('401 without a session', async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await chatHandler(
      postReq({
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
      }),
    );
    expect(res.status).toBe(401);
    expect(buildChatStream).not.toHaveBeenCalled();
  });

  it('400 without messages', async () => {
    const res = await chatHandler(postReq({}));
    expect(res.status).toBe(400);
    expect(buildChatStream).not.toHaveBeenCalled();
  });

  it('400 on invalid JSON', async () => {
    const bad = new Request('http://t/api/chat', {
      method: 'POST',
      body: '{bad',
    });
    const res = await chatHandler(bad);
    expect(res.status).toBe(400);
    expect(buildChatStream).not.toHaveBeenCalled();
  });

  it('streams when authed and surfaces the resolved chat id via x-chat-id', async () => {
    const res = await chatHandler(
      postReq({
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
      }),
    );
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-chat-id')).toBe('chat-1');
    expect(ensureChat).toHaveBeenCalled();
    // Drain the response body so the stream's execute() (which awaits
    // buildChatStream) actually runs before we assert on the mock.
    await res.text();
    expect(buildChatStream).toHaveBeenCalled();
  });

  it('passes the request courseSlug and the session userId through to buildChatStream', async () => {
    const res = await chatHandler(
      postReq({
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
        courseSlug: 'itps-uas-remote',
      }),
    );
    await res.text();
    expect(buildChatStream).toHaveBeenCalledWith(
      expect.objectContaining({
        courseSlug: 'itps-uas-remote',
        userId: 'u1',
      }),
    );
  });

  it('passes courseSlug through as undefined when the request omits it (e.g. /app)', async () => {
    const res = await chatHandler(
      postReq({
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
      }),
    );
    await res.text();
    expect(buildChatStream).toHaveBeenCalledWith(
      expect.objectContaining({ courseSlug: undefined, userId: 'u1' }),
    );
  });
});

describe('chatHandler — SKA profile', () => {
  const PROFILE = {
    profile: { skills: 'Flies gliders.', knowledge: null, attitude: 'Direct.' },
  };

  it('passes the resolved profile through to buildChatStream', async () => {
    resolveChatSkaProfile.mockResolvedValueOnce(PROFILE);

    await chatHandler(
      postReq({
        courseSlug: 'itps-uas-remote',
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
      }),
    );

    // Asserting the CONSUMER received it. A test that only checked
    // `resolveChatSkaProfile` was called would still pass if the route
    // computed the profile and then forgot to pass it on — which is precisely
    // the failure mode this codebase keeps producing.
    expect(buildChatStream.mock.calls[0][0].skaProfile).toEqual(PROFILE);
  });

  it('resolves the profile against the course in context', async () => {
    await chatHandler(
      postReq({
        courseSlug: 'itps-uas-remote',
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
      }),
    );

    expect(resolveChatSkaProfile).toHaveBeenCalledWith({
      userId: 'u1',
      courseSlug: 'itps-uas-remote',
    });
  });

  it('passes no courseSlug when the widget has no course in context', async () => {
    // The `/app` case. The section narrowing to attitude-only happens inside
    // resolveChatSkaProfile; what the route owes it is an honest `undefined`
    // rather than a guessed slug.
    await chatHandler(
      postReq({
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
      }),
    );

    expect(resolveChatSkaProfile).toHaveBeenCalledWith({
      userId: 'u1',
      courseSlug: undefined,
    });
  });

  it('streams normally for a learner with no profile', async () => {
    resolveChatSkaProfile.mockResolvedValueOnce(undefined);

    const res = await chatHandler(
      postReq({
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
      }),
    );

    // No profile is an ordinary state, not an error — viper7 must behave
    // exactly as it did before profiles existed.
    expect(res.status).toBe(200);
    expect(buildChatStream.mock.calls[0][0].skaProfile).toBeUndefined();
  });
});

/**
 * The persona a chat turn ends up using is decided by a three-rung chain
 * (course selection → org default → nothing). Every assertion here reads the
 * argument `buildChatStream` was actually called with, not what the resolver
 * returned: the defect this guards against is the resolved persona being
 * computed correctly and then not handed to the prompt builder.
 */
describe('chatHandler — persona resolution', () => {
  const userMessage = {
    messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
  };

  it("passes the course's persona content through to the prompt builder", async () => {
    resolvePersonaForChat.mockResolvedValueOnce({
      content: { basicInfo: 'course persona' },
      source: 'course',
    });

    await chatHandler(
      postReq({ ...userMessage, courseSlug: 'itps-uas-remote' }),
    );

    expect(resolvePersonaForChat).toHaveBeenCalledWith({
      orgId: 1,
      courseSlug: 'itps-uas-remote',
    });
    expect(buildChatStream.mock.calls[0][0].persona).toEqual({
      basicInfo: 'course persona',
    });
  });

  it('passes the org default through when no course is in context', async () => {
    resolvePersonaForChat.mockResolvedValueOnce({
      content: { basicInfo: 'org default persona' },
      source: 'org-default',
    });

    await chatHandler(postReq(userMessage));

    expect(resolvePersonaForChat).toHaveBeenCalledWith({
      orgId: 1,
      courseSlug: undefined,
    });
    expect(buildChatStream.mock.calls[0][0].persona).toEqual({
      basicInfo: 'org default persona',
    });
  });

  it('passes undefined when nothing resolves, so the prompt uses its own defaults', async () => {
    resolvePersonaForChat.mockResolvedValueOnce(null);

    await chatHandler(postReq(userMessage));

    expect(buildChatStream.mock.calls[0][0].persona).toBeUndefined();
  });

  it('never hands a draft to the prompt builder', async () => {
    // The resolver only ever selects `content`; this pins the route's half of
    // that contract — if it ever started forwarding a draft field, the whole
    // point of the draft column (unpublished text staying out of live system
    // prompts) would be silently lost.
    resolvePersonaForChat.mockResolvedValueOnce({
      content: { basicInfo: 'published' },
      draftContent: { basicInfo: 'HALF-TYPED DRAFT' },
      source: 'course',
    });

    await chatHandler(
      postReq({ ...userMessage, courseSlug: 'itps-uas-remote' }),
    );

    const passed = buildChatStream.mock.calls[0][0].persona;
    expect(passed).toEqual({ basicInfo: 'published' });
    expect(JSON.stringify(passed)).not.toContain('HALF-TYPED DRAFT');
  });
});
