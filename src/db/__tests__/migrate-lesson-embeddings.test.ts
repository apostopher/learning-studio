// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('#/db', () => ({ db: {} }));
vi.mock('#/ai/embeddings', () => ({
  generateLessonEmbeddings: vi.fn(),
  lessonMaterialHtml: (m: { text: string }) => m.text,
}));

import { backfillLessonEmbeddings } from '../migrate-lesson-embeddings';

describe('backfillLessonEmbeddings', () => {
  it('embeds each lesson once (first material row wins) and keeps going past a failure', async () => {
    const embed = vi.fn(async ({ lessonSlug }: { lessonSlug: string }) => {
      if (lessonSlug === 'bad') throw new Error('quota');
      return { chunks: 2 };
    });
    const out = await backfillLessonEmbeddings(
      [
        { lessonSlug: 'a', text: 'A1', proTips: null },
        { lessonSlug: 'a', text: 'A2', proTips: null },
        { lessonSlug: 'bad', text: 'B', proTips: null },
        { lessonSlug: 'c', text: 'C', proTips: null },
      ],
      embed,
    );
    expect(embed.mock.calls.map((c) => c[0])).toEqual([
      { lessonSlug: 'a', html: 'A1' },
      { lessonSlug: 'bad', html: 'B' },
      { lessonSlug: 'c', html: 'C' },
    ]);
    expect(out).toEqual({ lessons: 2, chunks: 4, failed: ['bad'] });
  });
});
