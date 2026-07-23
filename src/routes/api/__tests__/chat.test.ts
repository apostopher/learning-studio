// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getSession,
  buildChatStream,
  getPersona,
  ensureChat,
  appendMessages,
  getUserRoleNames,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  buildChatStream: vi.fn(),
  getPersona: vi.fn(),
  ensureChat: vi.fn(),
  appendMessages: vi.fn(),
  getUserRoleNames: vi.fn(),
}));
vi.mock('#/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('#/ai/chat', () => ({ buildChatStream, isAssociateFrom: () => false }));
vi.mock('#/db/persona', () => ({ getPersona }));
vi.mock('#/db/chat', () => ({ ensureChat, appendMessages }));
vi.mock('#/db/admin', () => ({ getUserRoleNames }));

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
  getPersona.mockResolvedValue({ name: 'viper7', content: {} });
  getUserRoleNames.mockResolvedValue([]);
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

  it('streams when authed', async () => {
    const res = await chatHandler(
      postReq({
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
      }),
    );
    expect(res).toBeInstanceOf(Response);
    // Drain the response body so the stream's execute() (which awaits
    // buildChatStream) actually runs before we assert on the mock.
    await res.text();
    expect(buildChatStream).toHaveBeenCalled();
  });
});
