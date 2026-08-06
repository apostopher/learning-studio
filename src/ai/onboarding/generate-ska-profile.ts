import { generateObject } from 'ai';
import { sonnet } from '#/ai/ai-provider';
import { skaProfileSystemPrompt } from '#/ai/prompts/ska-profile';
import { truncateSkaSections } from '#/lib/ska-profile';
import type { OnboardingMessage } from '#/machines/onboarding-machine';
import type { FlatOnboardingQuestion, OnboardingAnswers } from '#/types';
import { type SkaProfile, SkaProfileSchema } from '#/types';

/**
 * Distils a completed onboarding into a Skills / Knowledge / Attitude profile.
 *
 * Reads the FULL transcript, which the caller loads from
 * `course_onboarding_messages` rather than passing `context.transcript`.
 * That is not an optimisation, it is a correctness requirement: the machine's
 * context transcript is capped at `TRANSCRIPT_TURN_LIMIT` (20) turns, and the
 * turns it drops are the earliest ones — precisely where background,
 * qualifications and motivation were discussed. Attitude in particular is not
 * recoverable from the `answers` map alone; it lives in HOW someone answered,
 * which only the transcript records.
 *
 * A declined question is stored as `''` in `answers` (see the machine). It is
 * marked here as silence rather than passed through, for the same reason
 * `summarise` marks it: an empty string read as an answer becomes a
 * fabricated one.
 *
 * Best-effort by contract. It retries once and then gives up, and the caller
 * (the machine's `profiling` state) completes onboarding regardless — the
 * answers and transcript are already durable by this point, so letting a
 * derived artifact fail a finished interview would destroy the irreplaceable
 * thing to protect the reproducible one.
 */
export const generateSkaProfile = async ({
  courseName,
  questions,
  answers,
  transcript,
}: {
  courseName: string;
  questions: FlatOnboardingQuestion[];
  answers: OnboardingAnswers;
  /** The FULL transcript from the DB, not the machine's capped context copy. */
  transcript: OnboardingMessage[];
}): Promise<SkaProfile> => {
  const coveredLines = questions.map((question) => {
    const answer = answers[question.id];
    if (answer === undefined) {
      return `- ${question.text}\n  (never covered)`;
    }
    if (answer === '') {
      return `- ${question.text}\n  (the trainee declined this one — they told you nothing here, so treat it as silence and do not infer an answer from the fact that they declined)`;
    }
    return `- ${question.text}\n  Answer: ${answer}`;
  });

  const transcriptLines = transcript
    .map(
      (message) =>
        `${message.role === 'assistant' ? 'You' : 'Trainee'}: ${message.text}`,
    )
    .join('\n');

  const prompt = `Below is the complete intake conversation you had with this trainee for
${courseName}, followed by the answers that were recorded from it.

Write their SKA profile from it.

--- CONVERSATION ---

${transcriptLines}

--- RECORDED ANSWERS ---

${coveredLines.join('\n')}

--- END ---

Produce three sections. Each one is either grounded prose about THIS trainee,
or null. Do not write a section you cannot support from the material above.

- skills: what they can actually DO, from practice — flying, operating
  equipment, a trade, a craft, software they build with, languages they
  speak. Actions and tasks, not facts they know.
- knowledge: what they KNOW — training, qualifications, certifications,
  study, regulations and theory they've absorbed. Facts and concepts, not
  actions.
- attitude: the traits of character that will shape how they learn — pace and
  depth preferences, confidence or apprehension, how they responded to being
  asked about the final exam, whether they engaged openly or held back, what
  they said they wanted from the course. This is the section most likely to
  be invented, so hold it to the highest standard of evidence: base it on
  what they said and how they said it, never on a stereotype drawn from their
  job title or experience level.

Write each section as a short paragraph or a few bullets, in the third
person, addressed to a mentor who is about to teach this person and has not
met them. Be specific and concrete — "has flown fixed-wing gliders for six
years, no multirotor time" is useful; "has aviation experience" is not.

Return null for any section the conversation does not support. A trainee who
gave short answers, declined questions, or simply never touched on a section
should get null for it. An empty section is a correct and expected outcome —
it will be shown to them as an invitation to fill in themselves. A confident
paragraph they never gave you the material for is far worse than nothing,
because they may well accept it and then be taught to it for the rest of the
course.`;

  const { object } = await generateObject({
    model: sonnet,
    schema: SkaProfileSchema,
    system: skaProfileSystemPrompt({ courseName }),
    prompt,
  });

  // Truncate rather than reject: a model that overran the cap still produced
  // something usable, and `profiling` is best-effort — failing the whole
  // generation over a long paragraph would cost the user their profile.
  return truncateSkaSections(object);
};

/**
 * `generateSkaProfile` with the one retry the ledger specifies, resolving to
 * null instead of throwing when both attempts fail.
 *
 * The null return is the point: it makes "generation failed" an ordinary
 * value the caller handles rather than an exception that would route the
 * machine's `profiling` state to `failed` and take a completed interview down
 * with it.
 */
export const generateSkaProfileWithRetry = async (
  input: Parameters<typeof generateSkaProfile>[0],
): Promise<SkaProfile | null> => {
  try {
    return await generateSkaProfile(input);
  } catch (firstError) {
    console.error('SKA profile generation failed, retrying once:', firstError);
  }

  try {
    return await generateSkaProfile(input);
  } catch (retryError) {
    console.error('SKA profile generation failed after retry:', retryError);
    return null;
  }
};
