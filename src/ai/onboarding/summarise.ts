import { generateText } from 'ai';
import { sonnet } from '#/ai/ai-provider';
import { onboardingSystemPrompt } from '#/ai/prompts/onboarding';
import type { OnboardingContext } from '#/machines/onboarding-machine';
import { HESITANCY_TURN_THRESHOLD } from '#/machines/onboarding-machine';

/**
 * Produces the doc's closing reflect-back: a short summary of what was
 * understood, an invitation to correct it, thanks, and what happens next.
 *
 * A declined question stores an empty string in `context.answers` (see
 * `onboarding-machine.ts`) — those must be listed as "you chose not to
 * answer this one" rather than read back as if the trainee had said
 * something, which would fabricate an answer they never gave.
 */
export const summarise = async ({
  context,
  courseName,
}: {
  context: OnboardingContext;
  courseName: string;
}): Promise<string> => {
  const system = onboardingSystemPrompt({
    courseName,
    questions: context.questions,
    remindControls:
      context.turnCount >= HESITANCY_TURN_THRESHOLD || context.hesitancyFlagged,
  });

  const coveredLines = context.questions.map((question) => {
    const answer = context.answers[question.id];
    if (answer === undefined) {
      return `- ${question.text}\n  (not covered)`;
    }
    if (answer === '') {
      return `- ${question.text}\n  (the trainee chose not to answer this one — do not invent an answer for it)`;
    }
    return `- ${question.text}\n  Answer: ${answer}`;
  });

  const prompt = `The conversation has covered the ground below. Produce the closing
message described in your system prompt's Closing section: reflect back a
short, warm summary of what you understood, invite them to correct
anything you got wrong, thank them for their time, and briefly explain
what happens next (the course format and how debriefs work).

Only summarise what they actually told you. Where an item is marked as not
answered or declined, leave it out of the summary rather than guessing or
making something up on their behalf.

${coveredLines.join('\n')}`;

  const { text } = await generateText({ model: sonnet, system, prompt });
  return text;
};
