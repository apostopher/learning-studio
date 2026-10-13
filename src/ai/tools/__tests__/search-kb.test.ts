import { beforeEach, describe, expect, it, vi } from 'vitest';

// search-kb.ts imports these db modules at the top level; they transitively
// pull in '@/db' which vitest cannot resolve (see memory: vitest can't
// resolve @/, use #/). buildKBContext is pure and never calls them, so a
// full stub (not importOriginal) keeps this test isolated from the db layer.
// makeSearchKBTool's tests below need the same mocks, but captured via
// vi.hoisted so the test body can assert on what they were called with.
const {
  getGatedCourseForAgent,
  getAllHelpTopics,
  searchKB,
  resolveKBCourseId,
} = vi.hoisted(() => ({
  getGatedCourseForAgent: vi.fn(),
  getAllHelpTopics: vi.fn(),
  searchKB: vi.fn(),
  resolveKBCourseId: vi.fn(),
}));
vi.mock('#/db/course-content', () => ({ getGatedCourseForAgent }));
vi.mock('#/db/help-topics', () => ({ getAllHelpTopics }));
vi.mock('#/db/knowledge-base', () => ({ searchKB }));
vi.mock('#/db/knowledge-base-scope', () => ({ resolveKBCourseId }));

import {
  buildKBContext,
  makeSearchKBTool,
  SearchKBParamsSchema,
} from '#/ai/tools/search-kb';

