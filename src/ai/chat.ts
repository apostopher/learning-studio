import type { ModelMessage, TextPart, UIMessage } from 'ai';
import {
  convertToModelMessages,
  pruneMessages,
  smoothStream,
  stepCountIs,
  streamText,
} from 'ai';
import { geminiFlash } from '#/ai/ai-provider';
import {
  type SkaProfileForPrompt,
  viper7SystemPrompt,
} from '#/ai/prompts/viper7';
import { VOICE_MODE_PROMPT } from '#/ai/prompts/voice-mode';
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
  /**
   * Tavus video call. Appends the voice prompt and Tavus's own rules
   * (emotion tags, speech punctuation) to the system prompt.
   */
  voice?: { tavusRules: string };
  /** Cancels generation when Tavus abandons a (speculative) request. */
  abortSignal?: AbortSignal;
  /** Rolling summary of turns older than `messages` (see `loadChatContext`). */
  conversationSummary?: string | null;
  /** Tags the `viper7 usage` log line so a chat's turns can be followed. */
  chatId?: string;
};

function notificationToText(data: unknown): TextPart | undefined {
  const text =
    data && typeof data === 'object' && 'text' in data
      ? (data as { text: unknown }).text
      : undefined;
  return typeof text === 'string' && text.trim()
    ? { type: 'text', text: `[${text.trim()}]` }
    : undefined;
}

/** Belt-and-braces: never send a turn with no content (Gemini 400s on
 * `{ role: 'model', parts: [] }`), whatever produced it. */
function hasContent(message: ModelMessage): boolean {
  return typeof message.content === 'string'
    ? message.content.trim() !== ''
    : message.content.length > 0;
}

/**
 * Assembles the `streamText` config the chat route streams from: viper7's
 * system prompt (gated on associate status), the searchKB + checkFlyability
 * tools, and gemini-3.8-flash as the model. `toolChoice: 'auto'` lets the
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
  voice,
  abortSignal,
  conversationSummary,
  chatId,
}: BuildChatStreamOptions) {
  const convertedMessages = (
    await convertToModelMessages(messages, {
      // Persisted chats contain assistant turns whose only part is a
      // `data-notification` status line (e.g. the "Video call with Viper7"
      // brackets around a call transcript). Without this they convert to
      // `{ role: 'assistant', content: [] }`, which Gemini rejects with a 400.
      // Rendering them as bracketed text keeps the call's context visible to
      // the model.
      convertDataPart: (part) =>
        part.type === 'data-notification'
          ? notificationToText(part.data)
          : undefined,
      // A tool call cut off mid-stream (reload, abort) has no result; replaying
      // it would fail the request rather than just losing that step.
      ignoreIncompleteToolCalls: true,
    })
  ).filter(hasContent);

  // Earlier turns keep Viper's answers; their tool calls and results go.
  // A searchKB result is only useful to the turn that asked for it, and
  // replaying every one of them was what pushed long chats past Vercel's
  // 4.5 MB body limit. The current turn's tool loop is unaffected — its
  // calls live in the response, not in this input.
  const modelMessages = pruneMessages({
    messages: convertedMessages,
    toolCalls: 'before-last-message',
    reasoning: 'before-last-message',
    emptyMessages: 'remove',
  });

  const basePrompt = viper7SystemPrompt({
    isAssociate: isAssociateFrom(subscriptions),
    persona,
    userInfo,
    skaProfile,
    conversationSummary,
  });

  const startedAt = Date.now();
  let timeToFirstChunkMs: number | undefined;

  return streamText({
    model: geminiFlash,
    system: voice
      ? [basePrompt, VOICE_MODE_PROMPT, voice.tavusRules]
          .filter(Boolean)
          .join('\n\n')
      : basePrompt,
    messages: modelMessages,
    abortSignal,
    tools: {
      searchKB: makeSearchKBTool({ writer, courseSlug, userId }),
      checkFlyability: makeCheckFlyabilityTool({
        messages: modelMessages,
        uiMessages,
      }),
    },
    toolChoice: 'auto',
    stopWhen: stepCountIs(4),
    // Gemini 3 thinks at length by default, and every second of it is a
    // second the learner stares at an empty bubble. 'low' still leaves room
    // to decide when to search; 'minimal' is the next step if this is slow.
    providerOptions: {
      google: { thinkingConfig: { thinkingLevel: 'low' } },
    },
    // Word chunking for text too: line chunking held a reply back until it
    // wrote a newline, so a one-paragraph answer arrived only once complete.
    experimental_transform: [smoothStream({ delayInMs: 20, chunking: 'word' })],
    onChunk: ({ chunk }) => {
      // Server-side time to the first text chunk after smoothing, i.e. close
      // to when the learner sees it; tool-only steps don't count, so a
      // search-first turn is measured to its answer.
      if (timeToFirstChunkMs === undefined && chunk.type === 'text-delta') {
        timeToFirstChunkMs = Date.now() - startedAt;
      }
    },
    onFinish: ({ totalUsage, steps }) => {
      // Measured, not assumed: these are the numbers the compaction and
      // caching work is judged by.
      console.info('viper7 usage', {
        chatId,
        channel: voice ? 'voice' : 'text',
        timeToFirstChunkMs,
        steps: steps.length,
        inputTokens: totalUsage.inputTokens,
        cachedInputTokens: totalUsage.inputTokenDetails?.cacheReadTokens,
        outputTokens: totalUsage.outputTokens,
        firstStepInputTokens: steps[0]?.usage.inputTokens,
      });
    },
  });
}
