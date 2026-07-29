import { fromPromise } from 'xstate';
import { askQuestion } from '#/ai/onboarding/ask-question';
import { evaluateConsent } from '#/ai/onboarding/evaluate-consent';
import { evaluateReply } from '#/ai/onboarding/evaluate-reply';
import { greet } from '#/ai/onboarding/greet';
import { signOff } from '#/ai/onboarding/sign-off';
import { summarise } from '#/ai/onboarding/summarise';
import type { OnboardingContext } from '#/machines/onboarding-machine';
import type {
  OnboardingConsentEvaluation,
  OnboardingQuestions,
  OnboardingReplyEvaluation,
} from '#/types';
import {
  appendMessage,
  completeOnboarding,
  declineConsent,
  deleteOnboarding,
  saveAnswer,
} from '@/db/course-onboarding';

export type OnboardingDeps = {
  /**
   * The machine's context deliberately carries no course or user
   * identifiers (see the SECURITY note below) — the course name it needs
   * for prompts is supplied here instead.
   */
  courseName: string;
  /** Turns already persisted for this session; seeds the next turn's order. */
  initialMessageCount: number;
  /**
   * The course's effective question set. `saveAnswer` needs it to restamp
   * `questionSetHash` — the machine's `saveAnswer` actor input only carries
   * `{ onboardingId, questionId, answer }`, so this closes over it instead.
   *
   * NESTED, unlike the machine's own `context.questions`, which is the
   * flattened list. `hashQuestionSet` hashes category id/name/order as well as
   * the questions, so it needs the structure the admin actually authored —
   * flattening would silently drop the category fields from the hash and stop
   * a category rename from registering as a change.
   */
  questions: OnboardingQuestions;
};

/**
 * Wires the real actors and persistence into the machine.
 *
 * Transcript writes live here rather than in the machine: each text-producing
 * actor (`greet`, `askQuestion`, `signOff`, `summarise`) appends its own
 * assistant turn, and each evaluator (`evaluateConsent`, `evaluateReply`)
 * appends the user turn it was handed. That keeps the machine free of @/db
 * and avoids states that exist only to persist.
 *
 * SECURITY: every persistence actor here (`saveAnswer`, `completeOnboarding`,
 * `declineConsent`, `deleteOnboarding`) takes a bare `onboardingId` with no
 * ownership check of its own — the check happens once, upstream, in
 * `loadOnboardingSession({ userId, courseId })`. The id must only ever
 * originate from that call's result, seeded into the machine's input/context
 * by whoever constructs this actor. Do NOT add a parameter, option, or code
 * path here that lets a caller supply an `onboardingId` directly — that is
 * the shape an IDOR takes. The route that eventually drives this machine is
 * where that invariant has to be upheld; it is not enforced by this file.
 *
 * This module imports @/db, so it is not test-importable — which is exactly
 * why the machine does not import it.
 */
export const createOnboardingImplementations = (deps: OnboardingDeps) => {
  let order = deps.initialMessageCount;
  const nextOrder = () => order++;

  const say = async (onboardingId: number, text: string): Promise<string> => {
    await appendMessage({
      onboardingId,
      role: 'assistant',
      text,
      order: nextOrder(),
    });
    return text;
  };

  const heard = async (onboardingId: number, text: string): Promise<void> => {
    await appendMessage({
      onboardingId,
      role: 'user',
      text,
      order: nextOrder(),
    });
  };

  return {
    actors: {
      greet: fromPromise<string, { context: OnboardingContext }>(
        async ({ input }) =>
          say(
            input.context.onboardingId,
            await greet({
              context: input.context,
              courseName: deps.courseName,
            }),
          ),
      ),

      askQuestion: fromPromise<
        string,
        { context: OnboardingContext; questionId: string }
      >(async ({ input }) =>
        say(
          input.context.onboardingId,
          await askQuestion({
            context: input.context,
            courseName: deps.courseName,
            questionId: input.questionId,
          }),
        ),
      ),

      signOff: fromPromise<string, { context: OnboardingContext }>(
        async ({ input }) =>
          say(
            input.context.onboardingId,
            await signOff({
              context: input.context,
              courseName: deps.courseName,
            }),
          ),
      ),

      summarise: fromPromise<string, { context: OnboardingContext }>(
        async ({ input }) =>
          say(
            input.context.onboardingId,
            await summarise({
              context: input.context,
              courseName: deps.courseName,
            }),
          ),
      ),

      evaluateConsent: fromPromise<
        OnboardingConsentEvaluation,
        { context: OnboardingContext; reply: string }
      >(async ({ input }) => {
        await heard(input.context.onboardingId, input.reply);
        return evaluateConsent({
          context: input.context,
          courseName: deps.courseName,
          reply: input.reply,
        });
      }),

      evaluateReply: fromPromise<
        OnboardingReplyEvaluation,
        { context: OnboardingContext; questionId: string; reply: string }
      >(async ({ input }) => {
        await heard(input.context.onboardingId, input.reply);
        return evaluateReply({
          context: input.context,
          courseName: deps.courseName,
          questionId: input.questionId,
          reply: input.reply,
        });
      }),

      saveAnswer: fromPromise<
        void,
        { onboardingId: number; questionId: string; answer: string }
      >(async ({ input }) => {
        await saveAnswer({
          onboardingId: input.onboardingId,
          questionId: input.questionId,
          answer: input.answer,
          questions: deps.questions,
        });
      }),

      completeOnboarding: fromPromise<void, { onboardingId: number }>(
        async ({ input }) => {
          await completeOnboarding({ onboardingId: input.onboardingId });
        },
      ),

      declineConsent: fromPromise<void, { onboardingId: number }>(
        async ({ input }) => {
          await declineConsent({ onboardingId: input.onboardingId });
        },
      ),

      deleteOnboarding: fromPromise<void, { onboardingId: number }>(
        async ({ input }) => {
          await deleteOnboarding({ onboardingId: input.onboardingId });
        },
      ),
    },
  };
};
