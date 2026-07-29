import { generateText } from 'ai';
import { geminiFlash } from '#/ai/ai-provider';
import { onboardingSystemPrompt } from '#/ai/prompts/onboarding';
import type { OnboardingContext } from '#/machines/onboarding-machine';
import { shouldRemindControls } from '#/machines/onboarding-machine';

/**
 * Produces the warm open plus consent framing that starts (or re-starts) the
 * consent gate.
 *
 * `context.lastClarification` distinguishes the two cases this actor is
 * invoked for: on the very first entry it is `null` and this produces the
 * full opening. On a re-greet — the trainee asked a question instead of
 * answering yes/no — it holds what they asked, and the model answers that
 * directly instead of repeating the opening verbatim, then re-asks for
 * consent.
 */
export const greet = async ({
  context,
  courseName,
}: {
  context: OnboardingContext;
  courseName: string;
}): Promise<string> => {
  const system = onboardingSystemPrompt({
    courseName,
    questions: context.questions,
    remindControls: shouldRemindControls(context),
  });

  const prompt =
    context.lastClarification === null
      ? `This is the very first message of the conversation. Produce the warm
opening: introduce yourself and the purpose of this chat, state the
stop/suspend/delete controls, and end by clearly asking whether they're
ready to get started.`
      : `The trainee has not yet agreed to proceed. Before answering yes or no,
they asked or said this: "${context.lastClarification}"

Answer what they raised, directly and briefly — do not repeat the full
opening again from scratch. Then re-ask clearly whether they're ready to
get started.`;

  const { text } = await generateText({ model: geminiFlash, system, prompt });
  return text;
};
