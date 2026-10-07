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
  viper7SystemPrompt: () => 'BASE PROMPT',
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
