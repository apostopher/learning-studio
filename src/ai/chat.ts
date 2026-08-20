import type { UIMessage } from 'ai';
import {
  convertToModelMessages,
  smoothStream,
  stepCountIs,
  streamText,
} from 'ai';
import { geminiFlash } from '#/ai/ai-provider';
import {
  type SkaProfileForPrompt,
  viper7SystemPrompt,
} from '#/ai/prompts/viper7';
import { makeCheckFlyabilityTool } from '#/ai/tools/check-flyability';
import { makeSearchKBTool } from '#/ai/tools/search-kb';
import { isAssociateFrom } from '#/lib/is-associate';
import type { Persona } from '#/types';

// Re-exported so `#/ai/chat` still exposes `isAssociateFrom` for callers
// (e.g. the chat route) even though the pure logic lives in `src/lib/` to
// keep it importable under vitest without pulling in `@/db` transitively
// (this module statically imports `#/ai/tools/search-kb`, which does).
export { isAssociateFrom } from '#/lib/is-associate';

export type BuildChatStreamOptions = {
  messages: UIMessage[];
  uiMessages: UIMessage[];
  persona?: Persona;
  userInfo?: {
    name: string;
    callSign: string;
    location: string;
  };
  subscriptions: string[];
  writer?: { write: (p: unknown) => void };
  /** The course the chat widget is currently mounted on, if any (e.g. absent
   * on `/app`). Threaded through to `searchKB` so it only ever pulls one
   * course's material — see that tool's doc comment for why no default or
   * subscription-derived fallback is used when this is absent. */
  courseSlug?: string;
  userId: string;
  /**
   * The learner's reviewed SKA profile, already narrowed to the sections that
   * apply in this context by the caller (all three with a course in context,
   * Attitude alone without one). Absent when they have none, which is an
   * ordinary state — viper7 then behaves exactly as it did before profiles
   * existed.
   */
  skaProfile?: SkaProfileForPrompt;
};

/**
 * Assembles the `streamText` config the chat route streams from: viper7's
 * system prompt (gated on associate status), the searchKB + checkFlyability
 * tools, and gemini-3.6-flash as the model. `toolChoice: 'auto'` lets the
 * model route between the two tools itself (see design doc §"Tool
 * orchestration" for why no forced selector step is needed).
 *
 * Async because `convertToModelMessages` (ai@6) resolves asynchronously
 * (file downloads / dynamic tool resolution); the resulting `ModelMessage[]`
 * is computed once and reused for both `streamText` and the checkFlyability
 * tool's `messages` option.
 *
 * Note: the old repo's `markdownJoinerTransform` is intentionally omitted —
 * `smoothStream` alone is sufficient for v1; port it later if streamed
 * markdown reassembly becomes an issue.
 */
export async function buildChatStream({
  messages,
  uiMessages,
  persona,
  userInfo,
  subscriptions,
  writer,
  courseSlug,
  userId,
  skaProfile,
}: BuildChatStreamOptions) {
  const modelMessages = await convertToModelMessages(messages);

  return streamText({
    model: geminiFlash,
    system: viper7SystemPrompt({
      isAssociate: isAssociateFrom(subscriptions),
      persona,
      userInfo,
      skaProfile,
    }),
    messages: modelMessages,
    tools: {
      searchKB: makeSearchKBTool({ writer, courseSlug, userId }),
      checkFlyability: makeCheckFlyabilityTool({
        messages: modelMessages,
        uiMessages,
      }),
    },
    toolChoice: 'auto',
    stopWhen: stepCountIs(4),
    experimental_transform: [smoothStream({ delayInMs: 20, chunking: 'line' })],
  });
}
