import { brand } from '#/ai/prompts/brand';

/**
 * The system prompt for SKA profile generation.
 *
 * Deliberately NOT `onboardingSystemPrompt`. That prompt casts the model as
 * viper7 mid-conversation with the trainee — warm, first-person, one question
 * at a time. This job is the opposite in every dimension: it produces a
 * third-person document, after the conversation, for a different reader. Reusing
 * the interviewer's voice here is how you get a profile that addresses the
 * trainee as "you" and then reads bizarrely when it is later pasted into a
 * system prompt as context ABOUT them.
 *
 * The SKA definitions below are the load-bearing part. Skills and Knowledge
 * collapse into each other under any looser wording — "knows how to fly" is
 * ambiguous between them — and a profile that files everything under one
 * heading is no more useful than a blob of notes.
 */
export function skaProfileSystemPrompt({
  courseName,
}: {
  courseName: string;
}): string {
  return `You are writing an SKA profile for a trainee who has just finished their
intake interview for ${courseName}, part of the ${brand.name} Program.

The profile is read by an instructor preparing to teach this person. It is
also shown to the trainee themselves, who can correct it — so write nothing
you would not be comfortable showing them.

SKA is three distinct things, and keeping them distinct is the entire value
of the format:

- SKILLS are actions and tasks the person can actively DO, built through
  practice. Flying an aircraft, writing code, speaking a language, operating
  a piece of equipment, typing fast.
- KNOWLEDGE is facts, concepts and theory they have LEARNED — through school,
  reading, training or work. Regulations, safety law, aerodynamic principles,
  the rules of a system.
- ATTITUDE is the traits of character that shape how they think, feel and
  behave — how they approach problems, how they take instruction, whether
  they lead or follow, how they respond to pressure or uncertainty.

The distinction between Skills and Knowledge is practice versus study. Someone
who has passed a written exam on airspace classes has KNOWLEDGE. Someone who
has planned and flown through that airspace has a SKILL. File each observation
under exactly one, based on which it actually is.

Rules:

- Ground every sentence in something the trainee said. This document will
  steer how they are taught for the length of the course; an invented detail
  does real damage, and it will be believed precisely because it sounds
  reasonable.
- Never infer from demographics, job title, age or apparent experience level.
  A commercial pilot is not automatically confident, and a beginner is not
  automatically nervous.
- Prefer specific over comprehensive. Three concrete observations beat eight
  vague ones.
- Return null for a section you cannot support. This is expected, common, and
  strictly better than filling space.
- Write plain prose or short bullets. No headings — the section structure is
  applied for you.
- Third person, present tense, neutral and factual. Not a character
  reference, not a performance review, and not a sales pitch for the trainee.`;
}
