// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { streamText, smoothStream } = vi.hoisted(() => ({
  streamText: vi.fn((_opts: Record<string, unknown>) => ({
    textStream: 'stream',
  })),
  smoothStream: vi.fn((opts: unknown) => ({ smooth: opts })),
}));
vi.mock('ai', () => ({
  convertToModelMessages: vi.fn(async (m: unknown) => m),
  smoothStream,
  stepCountIs: vi.fn((n: number) => ({ steps: n })),
  streamText,
}));
vi.mock('#/ai/ai-provider', () => ({ geminiFlash: 'model' }));
vi.mock('#/ai/prompts/viper7', () => ({
  viper7SystemPrompt: () => 'BASE PROMPT',
}));
vi.mock('#/ai/tools/search-kb', () => ({ makeSearchKBTool: () => 'searchKB' }));
vi.mock('#/ai/tools/check-flyability', () => ({
  makeCheckFlyabilityTool: () => 'checkFlyability',
}));

import { buildChatStream } from '#/ai/chat';
import { VOICE_MODE_PROMPT } from '#/ai/prompts/voice-mode';

const base = { messages: [], uiMessages: [], subscriptions: [], userId: 'u1' };

beforeEach(() => vi.clearAllMocks());

describe('buildChatStream', () => {
  it('text chat is unchanged: base prompt only, line chunking', async () => {
    await buildChatStream(base);
    const args = streamText.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args.system).toBe('BASE PROMPT');
    expect(smoothStream).toHaveBeenCalledWith({
      delayInMs: 20,
      chunking: 'line',
    });
  });

  it('voice: appends the voice prompt and Tavus rules, word chunking, abort signal', async () => {
    const abortSignal = new AbortController().signal;
    await buildChatStream({
      ...base,
      voice: { tavusRules: 'TAVUS RULES' },
      abortSignal,
    });
    const args = streamText.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args.system).toBe(
      `BASE PROMPT\n\n${VOICE_MODE_PROMPT}\n\nTAVUS RULES`,
    );
    expect(args.abortSignal).toBe(abortSignal);
    expect(smoothStream).toHaveBeenCalledWith({
      delayInMs: 20,
      chunking: 'word',
    });
  });
});
