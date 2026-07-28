import { generateObject } from 'ai';
import { sonnet } from '#/ai/ai-provider';
import { onboardingSystemPrompt } from '#/ai/prompts/onboarding';
import type { OnboardingContext } from '#/machines/onboarding-machine';
import { HESITANCY_TURN_THRESHOLD } from '#/machines/onboarding-machine';
import type { OnboardingConsentEvaluation } from '#/types';
import { OnboardingConsentEvaluationSchema } from '#/types';

/**
 * Decides whether the trainee has agreed to proceed. This is the machine's
 * safety gate: nothing is asked, stored, or collected before this returns
 * `consented`, so the prompt must never let an ambiguous or lukewarm reply
 * read as a yes.
 */
export const evaluateConsent = async ({
  context,
  courseName,
  reply,
}: {
  context: OnboardingContext;
  courseName: string;
  reply: string;
}): Promise<OnboardingConsentEvaluation> => {
  const system = onboardingSystemPrompt({
    courseName,
    questions: context.questions,
    remindControls: context.turnCount >= HESITANCY_TURN_THRESHOLD,
  });

  const prompt = `The trainee was just asked whether they're ready to begin this onboarding
conversation. Their reply was:

"${reply}"

Decide what this reply means for consent:

- "consented": ONLY a clear, affirmative, unambiguous yes to starting the
  conversation now — e.g. "yes", "sure, let's go", "I'm ready". Consent must
  be affirmative. Never infer a yes from silence, a question, a change of
  subject, a joke, a conditional ("maybe later"), or any reply that doesn't
  actually say yes.
- "needs_clarification": they asked a question, seem unsure, or said
  something that isn't a clear yes or no. Anything short of a clear yes
  belongs here or in "declined" — it must NEVER be scored as "consented".
  When this is the status, set \`reply\` to a short note of what they asked
  or seemed unsure about, so it can be answered before asking again.
- "declined": they said no, or clearly don't want to proceed.

When the status is "consented" or "declined", set \`reply\` to \`null\`.

Bias toward "needs_clarification" over "consented" whenever there is any
doubt — treating an unclear reply as consent is the one mistake this
evaluation must never make.`;

  const { object } = await generateObject({
    model: sonnet,
    schema: OnboardingConsentEvaluationSchema,
    system,
    prompt,
  });

  return object;
};
