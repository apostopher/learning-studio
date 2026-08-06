import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  type SkaProfileView,
  useSaveSkaProfile,
} from '#/data-hooks/use-ska-profile';
import { SKA_SECTIONS } from '#/lib/ska-profile';
import { type SkaProfile, SkaProfileSchema } from '#/types';
import { SkaProfileCard } from './ska-profile-card';

const HINTS: Record<(typeof SKA_SECTIONS)[number]['key'], string> = {
  skills: 'Things you can do — built up through practice.',
  knowledge: "What you've learned — training, qualifications, theory.",
  attitude: 'How you like to learn and how you approach things.',
};

/**
 * Owns the form instance and the save mutation for one learner's SKA profile.
 *
 * Empty sections are bound as `''` rather than null because a textarea cannot
 * hold null; `normaliseSkaProfile` on the server collapses them back, so the
 * round trip is lossless and `''` never reaches storage.
 *
 * The form is keyed off `profile.reviewedAt` via `values` rather than
 * `defaultValues`: the same card can be re-rendered with a server response
 * after a save, and `defaultValues` would leave the fields showing what was
 * typed before rather than what was stored.
 */
export const SkaProfileCardContainer = ({
  courseSlug,
  profile,
}: {
  courseSlug: string;
  profile: SkaProfileView;
}) => {
  const save = useSaveSkaProfile(courseSlug);

  const form = useForm<SkaProfile>({
    resolver: zodResolver(SkaProfileSchema),
    values: {
      skills: profile.skills ?? '',
      knowledge: profile.knowledge ?? '',
      attitude: profile.attitude ?? '',
    },
    mode: 'onSubmit',
  });

  const fields = SKA_SECTIONS.map((section) => ({
    key: section.key,
    heading: section.heading,
    hint: HINTS[section.key],
    register: form.register(section.key),
    error: form.formState.errors[section.key]?.message,
    // Emptiness is judged from the SERVER's profile, not the live form value,
    // so the "nothing here yet" placeholder describes what was generated
    // rather than flickering in and out as the learner clears a field.
    isEmpty: profile[section.key] === null,
  }));

  return (
    <SkaProfileCard
      fields={fields}
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
      isSaving={save.isPending}
      reviewedAt={profile.reviewedAt}
      justSaved={save.isSuccess}
      saveError={save.error?.message}
    />
  );
};
