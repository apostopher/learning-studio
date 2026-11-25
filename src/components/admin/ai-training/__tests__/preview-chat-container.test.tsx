// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider } from 'jotai';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `useChat` is the collaborator under test: what the container hands it
// (its transport, the per-send body) and what it calls on it (`setMessages`).
const chat = vi.hoisted(() => ({
  useChat: vi.fn(),
  setMessages: vi.fn(),
  sendMessage: vi.fn(),
  stop: vi.fn(),
}));
vi.mock('@ai-sdk/react', () => ({ useChat: chat.useChat }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// jsdom has no ResizeObserver; scroll pinning is not what these tests cover.
vi.mock('use-stick-to-bottom', () => ({
  useStickToBottom: () => ({ scrollRef: undefined, contentRef: undefined }),
}));

import { PreviewChatContainer } from '../preview-chat-container';

function lesson(id: number, slug: string, name: string) {
  return {
    id,
    slug,
    name,
    isConfigured: true,
    isAvailable: true,
    courseCount: 0,
    courseIds: [],
    version: '1.0',
    videoProvider: null,
    disciplineModuleId: null,
    levels: [],
    requiredSubscriptions: [],
    hasDebrief: false,
    needsVideoWatch: false,
  };
}

const LIBRARY = {
  disciplines: [],
  untitled: [
    lesson(1, 'crosswind-landings', 'Crosswind landings'),
    lesson(2, 'go-arounds', 'Go-arounds'),
  ],
};

const CONTENT = {
  basicInfo: 'b',
  mission: '',
  goal: '',
  communicationStyle: '',
  quotes: [],
  coreDirective: '',
  howToAnswer: '',
};

const PERSONAS = [
  {
    id: 3,
    name: 'Viper7',
    content: CONTENT,
    draftContent: { ...CONTENT, basicInfo: 'draft' },
    isPublished: true,
    isOrgDefault: true,
    usedByCourses: [],
    updatedAt: '2026-11-19T00:00:00Z',
  },
  {
    id: 4,
    name: 'Hornet',
    content: CONTENT,
    draftContent: null,
    isPublished: true,
    isOrgDefault: false,
    usedByCourses: [],
    updatedAt: '2026-11-19T00:00:00Z',
  },
];

const fetchMock = vi.fn();

function renderSection() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <Provider store={createStore()}>{children}</Provider>
    </QueryClientProvider>
  );
  return render(<PreviewChatContainer />, { wrapper });
}

/** Picks a lesson the way an admin does: type to filter, click the option. */
async function pickLesson(name: string) {
  const input = await screen.findByRole('combobox', { name: 'Lesson' });
  const user = userEvent.setup();
  await user.clear(input);
  await user.type(input, name.slice(0, 4));
  await user.click(await screen.findByRole('option', { name }));
}

beforeEach(() => {
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/admin/personas') {
      return { ok: true, json: async () => PERSONAS };
    }
    if (url === '/api/admin/library') {
      return { ok: true, json: async () => LIBRARY };
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  chat.useChat.mockReturnValue({
    messages: [],
    status: 'ready',
    error: undefined,
    sendMessage: chat.sendMessage,
    setMessages: chat.setMessages,
    stop: chat.stop,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('PreviewChatContainer', () => {
  it('says why the input is disabled before a lesson is picked', async () => {
    renderSection();
    await screen.findByText('Testing draft');
    const input = screen.getByRole('textbox', {
      name: 'Pick a lesson to start',
    }) as HTMLTextAreaElement;
    expect(input.disabled).toBe(true);
    expect(input.placeholder).toBe('Pick a lesson to start');
  });

  it('points useChat at the preview endpoint', () => {
    renderSection();
    const { transport } = chat.useChat.mock.calls[0][0] as {
      transport: { api: string };
    };
    expect(transport.api).toBe('/api/admin/viper/preview');
  });

  it('clears the conversation when the lesson changes', async () => {
    renderSection();
    await screen.findByText('Testing draft');

    await pickLesson('Crosswind landings');
    await waitFor(() => expect(chat.setMessages).toHaveBeenCalledWith([]));
    chat.setMessages.mockClear();

    await pickLesson('Go-arounds');
    await waitFor(() => expect(chat.setMessages).toHaveBeenCalledWith([]));
  });

  it('clears the conversation when the persona changes', async () => {
    renderSection();
    await screen.findByText('Testing draft');
    expect(chat.setMessages).not.toHaveBeenCalled();

    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Persona' }));
    await user.click(await screen.findByRole('option', { name: 'Hornet' }));

    await waitFor(() => expect(chat.setMessages).toHaveBeenCalledWith([]));
    // The new persona is the one under test now: published, not a draft.
    await screen.findByText('Testing published');
  });

  it('sends the picked lesson and the default persona with each message', async () => {
    renderSection();
    await screen.findByText('Testing draft');
    await pickLesson('Crosswind landings');

    const input = await screen.findByRole('textbox', { name: 'Message' });
    fireEvent.change(input, { target: { value: 'What is a crab angle?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(chat.sendMessage).toHaveBeenCalledTimes(1));
    expect(chat.sendMessage).toHaveBeenCalledWith(
      { text: 'What is a crab angle?' },
      { body: { personaId: 3, lessonSlug: 'crosswind-landings' } },
    );
  });
});
