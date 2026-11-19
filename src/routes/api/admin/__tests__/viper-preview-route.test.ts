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
    requireAdmin: vi.fn(),
    getPersonaById: vi.fn(),
    lessonExistsBySlug: vi.fn(),
    buildChatStream: vi.fn(),
    makePreviewSearchKBTool: vi.fn(),
    appendMessages: vi.fn(),
    createChat: vi.fn(),
    ensureChat: vi.fn(),
  };
});
vi.mock('#/lib/admin-functions.server', () => ({
  requireAdmin: m.requireAdmin,
  ForbiddenError: m.ForbiddenError,
}));
vi.mock('#/db/persona', () => ({ getPersonaById: m.getPersonaById }));
vi.mock('#/db/lesson', () => ({ lessonExistsBySlug: m.lessonExistsBySlug }));
vi.mock('#/ai/chat', () => ({ buildChatStream: m.buildChatStream }));
vi.mock('#/ai/tools/search-kb', () => ({
  makePreviewSearchKBTool: m.makePreviewSearchKBTool,
}));
// Mocked so the test can prove the preview never touches persistence, even
// though the route has no reason to import it.
vi.mock('#/db/chat', () => ({
  appendMessages: m.appendMessages,
  createChat: m.createChat,
  ensureChat: m.ensureChat,
}));
vi.mock('#/lib/active-org.server', () => ({ getActiveOrgId: () => 1 }));

import {
  PREVIEW_MAX_TOTAL_TEXT,
  PREVIEW_MAX_USER_TEXT,
} from '#/lib/viper-preview-schemas';
import { previewChatHandler } from '../viper.preview';

const CONTENT = {
  basicInfo: 'published',
  mission: '',
  goal: '',
  communicationStyle: '',
  quotes: [],
  coreDirective: '',
  howToAnswer: '',
};
const DRAFT = { ...CONTENT, basicInfo: 'draft' };

/** A persona row as the database holds it, org included. */
let row: {
  orgId: number;
  id: number;
  name: string;
  content: typeof CONTENT;
  draftContent: typeof CONTENT | null;
};

