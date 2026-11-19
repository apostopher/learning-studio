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
