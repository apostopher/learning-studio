// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { streamText } = vi.hoisted(() => ({
  streamText: vi.fn((_opts: Record<string, unknown>) => ({
    textStream: 'stream',
  })),
}));
vi.mock('ai', () => ({
  convertToModelMessages: vi.fn(async (m: unknown) => m),
  pruneMessages: vi.fn((o: { messages: unknown }) => o.messages),
  smoothStream: vi.fn(() => 'smooth'),
  stepCountIs: vi.fn((n: number) => ({ steps: n })),
  streamText,
}));
vi.mock('#/ai/ai-provider', () => ({ geminiFlash: 'model' }));
vi.mock('#/ai/prompts/viper7', () => ({ viper7SystemPrompt: () => 'BASE' }));
const { makeSearchKBTool } = vi.hoisted(() => ({
  makeSearchKBTool: vi.fn(() => 'course-search-tool'),
}));
vi.mock('#/ai/tools/search-kb', () => ({ makeSearchKBTool }));
vi.mock('#/ai/tools/check-flyability', () => ({
  makeCheckFlyabilityTool: () => 'checkFlyability',
}));

import type { Tool } from 'ai';
import { buildChatStream } from '#/ai/chat';

const base = { messages: [], uiMessages: [], subscriptions: [], userId: 'u1' };

beforeEach(() => vi.clearAllMocks());

describe('buildChatStream — search tool', () => {
  it('uses an injected search tool instead of the course one', async () => {
    const injected = { description: 'preview' } as Tool;
    await buildChatStream({ ...base, searchKBTool: injected });
    const args = streamText.mock.calls[0]?.[0] as {
      tools: Record<string, unknown>;
    };
    expect(args.tools.searchKB).toBe(injected);
    expect(makeSearchKBTool).not.toHaveBeenCalled();
  });

  it('builds the course search tool when none is injected', async () => {
    await buildChatStream({ ...base, courseSlug: 'uas' });
    const args = streamText.mock.calls[0]?.[0] as {
      tools: Record<string, unknown>;
    };
    expect(args.tools.searchKB).toBe('course-search-tool');
    expect(makeSearchKBTool).toHaveBeenCalledWith({
      writer: undefined,
      courseSlug: 'uas',
      userId: 'u1',
    });
  });
});
