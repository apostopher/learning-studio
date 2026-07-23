// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, listChats, getChat } = vi.hoisted(() => ({
  getSession: vi.fn(),
  listChats: vi.fn(),
  getChat: vi.fn(),
}));
vi.mock('#/lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('#/db/chat', () => ({ listChats, getChat }));

import { listChatsHandler } from '../chats';
import { getChatHandler } from '../chats.$chatId';

function getReq(url: string): Request {
  return new Request(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'user-1' } });
});

describe('listChatsHandler', () => {
  it('401 when not authenticated', async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await listChatsHandler(getReq('http://test/api/chats'));
    expect(res.status).toBe(401);
    expect(listChats).not.toHaveBeenCalled();
  });

  it("returns listChats(user.id)'s result", async () => {
    const chats = [{ id: 'chat-1', title: 'Hello', updatedAt: new Date() }];
    listChats.mockResolvedValue(chats);
    const res = await listChatsHandler(getReq('http://test/api/chats'));
    expect(listChats).toHaveBeenCalledWith('user-1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(
      chats.map((c) => ({ ...c, updatedAt: c.updatedAt.toISOString() })),
    );
  });
});

describe('getChatHandler', () => {
  it('401 when not authenticated', async () => {
    getSession.mockResolvedValueOnce(null);
    const res = await getChatHandler(
      getReq('http://test/api/chats/chat-1'),
      'chat-1',
    );
    expect(res.status).toBe(401);
    expect(getChat).not.toHaveBeenCalled();
  });

  it('returns getChat(user.id, chatId) result', async () => {
    const chat = {
      chat: { id: 'chat-1', title: 'Hello' },
      messages: [{ id: 'm1', role: 'user', parts: [] }],
    };
    getChat.mockResolvedValue(chat);
    const res = await getChatHandler(
      getReq('http://test/api/chats/chat-1'),
      'chat-1',
    );
    expect(getChat).toHaveBeenCalledWith('user-1', 'chat-1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(JSON.parse(JSON.stringify(chat)));
  });

  it('404 when getChat returns null', async () => {
    getChat.mockResolvedValue(null);
    const res = await getChatHandler(
      getReq('http://test/api/chats/missing'),
      'missing',
    );
    expect(res.status).toBe(404);
  });
});
