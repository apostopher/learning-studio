// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ generateText: vi.fn() }));

vi.mock('ai', () => ({
  generateText: m.generateText,
  Output: { object: (o: unknown) => o },
}));
vi.mock('../ai-provider', () => ({ sonnet: 'sonnet', haiku: 'haiku' }));

import { matchKnowledgeChunks } from '../match-knowledge-chunks';

const mk = (id: string, title = id) => ({ id, title, summary: `${title} sum` });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('matchKnowledgeChunks', () => {
  it('keeps the first old id per new id and nulls the rest', async () => {
    m.generateText.mockResolvedValueOnce({
      output: {
        matches: [
          { oldId: 'o1', newId: 'n1' },
          { oldId: 'o2', newId: 'n1' },
          { oldId: 'o3', newId: null },
        ],
      },
    });

    const result = await matchKnowledgeChunks(
      [mk('o1'), mk('o2'), mk('o3')],
      [mk('n1'), mk('n2')],
    );

    expect(result).toEqual({ o1: 'n1', o2: null, o3: null });
    expect(m.generateText.mock.calls[0][0].model).toBe('haiku');
  });

  it('maps unknown new ids and omitted old ids to null', async () => {
    m.generateText.mockResolvedValueOnce({
      output: { matches: [{ oldId: 'o1', newId: 'ghost' }] },
    });

    const result = await matchKnowledgeChunks([mk('o1'), mk('o2')], [mk('n1')]);
    expect(result).toEqual({ o1: null, o2: null });
  });

  it('skips the model when either side is empty', async () => {
    await expect(matchKnowledgeChunks([mk('o1')], [])).resolves.toEqual({
      o1: null,
    });
    expect(m.generateText).not.toHaveBeenCalled();
  });
});
