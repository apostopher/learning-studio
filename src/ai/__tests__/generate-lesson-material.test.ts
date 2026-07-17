import { describe, expect, it, vi } from 'vitest';

const { generateText } = vi.hoisted(() => ({ generateText: vi.fn() }));
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return { ...actual, generateText };
});

import { haiku } from '../ai-provider';
import { generateLessonMaterial } from '../generate-lesson-material';

const sampleOutput = {
  text: '<p>Intro</p>',
  keyPoints: ['<p>Point 1</p>'],
  proTips: '<p>Tip</p>',
  quiz: [],
};

describe('generateLessonMaterial', () => {
  it('calls generateText with haiku and returns its output', async () => {
    generateText.mockResolvedValueOnce({ output: sampleOutput });
    const result = await generateLessonMaterial('<h1>Lesson</h1>');

    expect(result).toEqual(sampleOutput);
    const call = generateText.mock.calls[0][0];
    expect(call.model).toBe(haiku);
    expect(call.system).toMatch(/formatter/i);
    expect(call.prompt).toContain('<h1>Lesson</h1>');
    expect(call.output).toBeDefined();
  });
});
