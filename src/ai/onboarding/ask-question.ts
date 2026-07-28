import { generateText } from 'ai';
import { geminiFlash } from '#/ai/ai-provider';
import { onboardingSystemPrompt } from '#/ai/prompts/onboarding';
import type { OnboardingContext } from '#/machines/onboarding-machine';
import { HESITANCY_TURN_THRESHOLD } from '#/machines/onboarding-machine';

/**
 * Produces the current question, phrased naturally given the conversation so
 * far — never the raw `text` field read aloud.
 */
export const askQuestion = async ({
  context,
  courseName,
  questionId,
}: {
  context: OnboardingContext;
  courseName: string;
  questionId: string;
}): Promise<string> => {
  const system = onboardingSystemPrompt({
    courseName,
    questions: context.questions,
    remindControls: context.turnCount >= HESITANCY_TURN_THRESHOLD,
  });

  const question = context.questions.find((q) => q.id === questionId);
  const questionLine =
    question?.text ??
    "the next topic in the arc described in your system prompt's What to Cover section";

  const previousReplyLine =
    context.lastReply === null
      ? ''
      : `\n\nTheir most recent message was: "${context.lastReply}"\n\nLet it shape how you transition into the next question — follow up on
anything worth acknowledging before moving on.`;

  const prompt = `The next thing to cover is: ${questionLine}

Ask about it in your own words, as a natural continuation of the
conversation — one question, not a list.${previousReplyLine}`;

  const { text } = await generateText({ model: geminiFlash, system, prompt });
  return text;
};
