import { SKA_SECTION_MAX_CHARS, type SkaProfile } from '#/types';

/**
 * The three sections, in the order they are rendered and in the order the
 * acronym names them. Exported so the editor can iterate one list rather than
 * hard-coding the trio in a second place.
 */
export const SKA_SECTIONS = [
  { key: 'skills', heading: 'Skills' },
  { key: 'knowledge', heading: 'Knowledge' },
  { key: 'attitude', heading: 'Attitude' },
] as const satisfies readonly { key: keyof SkaProfile; heading: string }[];

export type SkaSectionKey = (typeof SKA_SECTIONS)[number]['key'];

/**
 * Trims each section and collapses a blank one to null.
 *
 * `''` and `null` must not both be reachable states. They would mean the same
 * thing to a reader while comparing unequal, so `hasAnySection` and every
 * `!= null` check downstream would disagree about the same profile depending
 * on which path wrote it — the generator (null) or the edit form (''). One
 * canonical empty, applied at both write sites.
 */
export const normaliseSkaProfile = (profile: SkaProfile): SkaProfile => {
  const clean = (value: string | null): string | null => {
    const trimmed = value?.trim() ?? '';
    return trimmed === '' ? null : trimmed;
  };

  return {
    skills: clean(profile.skills),
    knowledge: clean(profile.knowledge),
    attitude: clean(profile.attitude),
  };
};

/** Whether the profile says anything at all. An all-null profile is stored
 * but never worth injecting — see `skaProfilePrompt`. */
export const hasAnySkaSection = (profile: SkaProfile): boolean => {
  const normalised = normaliseSkaProfile(profile);
  return SKA_SECTIONS.some((section) => normalised[section.key] !== null);
};

/**
 * Renders the profile as the markdown document the SKA definition describes:
 * `## Skills`, `## Knowledge`, `## Attitude`.
 *
 * Empty sections are OMITTED rather than emitted with a placeholder. A heading
 * followed by nothing invites the model to fill the silence — the whole point
 * of letting a section be null is that the model was unable to support it, and
 * printing the heading anyway hands back the invitation to guess.
 *
 * `sections` narrows which are rendered. Its caller is the no-course-in-context
 * branch of the chat route, which injects Attitude alone: Skills and Knowledge
 * are course-specific and would cross-contaminate a question about a different
 * course, while Attitude describes the person and travels.
 */
export const toSkaMarkdown = (
  profile: SkaProfile,
  { sections }: { sections?: readonly SkaSectionKey[] } = {},
): string => {
  const normalised = normaliseSkaProfile(profile);
  const wanted = sections ?? SKA_SECTIONS.map((section) => section.key);

  return SKA_SECTIONS.filter((section) => wanted.includes(section.key))
    .map((section) => ({ ...section, body: normalised[section.key] }))
    .filter((section) => section.body !== null)
    .map((section) => `## ${section.heading}\n\n${section.body}`)
    .join('\n\n');
};

/**
 * The profile as it crosses the wire.
 *
 * `reviewedAt` travels with the three sections rather than being derived or
 * inferred client-side, because it is what the UI branches on: an unreviewed
 * profile renders as "not in use yet — review to activate", a reviewed one as
 * settled. A client that had to guess would guess wrong in the one direction
 * that matters, telling the user their profile is live when nothing is
 * reading it.
 */
export type SkaProfileView = SkaProfile & { reviewedAt: string | null };

export const toSkaProfileView = (row: {
  skills: string | null;
  knowledge: string | null;
  attitude: string | null;
  reviewedAt: Date | null;
}): SkaProfileView => ({
  ...normaliseSkaProfile(row),
  reviewedAt: row.reviewedAt?.toISOString() ?? null,
});

/**
 * Truncates each section to the storage cap.
 *
 * Applied to MODEL output only, never to user input. A model that overruns the
 * cap has produced something otherwise usable, and failing the whole turn over
 * a long paragraph would cost the user their profile for a formatting miss
 * (`profiling` is best-effort by design — see the machine). A user who
 * overruns it in the edit form gets a validation error instead, because they
 * are present, can see the limit, and silently eating their last paragraph
 * would be the worse outcome.
 */
export const truncateSkaSections = (profile: SkaProfile): SkaProfile => {
  const cut = (value: string | null): string | null =>
    value === null ? null : value.slice(0, SKA_SECTION_MAX_CHARS);

  return normaliseSkaProfile({
    skills: cut(profile.skills),
    knowledge: cut(profile.knowledge),
    attitude: cut(profile.attitude),
  });
};
