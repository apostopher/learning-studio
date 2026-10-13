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
  pruneMessages: vi.fn((o: { messages: unknown }) => o.messages),
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

describe('buildChatStream — usage log', () => {
  type Hooks = {
    onChunk: (e: { chunk: { type: string } }) => void;
    onFinish: (e: unknown) => void;
  };
  const finish = {
    totalUsage: {
      inputTokens: 100,
      outputTokens: 7,
      inputTokenDetails: { cacheReadTokens: 80 },
    },
    steps: [{ usage: { inputTokens: 60 } }, { usage: { inputTokens: 40 } }],
  };

  async function run(extra: Record<string, unknown>) {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await buildChatStream({ ...base, ...extra });
    const hooks = streamText.mock.calls[0]?.[0] as unknown as Hooks;
    hooks.onChunk({ chunk: { type: 'text-delta' } });
    hooks.onFinish(finish);
    const logged = info.mock.calls.find((c) => c[0] === 'viper7 usage')?.[1];
    info.mockRestore();
    return logged as Record<string, unknown>;
  }

  it('tags the turn with chat id and channel, and records time to first chunk', async () => {
    const logged = await run({ chatId: 'chat-9' });
    expect(logged).toMatchObject({
      chatId: 'chat-9',
      channel: 'text',
      steps: 2,
      inputTokens: 100,
      cachedInputTokens: 80,
      outputTokens: 7,
    });
    expect(typeof logged.timeToFirstChunkMs).toBe('number');
  });

  it('marks a voice turn as voice', async () => {
    const logged = await run({ chatId: 'c', voice: { tavusRules: 'r' } });
    expect(logged.channel).toBe('voice');
  });

  it('records only the first text chunk, ignoring non-text chunks', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await buildChatStream(base);
    const hooks = streamText.mock.calls[0]?.[0] as unknown as Hooks;
    hooks.onChunk({ chunk: { type: 'tool-call' } });
    hooks.onFinish(finish);
    const logged = info.mock.calls[0]?.[1] as Record<string, unknown>;
    info.mockRestore();
    expect(logged.timeToFirstChunkMs).toBeUndefined();
  });
});
