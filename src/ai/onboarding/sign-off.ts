import { generateText } from 'ai';
import { geminiFlash } from '#/ai/ai-provider';
import { onboardingSystemPrompt } from '#/ai/prompts/onboarding';
import type { OnboardingContext } from '#/machines/onboarding-machine';
import { HESITANCY_TURN_THRESHOLD } from '#/machines/onboarding-machine';

/**
 * Acknowledges a declined (or exhausted) consent gate. Brief and warm — no
 * re-pitching why onboarding is useful, no asking why they said no. Declining
 * is a complete, acceptable answer on its own.
 */
export const signOff = async ({
  context,
  courseName,
}: {
  context: OnboardingContext;
  courseName: string;
}): Promise<string> => {
  const system = onboardingSystemPrompt({
    courseName,
    questions: context.questions,
    remindControls: context.turnCount >= HESITANCY_TURN_THRESHOLD,
  });

  const prompt = `The trainee has chosen not to proceed with this conversation. Produce a
brief, warm sign-off: acknowledge their choice, thank them for their time,
and let them know it's no problem and won't affect anything else. Do not
re-pitch why onboarding is useful, and do not ask why they declined.`;

  const { text } = await generateText({ model: geminiFlash, system, prompt });
  return text;
};
