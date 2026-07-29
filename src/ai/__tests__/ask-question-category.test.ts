import { describe, expect, it, vi } from 'vitest';

const { generateText } = vi.hoisted(() => ({ generateText: vi.fn() }));
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return { ...actual, generateText };
});

import { askQuestion } from '#/ai/onboarding/ask-question';
import { flattenQuestions } from '#/lib/course-onboarding';
import type { OnboardingContext } from '#/machines/onboarding-machine';
import type { OnboardingAnswers, OnboardingQuestions } from '#/types';

const CATEGORIES: OnboardingQuestions = [
  {
    id: 'c1',
    name: 'Aviation background',
    questions: [
      { id: 'q1', text: 'What is your background?' },
      { id: 'q2', text: 'Civilian, military, or both?' },
    ],
  },
  {
    id: 'c2',
    name: 'Motivation and goals',
    questions: [{ id: 'q3', text: 'Why this course?' }],
  },
  // A third category is what makes "last answered" and "previous array slot"
  // distinguishable: skipping all of c2 puts them in different categories.
  {
    id: 'c3',
    name: 'Learning style',
    questions: [{ id: 'q4', text: 'How do you learn best?' }],
  },
];

const QUESTIONS = flattenQuestions(CATEGORIES);

const context = (answers: OnboardingAnswers): OnboardingContext =>
  ({
    onboardingId: 1,
    questions: QUESTIONS,
    answers,
    transcript: [],
    currentQuestionId: null,
    followUpCount: 0,
    consentClarificationCount: 0,
    turnCount: 0,
    lastReply: null,
    lastClarification: null,
    pendingFollowUp: null,
    pendingCorrection: null,
    hesitancyFlagged: false,
  }) as unknown as OnboardingContext;

/** The prompt argument the model actually received on the most recent call. */
const lastPrompt = (): string => {
  const call = generateText.mock.calls.at(-1);
  return (call?.[0] as { prompt: string }).prompt;
};

/**
 * These assert on what `generateText` was CALLED WITH, not on what the machine
 * stored. Category transitions are deliberately optional at the model's
 * discretion, so no test can assert a transition was spoken — the honest seam
 * is whether the category context reached the prompt at all.
 */
describe('askQuestion category transitions', () => {
  it('tells the model when the next question crosses into a new category', async () => {
    generateText.mockResolvedValue({ text: 'ok' });
    // q1 and q2 (Aviation background) answered; q3 opens Motivation and goals.
    await askQuestion({
      context: context({ q1: 'a', q2: 'b' }),
      courseName: 'Course',
      questionId: 'q3',
    });

    const prompt = lastPrompt();
    expect(prompt).toContain('"Aviation background"');
    expect(prompt).toContain('"Motivation and goals"');
    expect(prompt).toContain('Moving between areas');
  });

  it('says nothing about categories when staying inside one', async () => {
    generateText.mockResolvedValue({ text: 'ok' });
    // q1 answered; q2 is in the SAME category, so there is no boundary.
    await askQuestion({
      context: context({ q1: 'a' }),
      courseName: 'Course',
      questionId: 'q2',
    });

    expect(lastPrompt()).not.toContain('Moving between areas');
  });

  it('says nothing about categories on the very first question', async () => {
    generateText.mockResolvedValue({ text: 'ok' });
    // Nothing answered yet: the greeting already opened the conversation, so
    // there is no outgoing category to round off.
    await askQuestion({
      context: context({}),
      courseName: 'Course',
      questionId: 'q1',
    });

    expect(lastPrompt()).not.toContain('Moving between areas');
  });

  it('uses the last ANSWERED question’s category, not the previous array slot', async () => {
    generateText.mockResolvedValue({ text: 'ok' });
    // The whole of "Motivation and goals" (q3) was never answered — a question
    // added mid-interview, or a category the trainee has not reached. Asking
    // q4 therefore moves out of "Aviation background", the last category they
    // actually said anything in.
    //
    // Reading the previous ARRAY slot instead would name "Motivation and
    // goals" as the outgoing category and have the agent round off a
    // conversation that never happened. Asserting the wrong name is ABSENT is
    // what makes this test distinguish the two implementations — both agree
    // that a boundary exists, and disagree only on which one.
    await askQuestion({
      context: context({ q1: 'a', q2: 'b' }),
      courseName: 'Course',
      questionId: 'q4',
    });

    const prompt = lastPrompt();
    expect(prompt).toContain('"Aviation background"');
    expect(prompt).toContain('"Learning style"');
    expect(prompt).not.toContain('"Motivation and goals"');
  });

  it('treats a declined (empty-string) answer as answered for boundary purposes', async () => {
    generateText.mockResolvedValue({ text: 'ok' });
    // Declining stores '' and counts as answered, so the category still
    // completes and crossing out of it is still a boundary.
    await askQuestion({
      context: context({ q1: '', q2: '' }),
      courseName: 'Course',
      questionId: 'q3',
    });

    expect(lastPrompt()).toContain('Moving between areas');
  });

  it('still asks the question itself when a boundary is crossed', async () => {
    generateText.mockResolvedValue({ text: 'ok' });
    await askQuestion({
      context: context({ q1: 'a', q2: 'b' }),
      courseName: 'Course',
      questionId: 'q3',
    });

    // The transition rides along with the question — it never replaces it.
    expect(lastPrompt()).toContain('Why this course?');
  });
});
