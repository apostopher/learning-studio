// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useChatMessages } from '#/data-hooks/use-chat-messages';
import { useChats } from '#/data-hooks/use-chats';

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('useChats', () => {
  it('fetches the chat list and returns the parsed payload', async () => {
    const chats = [
      {
        id: 'chat-1',
        title: 'First chat',
        updatedAt: '2026-07-20T10:00:00.000Z',
      },
      {
        id: 'chat-2',
        title: 'Second chat',
        updatedAt: '2026-07-21T10:00:00.000Z',
      },
    ];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => chats,
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useChats(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith('/api/chats');
    expect(result.current.data).toEqual(chats);
  });
});

describe('useChatMessages', () => {
  it('fetches a single chat with its messages and returns the parsed payload', async () => {
    const payload = {
      chat: {
        id: 'chat-1',
        userId: 'user-1',
        title: 'First chat',
        createdAt: '2026-07-20T10:00:00.000Z',
        updatedAt: '2026-07-20T10:00:00.000Z',
      },
      messages: [
        {
          id: 'msg-1',
          chatId: 'chat-1',
          role: 'user',
          parts: [{ type: 'text', text: 'hello' }],
          order: 0,
          createdAt: '2026-07-20T10:00:00.000Z',
        },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payload,
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useChatMessages('chat 1/a'), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith('/api/chats/chat%201%2Fa');
    expect(result.current.data).toEqual(payload);
  });

  it('is disabled (no fetch) when chatId is empty', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useChatMessages(''), {
      wrapper: wrapper(),
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });
});
