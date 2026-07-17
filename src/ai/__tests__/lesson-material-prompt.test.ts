import { describe, expect, it } from 'vitest';
import {
  lessonMaterialSystemPrompt,
  lessonMaterialUserPrompt,
} from '../prompts/lesson-material';

describe('lesson-material prompts', () => {
  it('states the HTML-prose / markdown-quiz rule and key sections', () => {
    expect(lessonMaterialSystemPrompt).toMatch(/HTML/);
    expect(lessonMaterialSystemPrompt).toMatch(/markdown/i);
    expect(lessonMaterialSystemPrompt).toMatch(/key teaching points/i);
    expect(lessonMaterialSystemPrompt).toMatch(/proTips/);
    expect(lessonMaterialSystemPrompt).toMatch(/quiz/);
  });

  it('embeds the provided html in the user prompt', () => {
    const html = '<h1>Lesson 1</h1><p>Body</p>';
    expect(lessonMaterialUserPrompt(html)).toContain(html);
  });
});
