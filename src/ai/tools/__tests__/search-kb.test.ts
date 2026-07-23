import { describe, expect, it, vi } from 'vitest';

// search-kb.ts imports these db modules at the top level; they transitively
// pull in '@/db' which vitest cannot resolve (see memory: vitest can't
// resolve @/, use #/). buildKBContext is pure and never calls them, so a
// full stub (not importOriginal) keeps this test isolated from the db layer.
vi.mock('#/db/course-content', () => ({ getCourseContentForAgent: vi.fn() }));
vi.mock('#/db/help-topics', () => ({ getAllHelpTopics: vi.fn() }));
vi.mock('#/db/knowledge-base', () => ({ searchKB: vi.fn() }));

import { buildKBContext } from '#/ai/tools/search-kb';

describe('buildKBContext', () => {
  it('concatenates course content, KB chunks, and help topics', () => {
    const out = buildKBContext({
      kbResults: [{ chunk: 'chunk-a', heading: 'H', similarity: 0.9 }],
      courseHtml: '<h1>Course</h1>',
      helpTopics: [{ title: 'Reset', content: 'do X' }],
    });
    expect(out).toContain('<h1>Course</h1>');
    expect(out).toContain('chunk-a');
    expect(out).toContain('Reset');
    expect(out).toContain('do X');
  });

  it('handles empty KB results', () => {
    const out = buildKBContext({
      kbResults: [],
      courseHtml: '<h1>C</h1>',
      helpTopics: [],
    });
    expect(out).toContain('<h1>C</h1>');
  });
});
