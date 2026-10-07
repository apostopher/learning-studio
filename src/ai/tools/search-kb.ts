import { tool } from 'ai';
import { z } from 'zod';
import { getCourseContentForAgent } from '#/db/course-content';
import { getAllHelpTopics } from '#/db/help-topics';
import { type KBResult, searchKB } from '#/db/knowledge-base';
import { resolveKBCourseId } from '#/db/knowledge-base-scope';

// The query only. How many results and how relevant they must be are fixed in
// `searchKB`, not offered to the model: as tool parameters it could ask for
// hundreds of chunks or a floor of -1 and nothing capped either.
export const SearchKBParamsSchema = z.object({
  query: z.string().describe("the user's question"),
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

export function makeSearchKBTool(opts: {
  writer?: { write: (p: unknown) => void };
  courseSlug?: string;
  /**
   * Required: `getCourseContentForAgent` gates every lesson against it, and
   * `resolveKBCourseId` decides from it whether this course's documents are
   * readable at all.
   */
  userId: string;
}) {
  return tool({
    description:
      'Search the comprehensive knowledge base about the course, drones, aircraft & airmanship. Always call this FIRST for any course/airmanship question, then supplement with general aviation knowledge if needed.',
    inputSchema: SearchKBParamsSchema,
    execute: async ({ query }) => {
      if (query.trim().length < 3) {
        return "The user's query is too short to search the knowledge base. Decide how to respond.";
      }
      opts.writer?.write({
        type: 'data-notification',
        data: { text: 'Thinking...' },
        transient: true,
      });
      // No course in context (e.g. the widget on `/app`, with no course
      // route matched) means no course content — never substitute a default
      // slug, guess from subscriptions, or fall back to every subscribed
      // course. The tool answers from org-wide documents + help topics only.
      const [kbResults, courseHtml, helpTopics] = await Promise.all([
        resolveKBCourseId({
          userId: opts.userId,
          courseSlug: opts.courseSlug,
        }).then((courseId) => searchKB(query, { courseId })),
        opts.courseSlug
          ? getCourseContentForAgent(opts.courseSlug, { userId: opts.userId })
          : Promise.resolve(''),
        getAllHelpTopics(),
      ]);
      return buildKBContext({ kbResults, courseHtml, helpTopics });
    },
  });
}
