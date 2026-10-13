// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('ai', () => ({ generateText: vi.fn() }));
vi.mock('#/ai/ai-provider', () => ({ geminiFlash: 'model' }));
vi.mock('#/db/chat', () => ({
  loadChatContext: vi.fn(),
  saveChatSummary: vi.fn(),
}));

import {
  COMPACT_AT_INPUT_TOKENS,
  compactChat,
  KEEP_RECENT_MESSAGES,
  shouldCompact,
  transcriptForSummary,
} from '#/ai/compact-chat';

const entry = (
  order: number,
  role: 'user' | 'assistant' = order % 2 ? 'assistant' : 'user',
) => ({
  order,
  message: {
    id: `m${order}`,
    role,
    parts: [{ type: 'text' as const, text: `text ${order}` }],
  },
});

const deps = (
  entries = Array.from({ length: 10 }, (_, i) => entry(i + 1)),
) => ({
  load: vi
    .fn()
    .mockResolvedValue({ summary: 'OLD', summarizedThroughOrder: 0, entries }),
  summarize: vi.fn().mockResolvedValue('NEW SUMMARY'),
  save: vi.fn().mockResolvedValue(true),
});

describe('compactChat', () => {
  it('folds everything but the recent tail into the summary, conditionally', async () => {
    const d = deps();
    expect(await compactChat({ userId: 'u', chatId: 'c' }, d)).toBe(
      'compacted',
    );
    const { transcript, previous } = d.summarize.mock.calls[0][0];
    expect(previous).toBe('OLD');
    // Orders 1..10, odd = Viper. 10 - 6 = index 4 (order 5, a Viper turn),
    // so the kept tail steps back to order 4 (a learner turn): fold 1..3.
    expect(transcript).toContain('text 3');
    expect(transcript).not.toContain('text 4');
    expect(d.save).toHaveBeenCalledWith({
      chatId: 'c',
      summary: 'NEW SUMMARY',
      throughOrder: 3,
      expectedThroughOrder: 0,
    });
  });

  it('does nothing when only the recent tail exists', async () => {
    const d = deps(
      Array.from({ length: KEEP_RECENT_MESSAGES }, (_, i) => entry(i + 1)),
    );
    expect(await compactChat({ userId: 'u', chatId: 'c' }, d)).toBe(
      'nothing-to-do',
    );
    expect(d.summarize).not.toHaveBeenCalled();
    expect(d.save).not.toHaveBeenCalled();
  });

  it('reports a lost race and writes nothing else', async () => {
    const d = deps();
    d.save.mockResolvedValue(false);
    expect(await compactChat({ userId: 'u', chatId: 'c' }, d)).toBe(
      'lost-race',
    );
  });

  it('a summarizer failure rejects without saving', async () => {
    const d = deps();
    d.summarize.mockRejectedValue(new Error('gateway 500'));
    await expect(compactChat({ userId: 'u', chatId: 'c' }, d)).rejects.toThrow(
      'gateway 500',
    );
    expect(d.save).not.toHaveBeenCalled();
  });

  it('never folds a turn boundary away: the kept tail starts with a learner turn', async () => {
    const d = deps();
    await compactChat({ userId: 'u', chatId: 'c' }, d);
    const through = d.save.mock.calls[0][0].throughOrder;
    expect(entry(through + 1).message.role).toBe('user');
  });
});

describe('compactChat — long unsummarized history', () => {
  it('reads uncapped and folds the oldest entries, beyond the capped window', async () => {
    const d = deps(Array.from({ length: 60 }, (_, i) => entry(i + 1)));
    await compactChat({ userId: 'u', chatId: 'c' }, d);
    expect(d.load).toHaveBeenCalledWith('u', 'c', {
      cap: Number.POSITIVE_INFINITY,
    });
    expect(d.summarize.mock.calls[0][0].transcript).toContain('text 1\n');
    expect(d.save.mock.calls[0][0].throughOrder).toBe(53);
  });
});

describe('helpers', () => {
  it('shouldCompact trips only above the budget', () => {
    expect(shouldCompact(undefined)).toBe(false);
    expect(shouldCompact(COMPACT_AT_INPUT_TOKENS)).toBe(false);
    expect(shouldCompact(COMPACT_AT_INPUT_TOKENS + 1)).toBe(true);
  });

  it('transcript is text only — tool output never reaches the summarizer', () => {
    const t = transcriptForSummary([
      entry(1, 'user'),
      {
        order: 2,
        message: {
          id: 'a',
          role: 'assistant',
          parts: [
            {
              type: 'tool-searchKB',
              toolCallId: 'x',
              state: 'output-available',
              input: {},
              output: 'COURSE DUMP',
            },
            { type: 'text', text: 'the answer' },
          ],
        },
      } as never,
    ]);
    expect(t).toContain('Learner: text 1');
    expect(t).toContain('Viper: the answer');
    expect(t).not.toContain('COURSE DUMP');
  });
});