const MESSAGES = [
  { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
];

function post(body: unknown): Request {
  return new Request('http://t/api/admin/viper/preview', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const valid = {
  personaId: 3,
  lessonSlug: 'crosswind-landings',
  messages: MESSAGES,
};

/** Drains the stream so `execute` (which calls buildChatStream) runs. */
async function run(body: unknown = valid): Promise<Response> {
  const res = await previewChatHandler(post(body));
  await res.text();
  return res;
}

const firstCall = () =>
  m.buildChatStream.mock.calls[0][0] as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  row = {
    orgId: 1,
    id: 3,
    name: 'Viper7',
    content: CONTENT,
    draftContent: DRAFT,
  };
  m.requireAdmin.mockResolvedValue({ userId: 'admin-1', roles: ['admin'] });
  // Behaves like the real query: scoped by org, so a persona from another
  // org is invisible rather than returned.
  m.getPersonaById.mockImplementation(async (orgId: number, id: number) =>
    row.orgId === orgId && row.id === id
      ? {
          id: row.id,
          name: row.name,
          content: row.content,
          draftContent: row.draftContent,
          isPublished: true,
          isOrgDefault: true,
          updatedAt: new Date(),
        }
      : null,
  );
  m.lessonExistsBySlug.mockResolvedValue(true);
  m.makePreviewSearchKBTool.mockImplementation((opts: unknown) => ({
    __previewTool: opts,
  }));
  m.buildChatStream.mockResolvedValue({
    toUIMessageStream: () => (async function* () {})(),
  });
});

describe('previewChatHandler', () => {
  it('refuses non-admins', async () => {
    m.requireAdmin.mockRejectedValueOnce(new m.ForbiddenError());
    const res = await run();
    expect(res.status).toBe(403);
    expect(m.buildChatStream).not.toHaveBeenCalled();
    expect(m.getPersonaById).not.toHaveBeenCalled();
  });

  it('404s a persona from another org', async () => {
    row.orgId = 999;
    const res = await run();
    expect(res.status).toBe(404);
    expect(await previewChatHandler(post(valid)).then((r) => r.json())).toEqual(
      { error: 'Persona not found' },
    );
    expect(m.getPersonaById).toHaveBeenCalledWith(1, 3);
    expect(m.buildChatStream).not.toHaveBeenCalled();
  });

  it('404s a lesson that does not exist', async () => {
    m.lessonExistsBySlug.mockResolvedValue(false);
    const res = await previewChatHandler(post(valid));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Lesson not found' });
    expect(m.lessonExistsBySlug).toHaveBeenCalledWith('crosswind-landings');
    expect(m.buildChatStream).not.toHaveBeenCalled();
  });

  it('400s more than 40 messages', async () => {
    const res = await run({
      ...valid,
      messages: Array.from({ length: 41 }, (_, i) => ({
        ...MESSAGES[0],
        id: `m${i}`,
      })),
    });
    expect(res.status).toBe(400);
    expect(m.buildChatStream).not.toHaveBeenCalled();
  });

  it('400s messages that are not UI messages', async () => {
    const res = await run({ ...valid, messages: [{ nope: true }] });
    expect(res.status).toBe(400);
    expect(m.buildChatStream).not.toHaveBeenCalled();
  });

  describe('message size', () => {
    const TOO_LONG = {
      error:
        'This preview conversation is too long or contains unsupported content. Start a new chat.',
    };
    const user = (id: string, text: string) => ({
      id,
      role: 'user',
      parts: [{ type: 'text', text }],
    });
    const assistant = (id: string, text: string) => ({
      id,
      role: 'assistant',
      parts: [{ type: 'text', text }],
    });

    it('400s one oversized user text part', async () => {
      const res = await previewChatHandler(
        post({
          ...valid,
          messages: [user('u1', 'x'.repeat(PREVIEW_MAX_USER_TEXT + 1))],
        }),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual(TOO_LONG);
      expect(m.buildChatStream).not.toHaveBeenCalled();
    });

    it('400s a conversation over the total text cap', async () => {
      // Every part is under the per-part cap; only the total is over.
      const perPart = PREVIEW_MAX_USER_TEXT;
      const count = Math.floor(PREVIEW_MAX_TOTAL_TEXT / perPart) + 1;
      const res = await previewChatHandler(
        post({
          ...valid,
          messages: Array.from({ length: count }, (_, i) =>
            i % 2 === 0
              ? user(`m${i}`, 'x'.repeat(perPart))
              : assistant(`m${i}`, 'x'.repeat(perPart)),
          ),
        }),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual(TOO_LONG);
      expect(m.buildChatStream).not.toHaveBeenCalled();
    });

    it('400s a message with a file part', async () => {
      const res = await previewChatHandler(
        post({
          ...valid,
          messages: [
            {
              id: 'u1',
              role: 'user',
              parts: [
                { type: 'text', text: 'look' },
                {
                  type: 'file',
                  mediaType: 'application/pdf',
                  url: 'https://example.com/big.pdf',
                },
              ],
            },
          ],
        }),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual(TOO_LONG);
      expect(m.buildChatStream).not.toHaveBeenCalled();
    });

    it('still reaches the model just under the caps', async () => {
      // A long assistant answer is fine past the per-USER-part cap; the
      // total lands exactly on the limit.
      const messages = [
        user('u1', 'x'.repeat(PREVIEW_MAX_USER_TEXT)),
        assistant(
          'a1',
          'x'.repeat(PREVIEW_MAX_TOTAL_TEXT - PREVIEW_MAX_USER_TEXT - 1),
        ),
        user('u2', 'x'),
      ];
      const res = await run({ ...valid, messages });
      expect(res.status).toBe(200);
      expect(m.buildChatStream).toHaveBeenCalledTimes(1);
      expect(firstCall().messages).toEqual(messages);
    });
  });

  it('tests the draft when there is one', async () => {
    await run();
    expect(firstCall().persona).toEqual(DRAFT);

    vi.clearAllMocks();
    row.draftContent = null;
    await run();
    expect(firstCall().persona).toEqual(CONTENT);
  });

  it('passes the messages, a placeholder learner and the admin id', async () => {
    await run();
    const call = firstCall();
    expect(call.messages).toEqual(MESSAGES);
    expect(call.uiMessages).toEqual(MESSAGES);
    expect(call.userInfo).toEqual({
      name: 'Preview learner',
      callSign: '',
      location: '',
    });
    expect(call.subscriptions).toEqual([]);
    expect(call.userId).toBe('admin-1');
    // A closed tab cancels generation rather than running it to the end.
    expect(call.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('never personalises or persists', async () => {
    await run();
    const call = firstCall();
    for (const key of [
      'courseSlug',
      'skaProfile',
      'debriefGaps',
      'openDebriefQuestions',
      'chatId',
      'conversationSummary',
    ]) {
      expect(call[key]).toBeUndefined();
    }
    expect(m.appendMessages).not.toHaveBeenCalled();
    expect(m.createChat).not.toHaveBeenCalled();
    expect(m.ensureChat).not.toHaveBeenCalled();
  });

  it('scopes search to the picked lesson', async () => {
    await run();
    expect(m.makePreviewSearchKBTool).toHaveBeenCalledTimes(1);
    const opts = m.makePreviewSearchKBTool.mock.calls[0][0] as {
      lessonSlug: string;
      writer: unknown;
    };
    expect(opts.lessonSlug).toBe('crosswind-landings');
    expect(opts.writer).toBeDefined();
    // The tool buildChatStream received is the one that factory made.
    expect(firstCall().searchKBTool).toBe(
      m.makePreviewSearchKBTool.mock.results[0].value,
    );
  });
});
