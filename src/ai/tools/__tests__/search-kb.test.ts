import { beforeEach, describe, expect, it, vi } from 'vitest';

// search-kb.ts imports these db modules at the top level; they transitively
// pull in '@/db' which vitest cannot resolve (see memory: vitest can't
// resolve @/, use #/). buildKBContext is pure and never calls them, so a
// full stub (not importOriginal) keeps this test isolated from the db layer.
// makeSearchKBTool's tests below need the same mocks, but captured via
// vi.hoisted so the test body can assert on what they were called with.
const { getCourseContentForAgent, getAllHelpTopics, searchKB } = vi.hoisted(
  () => ({
    getCourseContentForAgent: vi.fn(),
    getAllHelpTopics: vi.fn(),
    searchKB: vi.fn(),
  }),
);
vi.mock('#/db/course-content', () => ({ getCourseContentForAgent }));
vi.mock('#/db/help-topics', () => ({ getAllHelpTopics }));
vi.mock('#/db/knowledge-base', () => ({ searchKB }));

import { buildKBContext, makeSearchKBTool } from '#/ai/tools/search-kb';

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

// The tool-execution options 2nd arg (toolCallId/messages) is required by
// the `ai` SDK's execute signature but unused by our implementation — a
// minimal stub is enough to call it directly the way the model runtime would.
const toolCallOptions = { toolCallId: 'test-call', messages: [] };

describe('makeSearchKBTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCourseContentForAgent.mockResolvedValue('<h1>Course</h1>');
    getAllHelpTopics.mockResolvedValue([]);
    searchKB.mockResolvedValue([]);
  });

  it('passes the current courseSlug and userId to getCourseContentForAgent', async () => {
    const kbTool = makeSearchKBTool({
      courseSlug: 'itps-uas-remote',
      userId: 'user-1',
    });
    // biome-ignore lint/style/noNonNullAssertion: execute is always defined on a static tool() config
    await kbTool.execute!({ query: 'what is the syllabus' }, toolCallOptions);
    expect(getCourseContentForAgent).toHaveBeenCalledWith('itps-uas-remote', {
      userId: 'user-1',
    });
  });

  // Regression test for the pre-existing bug this task also fixes: every
  // chat answer used to be built from the hard-coded '3d-airmanship' course
  // regardless of which course (if any) the student was actually in.
  it('never calls getCourseContentForAgent when no course is in context', async () => {
    const kbTool = makeSearchKBTool({ userId: 'user-1' });
    // biome-ignore lint/style/noNonNullAssertion: execute is always defined on a static tool() config
    await kbTool.execute!({ query: 'what is the syllabus' }, toolCallOptions);
    expect(getCourseContentForAgent).not.toHaveBeenCalled();
  });

  // Distinct from the previous test: that one proves the producer
  // (getCourseContentForAgent) is never invoked; this one proves the actual
  // string handed to the model — what the consumer receives — carries no
  // course content either, so a stray default slug reintroduced upstream of
  // this tool couldn't leak course material back out even if it slipped past
  // the `not.toHaveBeenCalled()` check above.
  it('returns no course content in the context handed to the model when courseSlug is omitted', async () => {
    const kbTool = makeSearchKBTool({});
    // biome-ignore lint/style/noNonNullAssertion: execute is always defined on a static tool() config
    const result = await kbTool.execute!(
      { query: 'tell me about drones' },
      toolCallOptions,
    );
    expect(result).not.toContain('<h1>Course</h1>');
  });
});
