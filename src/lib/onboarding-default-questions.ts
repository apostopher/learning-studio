import type { OnboardingQuestions } from '#/types';

/**
 * The built-in intake question set, derived from the Structure section of
 * docs/onboarding.md. Used only when a course has no admin-authored
 * questions.
 *
 * These ids are PERMANENT — they are persisted as answer keys, so changing
 * one orphans every answer already stored under it. The `core:` namespace
 * keeps them clear of admin question ids, which are crypto.randomUUID().
 *
 * The text is a starting point for the agent, not a script. docs/onboarding.md
 * requires the agent to phrase questions naturally and follow up rather than
 * read a form aloud.
 *
 * ALL FIVE LIVE IN ONE CATEGORY, deliberately. They cover five unrelated
 * topics, so one category each would fire a category transition on every
 * single turn — the worst possible version of that feature. A single category
 * fires none, so this fallback behaves exactly as it did before categories
 * existed.
 */
export const DEFAULT_ONBOARDING_QUESTIONS: OnboardingQuestions = [
  {
    id: 'core:default',
    name: 'Getting to know you',
    questions: [
      {
        id: 'core:background',
        text: "What's your background — the work you've done, any training or qualifications, and how much time you've spent around aircraft or drones so far?",
      },
      {
        id: 'core:motivation',
        text: 'What made you sign up for this course, and what would make it worth your time by the end?',
      },
      {
        id: 'core:learning-style',
        text: 'How do you learn best? Some people want to move fast and fill gaps later, others would rather go slowly and revisit a lesson until it really lands.',
      },
      {
        id: 'core:schedule',
        text: 'Realistically, how often do you expect to sit down with this, and what time of day tends to work best for you?',
      },
      {
        id: 'core:exam',
        text: "How are you feeling about the final interview and exam at the end — anything you're hoping for, or anything you'd rather not be blindsided by?",
      },
    ],
  },
];
