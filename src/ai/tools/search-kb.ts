import { tool } from 'ai';
import { z } from 'zod';
import { getGatedCourseForAgent } from '#/db/course-content';
import { getAllHelpTopics } from '#/db/help-topics';
import { type KBResult, searchKB } from '#/db/knowledge-base';
import { resolveKBCourseId } from '#/db/knowledge-base-scope';
import { allowedLessonSlugs, courseOutline } from '#/lib/course-content';

// The query only. How many results and how relevant they must be are fixed in
// `searchKB`, not offered to the model: as tool parameters it could ask for
// hundreds of chunks or a floor of -1 and nothing capped either.
export const SearchKBParamsSchema = z.object({
  query: z.string().describe("the user's question"),
});

const SEARCH_KB_DESCRIPTION =
  'Search the comprehensive knowledge base about the course, drones, aircraft & airmanship. Always call this FIRST for any course/airmanship question, then supplement with general aviation knowledge if needed.';

const QUERY_TOO_SHORT =
  "The user's query is too short to search the knowledge base. Decide how to respond.";

type Writer = { write: (p: unknown) => void };

function announceThinking(writer?: Writer) {
  writer?.write({
    type: 'data-notification',
    data: { text: 'Thinking...' },
    transient: true,
  });
}

export function buildKBContext(input: {
  kbResults: KBResult[];
  outline: string;
  helpTopics: { title: string; content: string }[];
}): string {
  const kb = input.kbResults.map((r) => r.chunk).join('\n\n');
  const help = input.helpTopics
    .map((h) => `<h2>${h.title}</h2>${h.content}`)
    .join('\n\n');
  return [input.outline, kb, `<h1>Help</h1>\n${help}`]
    .filter(Boolean)
    .join('\n\n');
}

export function makeSearchKBTool(opts: {
  writer?: { write: (p: unknown) => void };
  courseSlug?: string;
  /**
   * Required: `getGatedCourseForAgent` gates every lesson against it, and
   * `resolveKBCourseId` decides from it whether this course's documents are
   * readable at all.
   */
  userId: string;
}) {
  return tool({
    description: SEARCH_KB_DESCRIPTION,
    inputSchema: SearchKBParamsSchema,
    execute: async ({ query }) => {
      if (query.trim().length < 3) {
        return QUERY_TOO_SHORT;
      }
      announceThinking(opts.writer);
      // No course in context (e.g. the widget on `/app`, with no course
      // route matched) means no course content — never substitute a default
      // slug, guess from subscriptions, or fall back to every subscribed
      // course. The tool answers from org-wide documents + help topics only.
      const [courseId, gated, helpTopics] = await Promise.all([
        resolveKBCourseId({ userId: opts.userId, courseSlug: opts.courseSlug }),
        opts.courseSlug
          ? getGatedCourseForAgent(opts.courseSlug, { userId: opts.userId })
          : Promise.resolve(null),
        getAllHelpTopics(),
      ]);
      // Relevant chunks from the lessons this learner may open, not the whole
      // course: the old full-course dump was re-sent on every search and was
      // most of every long chat's input.
      const kbResults = await searchKB(query, {
        courseId,
        lessonSlugs: gated ? allowedLessonSlugs(gated) : [],
      });
      return buildKBContext({
        kbResults,
        outline: gated ? courseOutline(gated) : '',
        helpTopics,
      });
    },
  });
}

/**
 * Admin preview: Viper scoped to one lesson plus the shared (org-wide)
 * documents, with no learner, course or gating involved.
 *
 * Admin-only: it bypasses lesson gating, so only a caller that has already
 * passed `requireAdmin` (POST /api/admin/viper/preview) may build it.
 */
export function makePreviewSearchKBTool(opts: {
  lessonSlug: string;
  writer?: Writer;
}) {
  return tool({
    description: SEARCH_KB_DESCRIPTION,
    inputSchema: SearchKBParamsSchema,
    execute: async ({ query }) => {
      if (query.trim().length < 3) {
        return QUERY_TOO_SHORT;
      }
      announceThinking(opts.writer);
      const [kbResults, helpTopics] = await Promise.all([
        searchKB(query, { courseId: null, lessonSlugs: [opts.lessonSlug] }),
        getAllHelpTopics(),
      ]);
      return buildKBContext({ kbResults, outline: '', helpTopics });
    },
  });
}
