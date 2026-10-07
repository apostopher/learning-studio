// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 's'.repeat(32);
const {
  getCallByConversation,
  getChat,
  buildChatStream,
  resolvePersonaForChat,
  resolveChatSkaProfile,
} = vi.hoisted(() => ({
  getCallByConversation: vi.fn(),
  getChat: vi.fn(),
  buildChatStream: vi.fn(),
  resolvePersonaForChat: vi.fn(),
  resolveChatSkaProfile: vi.fn(),
}));
vi.mock('#/env', () => ({ env: { TAVUS_LLM_SECRET: 's'.repeat(32) } }));
vi.mock('#/db/video-calls', () => ({ getCallByConversation }));
vi.mock('#/db/chat', () => ({ getChat }));
vi.mock('#/ai/chat', () => ({ buildChatStream }));
vi.mock('#/db/course-orgs', () => ({ resolvePersonaForChat }));
vi.mock('#/lib/active-org.server', () => ({ getActiveOrgId: () => 7 }));
vi.mock('#/lib/ska-profile.server', () => ({ resolveChatSkaProfile }));

import {
  VOICE_FALLBACK_REPLY,
  VOICE_NO_TURN_REPLY,
} from '#/ai/prompts/voice-mode';
import { PERSONA_SENTINEL } from '#/lib/tavus-messages';
import { tavusCompletionsHandler } from '../tavus/v1/chat/completions';

const ACTIVE_CALL = {
  id: 'vc1',
  userId: 'u1',
  userName: 'Rahul',
  chatId: 'chat-1',
  courseSlug: 'ppl',
  tavusConversationId: 'conv-1',
  status: 'active',
  reservedSeconds: 600,
  startedAt: new Date('2026-10-06T12:00:00Z'),
  endedAt: null,
  durationSeconds: null,
  endReason: null,
  transcriptSavedAt: null,
};

const BODY = {
  model: 'viper7',
  stream: true,
  messages: [
    {
      role: 'system',
      content: `${PERSONA_SENTINEL}\n\nEVERY RESPONSE MUST BEGIN WITH AN EMOTION TAG.`,
    },
    { role: 'assistant', content: "Hi, it's Viper7." },
    {
      role: 'system',
      content: '<user_appearance>\nGlasses.\n</user_appearance>',
    },
    { role: 'user', content: 'What is Vref?' },
  ],
};

function req(opts: { auth?: string; conv?: string; body?: unknown } = {}) {
  return new Request('http://t/api/tavus/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: opts.auth ?? `Bearer ${SECRET}`,
      'conversation-id': opts.conv ?? 'conv-1',
      'content-type': 'application/json',
    },
    body: JSON.stringify(opts.body ?? BODY),
  });
}

async function spokenText(res: Response): Promise<string> {
  const raw = await res.text();
  return raw
    .split('\n\n')
    .filter((e) => e.startsWith('data: ') && e !== 'data: [DONE]')
    .map((e) => JSON.parse(e.slice(6)).choices[0].delta.content ?? '')
    .join('');
}

async function* gen(parts: string[]) {
  for (const p of parts) yield p;
}

beforeEach(() => {
  vi.clearAllMocks();
  getCallByConversation.mockResolvedValue(ACTIVE_CALL);
  getChat.mockResolvedValue({
    chat: { id: 'chat-1' },
    messages: [
      {
        id: 'm1',
        chatId: 'chat-1',
        role: 'user',
        parts: [{ type: 'text', text: 'earlier question' }],
        order: 0,
        createdAt: new Date(),
      },
    ],
  });
  resolvePersonaForChat.mockResolvedValue({
    content: { basicInfo: 'published' },
  });
  resolveChatSkaProfile.mockResolvedValue(undefined);
  buildChatStream.mockImplementation(async () => ({
    textStream: gen([
      '<emotion value="content"/>',
      'Vref is ',
      'reference speed.',
    ]),
  }));
});

describe('tavusCompletionsHandler', () => {
  it('401 with the wrong secret', async () => {
    const res = await tavusCompletionsHandler(req({ auth: 'Bearer nope' }));
    expect(res.status).toBe(401);
    expect(getCallByConversation).not.toHaveBeenCalled();
  });

  it('401 for an unknown conversation', async () => {
    getCallByConversation.mockResolvedValueOnce(null);
    const res = await tavusCompletionsHandler(req());
    expect(res.status).toBe(401);
    expect(buildChatStream).not.toHaveBeenCalled();
  });

  it('401 for an ended call', async () => {
    getCallByConversation.mockResolvedValueOnce({
      ...ACTIVE_CALL,
      status: 'ended',
    });
    const res = await tavusCompletionsHandler(req());
    expect(res.status).toBe(401);
    expect(buildChatStream).not.toHaveBeenCalled();
  });

  it("answers Tavus's configuration check without a database lookup", async () => {
    const res = await tavusCompletionsHandler(
      req({ conv: 'tavus-openai-compat-test' }),
    );
    expect(res.status).toBe(200);
    expect(await spokenText(res)).toBe(
      'Custom LLM configuration test successful.',
    );
    expect(getCallByConversation).not.toHaveBeenCalled();
  });

  it("gives buildChatStream the call's learner, course, persona and cleaned history", async () => {
    const res = await tavusCompletionsHandler(req());
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    expect(await spokenText(res)).toBe(
      '<emotion value="content"/>Vref is reference speed.',
    );

    expect(resolvePersonaForChat).toHaveBeenCalledWith({
      orgId: 7,
      courseSlug: 'ppl',
    });
    expect(resolveChatSkaProfile).toHaveBeenCalledWith({
      userId: 'u1',
      courseSlug: 'ppl',
    });
    expect(getChat).toHaveBeenCalledWith('u1', 'chat-1');

    const args = buildChatStream.mock.calls[0]?.[0];
    expect(args).toMatchObject({
      userId: 'u1',
      courseSlug: 'ppl',
      persona: { basicInfo: 'published' },
      userInfo: { name: 'Rahul', callSign: 'unknown', location: 'unknown' },
      subscriptions: [],
    });
    expect(args.voice.tavusRules).toContain('EMOTION TAG');
    expect(args.voice.tavusRules).not.toContain(PERSONA_SENTINEL);
    expect(args.voice.tavusRules).not.toContain('Glasses');
    expect(
      args.messages.map((m: { role: string; parts: unknown }) => [
        m.role,
        m.parts,
      ]),
    ).toEqual([
      ['user', [{ type: 'text', text: 'earlier question' }]],
      ['assistant', [{ type: 'text', text: "Hi, it's Viper7." }]],
      ['user', [{ type: 'text', text: 'What is Vref?' }]],
    ]);
    expect(args.uiMessages).toBe(args.messages);
    expect(args.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('speaks a short line without calling the model when the learner has not spoken', async () => {
    const res = await tavusCompletionsHandler(
      req({ body: { messages: [BODY.messages[0], BODY.messages[1]] } }),
    );
    expect(await spokenText(res)).toBe(VOICE_NO_TURN_REPLY);
    expect(buildChatStream).not.toHaveBeenCalled();
  });

  it('speaks the fallback when generation fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    buildChatStream.mockRejectedValueOnce(new Error('model down'));
    const res = await tavusCompletionsHandler(req());
    expect(await spokenText(res)).toBe(VOICE_FALLBACK_REPLY);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('400 on a malformed body', async () => {
    const res = await tavusCompletionsHandler(req({ body: { nope: true } }));
    expect(res.status).toBe(400);
  });
});
