// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ generateText: vi.fn() }));

vi.mock('ai', () => ({
  generateText: m.generateText,
  Output: { object: (o: unknown) => o },
}));
vi.mock('../ai-provider', () => ({ sonnet: 'sonnet', haiku: 'haiku' }));

import { generateKnowledgeChunks } from '../generate-knowledge-chunks';

const chunk = (n: number) => ({ title: `T${n}`, summary: `S${n}` });
const nChunks = (n: number) => ({
  output: { chunks: Array.from({ length: n }, (_, i) => chunk(i + 1)) },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generateKnowledgeChunks', () => {
  it('puts every key point verbatim, and the context, in the prompt to Sonnet', async () => {
    m.generateText.mockResolvedValueOnce(nChunks(2));

    await generateKnowledgeChunks({
      keyPoints: ['Flare at 5 ft AGL', 'Trim for 60 kt'],
      context: 'the spoken transcript body',
    });

    const call = m.generateText.mock.calls[0][0];
    expect(call.model).toBe('sonnet');
    expect(call.prompt).toContain('Flare at 5 ft AGL');
    expect(call.prompt).toContain('Trim for 60 kt');
    expect(call.prompt).toContain('the spoken transcript body');
  });

  it('assigns ids c1..cN in code whatever the model returned', async () => {
    m.generateText.mockResolvedValueOnce({
      output: {
        chunks: [
          { id: 'zzz', title: 'A', summary: 'a' },
          { id: 'c1', title: 'B', summary: 'b' },
          { title: 'C', summary: 'c' },
        ],
      },
    });

    const chunks = await generateKnowledgeChunks({
      keyPoints: ['k'],
      context: 'c',
    });

    expect(chunks).toEqual([
      { id: 'c1', title: 'A', summary: 'a' },
      { id: 'c2', title: 'B', summary: 'b' },
      { id: 'c3', title: 'C', summary: 'c' },
    ]);
  });

  it('retries once on a schema failure (13 chunks) then throws', async () => {
    m.generateText.mockResolvedValue(nChunks(13));

    await expect(
      generateKnowledgeChunks({ keyPoints: ['k'], context: 'c' }),
    ).rejects.toThrow();
    expect(m.generateText).toHaveBeenCalledTimes(2);
  });

  it('keeps all 10 chunks for a 10-key-point lesson', async () => {
    m.generateText.mockResolvedValueOnce(nChunks(10));
    const chunks = await generateKnowledgeChunks({
      keyPoints: Array.from({ length: 10 }, (_, i) => `kp${i + 1}`),
      context: 'c',
    });
    expect(chunks.map((c) => c.id)).toEqual(
      Array.from({ length: 10 }, (_, i) => `c${i + 1}`),
    );
  });

  it('retries when the model merged key points, then throws', async () => {
    m.generateText.mockResolvedValue(nChunks(8));
    await expect(
      generateKnowledgeChunks({
        keyPoints: Array.from({ length: 10 }, (_, i) => `kp${i + 1}`),
        context: 'c',
      }),
    ).rejects.toThrow(/merged or dropped/);
    expect(m.generateText).toHaveBeenCalledTimes(2);
  });

  it('tells the model never to merge key points, under the cap', async () => {
    m.generateText.mockResolvedValueOnce(nChunks(1));
    await generateKnowledgeChunks({ keyPoints: ['k'], context: 'c' });
    const { prompt } = m.generateText.mock.calls[0][0];
    expect(prompt).toMatch(/Never merge, drop or combine key points/);
    expect(prompt).toContain('never produce more than 12 chunks');
  });

  it('recovers when the retry returns a valid set', async () => {
    m.generateText
      .mockResolvedValueOnce(nChunks(13))
      .mockResolvedValueOnce(nChunks(3));

    const chunks = await generateKnowledgeChunks({
      keyPoints: ['k'],
      context: 'c',
    });
    expect(chunks.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    expect(m.generateText).toHaveBeenCalledTimes(2);
  });
});
