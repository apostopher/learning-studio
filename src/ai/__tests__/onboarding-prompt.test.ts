import { describe, expect, it } from 'vitest';
import { onboardingSystemPrompt } from '#/ai/prompts/onboarding';
import { flattenQuestions } from '#/lib/course-onboarding';
import type { OnboardingQuestions } from '#/types';

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
];

const base = {
  courseName: 'Remote Pilot Theory',
  questions: flattenQuestions(CATEGORIES),
  remindControls: false,
};

describe('onboardingSystemPrompt', () => {
  it('names the course', () => {
    expect(onboardingSystemPrompt(base)).toContain('Remote Pilot Theory');
  });

  it('includes every question it must cover', () => {
    const prompt = onboardingSystemPrompt(base);
    expect(prompt).toContain('What is your background?');
    expect(prompt).toContain('Civilian, military, or both?');
    expect(prompt).toContain('Why this course?');
  });

  it('instructs one question at a time', () => {
    expect(onboardingSystemPrompt(base).toLowerCase()).toContain(
      'one question at a time',
    );
  });

  it('states the three user controls', () => {
    const prompt = onboardingSystemPrompt(base).toLowerCase();
    expect(prompt).toContain('resume');
    expect(prompt).toContain('delete');
  });

  it('adds a control reminder only when asked', () => {
    const without = onboardingSystemPrompt(base);
    const with_ = onboardingSystemPrompt({ ...base, remindControls: true });
    expect(with_.length).toBeGreaterThan(without.length);
  });

  it('handles an empty question set without throwing', () => {
    expect(() =>
      onboardingSystemPrompt({ ...base, questions: [] }),
    ).not.toThrow();
  });

  it('gives a progression hint to ease into personal ground on the normal path', () => {
    const prompt = onboardingSystemPrompt(base).toLowerCase();
    expect(prompt).toContain('ease in');
    expect(prompt).toContain('most exposing');
  });
});

describe('onboardingSystemPrompt category grouping', () => {
  it('renders each category name as a heading', () => {
    const prompt = onboardingSystemPrompt(base);
    expect(prompt).toContain('### Aviation background');
    expect(prompt).toContain('### Motivation and goals');
  });

  it('emits one heading per category, never a duplicate', () => {
    // Grouping keys off CONSECUTIVE runs of categoryId, so a flattening bug
    // that interleaved categories would surface here as a repeated heading.
    const prompt = onboardingSystemPrompt(base);
    const headings = prompt.match(/^### /gm) ?? [];
    expect(headings).toHaveLength(2);
  });

  it('lists each category’s questions under its own heading, in order', () => {
    const prompt = onboardingSystemPrompt(base);
    const first = prompt.indexOf('### Aviation background');
    const second = prompt.indexOf('### Motivation and goals');
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    // q1 and q2 belong to the first category, q3 to the second.
    expect(prompt.indexOf('What is your background?')).toBeGreaterThan(first);
    expect(prompt.indexOf('Civilian, military, or both?')).toBeLessThan(second);
    expect(prompt.indexOf('Why this course?')).toBeGreaterThan(second);
  });

  it('numbers questions continuously across categories', () => {
    const prompt = onboardingSystemPrompt(base);
    expect(prompt).toContain('1. What is your background?');
    expect(prompt).toContain('2. Civilian, military, or both?');
    expect(prompt).toContain('3. Why this course?');
  });

  it('forbids reading category names aloud', () => {
    // The whole point of the grouping is that the learner never hears it as
    // structure. Without this the model narrates "Section B".
    const prompt = onboardingSystemPrompt(base).toLowerCase();
    expect(prompt).toContain('never say');
    expect(prompt).toContain('category');
  });

  it('makes marking a transition optional rather than mandatory', () => {
    const prompt = onboardingSystemPrompt(base).toLowerCase();
    expect(prompt).toContain('skipping it entirely is fine');
  });

  it('forbids confabulating a summary when little was shared', () => {
    // A declined question stores '' and counts as answered, so a fully
    // declined category still completes and would otherwise be "summarised".
    const prompt = onboardingSystemPrompt(base).toLowerCase();
    expect(prompt).toContain('do not summarise what they said if they said');
  });

  it('renders no category headings when there are no questions', () => {
    // The fallback arc is prose, not a grouped list. (The "Moving between
    // areas" guidance itself is unconditional — harmless with nothing to
    // group, and it costs a branch to strip.)
    const prompt = onboardingSystemPrompt({ ...base, questions: [] });
    expect(prompt).not.toContain('###');
  });
});
