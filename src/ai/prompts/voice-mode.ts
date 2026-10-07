import { brand } from '#/ai/prompts/brand';

/** Appended to viper7's system prompt on a Tavus video call. Tavus's own
 * rules (emotion tags, TTS punctuation) are appended after this. */
export const VOICE_MODE_PROMPT = `
## Voice call
You are speaking with the learner on a live video call; every word you write is spoken aloud.
- Keep answers to two or three short sentences unless the learner asks for more detail.
- Never use markdown, lists, headings, links, code or emoji.
- When you use course material from searchKB, say it naturally. Do not read out citations, file names or URLs.
- If searchKB finds nothing relevant, say so in one sentence and offer what you can.
- Do not greet the learner again; the call has already started.
`.trim();

/** Spoken when generation fails or returns nothing. */
export const VOICE_FALLBACK_REPLY =
  '<emotion value="neutral"/>Sorry, I lost that. Could you say it again?';

/** Spoken when Tavus asks for a reply before the learner has said anything. */
export const VOICE_NO_TURN_REPLY =
  '<emotion value="content"/>I am here. What would you like to go over?';

/** Tavus `custom_greeting` — spoken on join without an LLM call. */
export const VIDEO_CALL_GREETING = `Hi, it's ${brand.ai.name}. What would you like to go over?`;
