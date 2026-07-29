import { generateText } from 'ai';
import { geminiFlash } from '#/ai/ai-provider';
import { onboardingSystemPrompt } from '#/ai/prompts/onboarding';
import type { OnboardingContext } from '#/machines/onboarding-machine';
import { shouldRemindControls } from '#/machines/onboarding-machine';

/**
 * Produces the current question, phrased naturally given the conversation so
 * far — never the raw `text` field read aloud.
 *
 * When `context.pendingFollowUp` is set, this actor is being invoked from
 * the machine's `askingFollowUp` state, not `asking`: the previous reply was
 * vague and `evaluateReply` already composed a natural-language follow-up.
 * In the common case that text is delivered as-is — it's already phrased
 * for the trainee, and re-running it through the model would risk drifting
 * from what the evaluator determined was missing.
 *
 * The one exception is when `remindControls` is true: the control reminder
 * has to be woven into whatever this turn says, so the verbatim shortcut is
 * skipped and the model is asked to deliver the follow-up itself, with the
 * reminder folded in — a bare verbatim return has nowhere to put it.
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
  const remindControls = shouldRemindControls(context);

  if (context.pendingFollowUp !== null && !remindControls) {
    return context.pendingFollowUp;
  }

  const system = onboardingSystemPrompt({
    courseName,
    questions: context.questions,
    remindControls,
  });

  if (context.pendingFollowUp !== null) {
    const prompt = `The trainee's last answer was too vague, so the next thing to say is
this follow-up, in your own words rather than read verbatim:

"${context.pendingFollowUp}"

Your system prompt's Reminder section applies to this turn — weave the
control reminder in naturally alongside the follow-up, not as a separate
disclaimer bolted on.`;

    const { text } = await generateText({
      model: geminiFlash,
      system,
      prompt,
    });
    return text;
  }

  const question = context.questions.find((q) => q.id === questionId);
  const questionLine =
    question?.text ??
    "the next topic in the arc described in your system prompt's What to Cover section";

  // Category boundary detection.
  //
  // "The category of the last question they actually answered" — NOT the
  // previous entry in the array. Those differ whenever a question was added
  // mid-interview or a category was reordered, and answered-state is the only
  // definition that survives a pause/resume: it is derived entirely from
  // persisted `answers`, so resuming mid-category re-derives "no boundary
  // here" without storing a flag anywhere.
  //
  // Both null-cases resolve to "no transition": the first question of the
  // interview has nothing to close off (the greeting already did that), and a
  // question whose id is unknown gives us no category to compare.
  const answeredSoFar = context.questions.filter((q) =>
    Object.hasOwn(context.answers, q.id),
  );
  const previousCategoryId =
    answeredSoFar[answeredSoFar.length - 1]?.categoryId ?? null;

  const crossedIntoNewCategory =
    question != null &&
    previousCategoryId !== null &&
    question.categoryId !== previousCategoryId;

  const previousCategoryName = crossedIntoNewCategory
    ? (answeredSoFar[answeredSoFar.length - 1]?.categoryName ?? null)
    : null;

  const categoryLine =
    crossedIntoNewCategory && question != null
      ? `\n\nThis question moves from "${previousCategoryName}" into "${question.categoryName}".
Your system prompt's "Moving between areas" section applies — mark the shift or
don't, whichever reads better here.`
      : '';

  // The recent transcript (bounded, see `TRANSCRIPT_TURN_LIMIT`), not just
  // `context.lastReply` — a single most-recent message can't show that the
  // trainee gave a multi-turn answer to the previous question, so this turn
  // has more than one message's worth of conversation to acknowledge before
  // moving on.
  const transcriptLines = context.transcript
    .map(
      (message) =>
        `${message.role === 'assistant' ? 'You' : 'Trainee'}: ${message.text}`,
    )
    .join('\n');

  const previousReplyLine =
    context.transcript.length === 0
      ? ''
      : `\n\nHere is the recent conversation so far, in order:\n\n${transcriptLines}\n\nLet it shape how you transition into the next question — follow up on
anything worth acknowledging before moving on.`;

  const prompt = `The next thing to cover is: ${questionLine}

Ask about it in your own words, as a natural continuation of the
conversation — one question, not a list.${categoryLine}${previousReplyLine}`;

  const { text } = await generateText({ model: geminiFlash, system, prompt });
  return text;
};
