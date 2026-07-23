import { tool } from 'ai';
import { z } from 'zod';
import { getCourseContentForAgent } from '#/db/course-content';
import { getAllHelpTopics } from '#/db/help-topics';
import { type KBResult, searchKB } from '#/db/knowledge-base';

export const SearchKBParamsSchema = z.object({
  query: z.string().describe("the user's question"),
  maxResults: z.number().optional(),
  minScore: z.number().optional(),
});

export function buildKBContext(input: {
  kbResults: KBResult[];
  courseHtml: string;
  helpTopics: { title: string; content: string }[];
}): string {
  const kb = input.kbResults.map((r) => r.chunk).join('\n\n');
  const help = input.helpTopics
    .map((h) => `<h2>${h.title}</h2>${h.content}`)
    .join('\n\n');
  return [input.courseHtml, kb, `<h1>Help</h1>\n${help}`]
    .filter(Boolean)
    .join('\n\n');
}

export function makeSearchKBTool(
  opts: {
    writer?: { write: (p: unknown) => void };
    courseSlug?: string;
    courseId?: number;
  } = {},
) {
  const courseSlug = opts.courseSlug ?? '3d-airmanship';
  return tool({
    description:
      'Search the comprehensive knowledge base about the course, drones, aircraft & airmanship. Always call this FIRST for any course/airmanship question, then supplement with general aviation knowledge if needed.',
    inputSchema: SearchKBParamsSchema,
    execute: async ({ query, maxResults, minScore }) => {
      if (query.trim().length < 3) {
        return "The user's query is too short to search the knowledge base. Decide how to respond.";
      }
      opts.writer?.write({
        type: 'data-notification',
        data: { text: 'Thinking...' },
        transient: true,
      });
      const [kbResults, courseHtml, helpTopics] = await Promise.all([
        searchKB(query, {
          maxResults: maxResults ?? 5,
          minScore: minScore ?? 0,
          courseId: opts.courseId,
        }),
        getCourseContentForAgent(courseSlug),
        getAllHelpTopics(),
      ]);
      return buildKBContext({ kbResults, courseHtml, helpTopics });
    },
  });
}
