import { generateObject } from 'ai';
import { sonnet } from '#/ai/ai-provider';
import { onboardingSystemPrompt } from '#/ai/prompts/onboarding';
import type { OnboardingContext } from '#/machines/onboarding-machine';
import { HESITANCY_TURN_THRESHOLD } from '#/machines/onboarding-machine';
import type { OnboardingReplyEvaluation } from '#/types';
import { OnboardingReplyEvaluationSchema } from '#/types';

/**
 * Decides what a trainee's reply means for the current question. `status` is
 * the pivot the machine transitions on, so "declined" and "needs_follow_up"
 * must not be conflated: a decline stores nothing (the machine writes an
 * empty string) while a follow-up either loops for more detail or, once the
 * cap is hit, stores their actual words. Scoring a vague-but-willing answer
 * as "declined" would discard what they said; scoring a refusal as
 * "needs_follow_up" would keep pressing someone who already said no.
 *
 * `hesitancy: true` is what drives the control-reminder behaviour — it
 * should be set whenever the trainee seems reluctant, slow to engage, or is
 * disengaging, independent of what `status` ends up being.
 */
export const evaluateReply = async ({
  context,
  courseName,
  questionId,
  reply,
}: {
  context: OnboardingContext;
  courseName: string;
  questionId: string;
  reply: string;
}): Promise<OnboardingReplyEvaluation> => {
  const system = onboardingSystemPrompt({
    courseName,
    questions: context.questions,
    remindControls:
      context.turnCount >= HESITANCY_TURN_THRESHOLD || context.hesitancyFlagged,
  });

  const question = context.questions.find((q) => q.id === questionId);
  const questionLine = question?.text ?? '(question no longer available)';

  // A follow-up loop re-invokes this actor multiple times for the SAME
  // question — a vague first answer, a narrowing follow-up, then a reply
  // that only makes sense combined with what came before it. `reply` alone
  // is just the latest fragment; without the exchange that produced it, a
  // three-turn answer collapses to its last sentence and the earlier turns
  // are lost from `answer` even though they were never contradicted. The
  // transcript (bounded, see `TRANSCRIPT_TURN_LIMIT`) supplies that context.
  const transcriptLines = context.transcript
    .map(
      (message) =>
        `${message.role === 'assistant' ? 'You' : 'Trainee'}: ${message.text}`,
    )
    .join('\n');

  const prompt = `The trainee was just asked (in your own phrasing, based on this underlying
question): "${questionLine}"

Here is the recent conversation, in order — it may include an earlier vague
answer and your own follow-up on this same question, not only the latest
reply:

${transcriptLines}

Their most recent reply was:

"${reply}"

Decide what this reply means, weighing the WHOLE exchange above for this
question, not just the latest reply in isolation:

- "answered": they gave a substantive answer to the question, whether in
  this reply alone or built up across this exchange. Set \`answer\` to a
  clean, self-contained restatement of everything they've told you for this
  question so far, in their own words — combine an earlier partial answer
  with what this reply adds or narrows down, rather than reporting only the
  latest fragment. This is what gets stored, so do not lose meaningful
  detail from earlier turns in the exchange.
- "needs_follow_up": they tried to answer but were vague, incomplete, or the
  reply doesn't clearly cover the question yet. Set \`followUp\` to a short,
  natural follow-up question that would draw out what's missing. Do not use
  this status for someone who does not want to answer — that is "declined".
- "declined": they explicitly don't want to answer this question (e.g. "I'd
  rather not say", "skip this one", "pass"). This is distinct from a vague
  attempt — someone who tried and was unclear is "needs_follow_up", not
  "declined". Set \`answer\` and \`followUp\` to \`null\`.
- "wants_pause": they're asking to stop now and pick this up later, or to
  suspend the conversation.
- "wants_delete": they're asking to stop and delete everything shared so
  far.

Independently of the status above, set \`hesitancy\` to \`true\` whenever the
trainee seems reluctant, uneasy, or is disengaging from the conversation —
short or clipped replies, a tone that signals discomfort, or hedging around
the question — even if they go on to answer it. Set it to \`false\` when
they seem comfortable and engaged. This flag is what decides whether the
stop/suspend/delete controls get gently repeated, so err toward \`true\`
when in doubt rather than missing a trainee who is quietly checked out.`;

  const { object } = await generateObject({
    model: sonnet,
    schema: OnboardingReplyEvaluationSchema,
    system,
    prompt,
  });

  return object;
};
