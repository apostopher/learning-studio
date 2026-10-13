// @vitest-environment node
import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Only streamText (and the stream transform helpers) are stubbed — the REAL
// convertToModelMessages runs, because the defect is in how it converts our
// persisted history.
const { streamText } = vi.hoisted(() => ({
  streamText: vi.fn((_opts: Record<string, unknown>) => ({
    textStream: 'stream',
  })),
}));
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    streamText,
    smoothStream: vi.fn(() => 'smooth'),
  };
});
vi.mock('#/ai/ai-provider', () => ({ geminiFlash: 'model' }));
vi.mock('#/ai/prompts/viper7', () => ({
  viper7SystemPrompt: (o: { conversationSummary?: string | null }) =>
    `BASE PROMPT${o.conversationSummary ? ` | ${o.conversationSummary}` : ''}`,
}));
vi.mock('#/ai/tools/search-kb', () => ({ makeSearchKBTool: () => 'searchKB' }));
vi.mock('#/ai/tools/check-flyability', () => ({
  makeCheckFlyabilityTool: () => 'checkFlyability',
}));

import { buildChatStream } from '#/ai/chat';

type ModelMessageLike = { role: string; content: unknown };

const history = [
  {
    id: 'n1',
    role: 'assistant',
    parts: [
      { type: 'data-notification', data: { text: 'Video call with Viper7' } },
    ],
  },
  { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'What is QNH?' }] },
  {
    id: 'a1',
    role: 'assistant',
    parts: [{ type: 'text', text: 'Altimeter setting to read altitude.' }],
  },
  {
    id: 'n2',
    role: 'assistant',
    parts: [
      { type: 'data-notification', data: { text: 'Video call ended · 2 min' } },
    ],
  },
  {
    id: 'a2',
    role: 'assistant',
    parts: [
      {
        type: 'tool-searchKB',
        toolCallId: 'call-1',
        state: 'input-available',
        input: { query: 'qnh' },
      },
    ],
  },
  { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'Thanks' }] },
] as unknown as UIMessage[];

beforeEach(() => vi.clearAllMocks());

describe('buildChatStream history conversion', () => {
  it('turns data-notification status lines into bracketed text and never sends an empty turn', async () => {
    await buildChatStream({
      messages: history,
      uiMessages: history,
      subscriptions: [],
      userId: 'u1',
    });

    const sent = (streamText.mock.calls[0]?.[0] as Record<string, unknown>)
      .messages as ModelMessageLike[];

    const isEmpty = (m: ModelMessageLike) =>
      Array.isArray(m.content) ? m.content.length === 0 : !m.content;
    expect(sent.filter(isEmpty)).toEqual([]);

    const allText = JSON.stringify(sent);
    expect(allText).toContain('[Video call with Viper7]');
    expect(allText).toContain('[Video call ended · 2 min]');
    // The incomplete searchKB call is dropped, not replayed without a result.
    expect(allText).not.toContain('call-1');
  });
});

const toolTurn = (id: string, query: string): UIMessage =>
  ({
    id,
    role: 'assistant',
    parts: [
      {
        type: 'tool-searchKB',
        toolCallId: `call-${id}`,
        state: 'output-available',
        input: { query },
        output: `HUGE COURSE DUMP ${id}`,
      },
      { type: 'text', text: `answer ${id}` },
    ],
  }) as UIMessage;

describe('buildChatStream history pruning', () => {
  it('drops tool calls and results from earlier turns but keeps their text', async () => {
    await buildChatStream({
      messages: [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'q1' }] },
        toolTurn('a1', 'q1'),
        { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'q2' }] },
      ],
      uiMessages: [],
      subscriptions: [],
      userId: 'u',
    });
    const sent = JSON.stringify(
      (streamText.mock.calls.at(-1)?.[0] as Record<string, unknown>).messages,
    );
    expect(sent).not.toContain('HUGE COURSE DUMP');
    expect(sent).not.toContain('tool-call');
    expect(sent).toContain('answer a1');
    expect(sent).toContain('q2');
  });

  it('hands the conversation summary to the system prompt', async () => {
    await buildChatStream({
      messages: [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'q' }] },
      ],
      uiMessages: [],
      subscriptions: [],
      userId: 'u',
      conversationSummary: 'SUMMARY-XYZ',
    });
    expect(
      (streamText.mock.calls.at(-1)?.[0] as Record<string, unknown>).system,
    ).toContain('SUMMARY-XYZ');
  });
});
