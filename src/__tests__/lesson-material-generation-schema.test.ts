import { describe, expect, it } from 'vitest';
import { LessonMaterialGenerationSchema } from '../types';

describe('LessonMaterialGenerationSchema', () => {
  it('accepts a full material object without an id', () => {
    const parsed = LessonMaterialGenerationSchema.safeParse({
      text: '<p>Intro</p>',
      keyPoints: ['<p>Point 1</p>'],
      proTips: '<p>Tip</p>',
      quiz: [
        {
          id: 'q1',
          question: 'What is lift?',
          options: [
            { id: 'a', value: 'Up' },
            { id: 'b', value: 'Down' },
          ],
          correctOptionId: 'a',
        },
      ],
      links: ['https://example.com'],
    });
    expect(parsed.success).toBe(true);
  });

  it('strips an id if present (omitted from the shape)', () => {
    const parsed = LessonMaterialGenerationSchema.safeParse({
      id: 1,
      text: '<p>x</p>',
      keyPoints: [],
      proTips: '',
      quiz: [],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && 'id' in parsed.data).toBe(false);
  });

  it('rejects a missing required text field', () => {
    const parsed = LessonMaterialGenerationSchema.safeParse({
      keyPoints: [],
      proTips: '',
      quiz: [],
    });
    expect(parsed.success).toBe(false);
  });
});