describe('buildKBContext', () => {
  it('concatenates the outline, KB chunks, and help topics', () => {
    const out = buildKBContext({
      kbResults: [{ chunk: 'chunk-a', heading: 'H', similarity: 0.9 }],
      outline: '<h1>Course</h1>',
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
      outline: '<h1>C</h1>',
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
    getGatedCourseForAgent.mockResolvedValue({
      name: 'Course',
      modules: [
        {
          name: 'Weather',
          lessons: [
            {
              slug: 'wx-1',
              name: 'METARs',
              text: 'FULL LESSON TEXT',
              proTips: null,
            },
          ],
        },
      ],
    });
    getAllHelpTopics.mockResolvedValue([]);
    searchKB.mockResolvedValue([]);
    resolveKBCourseId.mockResolvedValue(null);
  });

  it('passes the current courseSlug and userId to getGatedCourseForAgent', async () => {
    const kbTool = makeSearchKBTool({
      courseSlug: 'itps-uas-remote',
      userId: 'user-1',
    });
    // biome-ignore lint/style/noNonNullAssertion: execute is always defined on a static tool() config
    await kbTool.execute!({ query: 'what is the syllabus' }, toolCallOptions);
    expect(getGatedCourseForAgent).toHaveBeenCalledWith('itps-uas-remote', {
      userId: 'user-1',
    });
  });

  // Regression test for the pre-existing bug this task also fixes: every
  // chat answer used to be built from the hard-coded '3d-airmanship' course
  // regardless of which course (if any) the student was actually in.
  it('never calls getGatedCourseForAgent when no course is in context', async () => {
    const kbTool = makeSearchKBTool({ userId: 'user-1' });
    // biome-ignore lint/style/noNonNullAssertion: execute is always defined on a static tool() config
    await kbTool.execute!({ query: 'what is the syllabus' }, toolCallOptions);
    expect(getGatedCourseForAgent).not.toHaveBeenCalled();
  });

  // Distinct from the previous test: that one proves the producer
  // (getGatedCourseForAgent) is never invoked; this one proves the actual
  // string handed to the model — what the consumer receives — carries no
  // course content either, so a stray default slug reintroduced upstream of
  // this tool couldn't leak course material back out even if it slipped past
  // the `not.toHaveBeenCalled()` check above.
  it('returns no course content in the context handed to the model when courseSlug is omitted', async () => {
    const kbTool = makeSearchKBTool({ userId: 'user-1' });
    // biome-ignore lint/style/noNonNullAssertion: execute is always defined on a static tool() config
    const result = await kbTool.execute!(
      { query: 'tell me about drones' },
      toolCallOptions,
    );
    expect(result).not.toContain('<h1>Course</h1>');
  });

  // The defect: the chat tool never passed a course, and searchKB with no
  // course searched every course's documents. What matters is what searchKB
  // is actually called with.
  it('searches the course the access check resolved, for this user', async () => {
    resolveKBCourseId.mockResolvedValue(2);
    const kbTool = makeSearchKBTool({
      courseSlug: 'itps-uas-remote',
      userId: 'user-1',
    });
    // biome-ignore lint/style/noNonNullAssertion: execute is always defined on a static tool() config
    await kbTool.execute!({ query: 'pre-flight checks' }, toolCallOptions);
    expect(resolveKBCourseId).toHaveBeenCalledWith({
      userId: 'user-1',
      courseSlug: 'itps-uas-remote',
    });
    expect(searchKB).toHaveBeenCalledWith('pre-flight checks', {
      courseId: 2,
      lessonSlugs: ['wx-1'],
    });
  });

  it('searches org-wide docs only when the access check refuses the course', async () => {
    resolveKBCourseId.mockResolvedValue(null);
    getGatedCourseForAgent.mockResolvedValue(null);
    const kbTool = makeSearchKBTool({
      courseSlug: 'someone-elses-course',
      userId: 'user-1',
    });
    // biome-ignore lint/style/noNonNullAssertion: execute is always defined on a static tool() config
    await kbTool.execute!({ query: 'pre-flight checks' }, toolCallOptions);
    expect(searchKB).toHaveBeenCalledWith('pre-flight checks', {
      courseId: null,
      lessonSlugs: [],
    });
  });

  it('searches only the lessons the gate allows', async () => {
    resolveKBCourseId.mockResolvedValue(2);
    const kbTool = makeSearchKBTool({ courseSlug: 'uas', userId: 'user-1' });
    // biome-ignore lint/style/noNonNullAssertion: execute is always defined on a static tool() config
    await kbTool.execute!({ query: 'metar' }, toolCallOptions);
    expect(searchKB).toHaveBeenCalledWith('metar', {
      courseId: 2,
      lessonSlugs: ['wx-1'],
    });
  });

  it('hands the model an outline and chunks — never the whole course', async () => {
    searchKB.mockResolvedValue([
      { chunk: 'chunk-a', heading: 'H', similarity: 0.9 },
    ]);
    const kbTool = makeSearchKBTool({ courseSlug: 'uas', userId: 'user-1' });
    // biome-ignore lint/style/noNonNullAssertion: execute is always defined on a static tool() config
    const out = await kbTool.execute!({ query: 'metar' }, toolCallOptions);
    expect(out).toContain('METARs');
    expect(out).toContain('chunk-a');
    expect(out).not.toContain('FULL LESSON TEXT');
  });

  it('no course in context → no lesson scope at all', async () => {
    const kbTool = makeSearchKBTool({ userId: 'user-1' });
    // biome-ignore lint/style/noNonNullAssertion: execute is always defined on a static tool() config
    await kbTool.execute!({ query: 'metar' }, toolCallOptions);
    expect(getGatedCourseForAgent).not.toHaveBeenCalled();
    expect(searchKB).toHaveBeenCalledWith('metar', {
      courseId: null,
      lessonSlugs: [],
    });
  });

  it('gives the model no way to set the result count or relevance floor', async () => {
    expect(Object.keys(SearchKBParamsSchema.shape)).toEqual(['query']);
    const kbTool = makeSearchKBTool({ userId: 'user-1' });
    // biome-ignore lint/style/noNonNullAssertion: execute is always defined on a static tool() config
    await kbTool.execute!(
      // What a model could have sent before: both are now ignored.
      { query: 'pre-flight checks', maxResults: 500, minScore: -1 } as never,
      toolCallOptions,
    );
    expect(searchKB).toHaveBeenCalledWith('pre-flight checks', {
      courseId: null,
      lessonSlugs: [],
    });
  });
});
