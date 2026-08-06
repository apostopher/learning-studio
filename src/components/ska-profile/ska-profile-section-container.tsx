import { useSkaProfile } from '#/data-hooks/use-ska-profile';
import { SkaProfileCardContainer } from './ska-profile-card-container';

/**
 * The learner's SKA profile on the course settings page.
 *
 * This surface is REQUIRED, not a convenience. A generated profile is stored
 * immediately but stays inert until reviewed, and the card in the chat widget
 * is dismissible — so anyone who closes the widget at the end of onboarding
 * has a profile that exists, does nothing, and has nowhere else to be
 * activated from. This is that place. Without it, closing a card would
 * silently and permanently unpersonalise someone.
 */
export const SkaProfileSectionContainer = ({
  courseSlug,
}: {
  courseSlug: string;
}) => {
  const { data: profile, isLoading, error } = useSkaProfile(courseSlug);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold text-lg text-primary">Your profile</h2>
        <p className="max-w-prose text-secondary text-sm">
          What Viper 7 keeps in mind about you on this course, from your intake
          conversation. Edit it whenever you like.
        </p>
      </div>

      {isLoading && (
        <output className="block rounded-element border border-border bg-muted px-4 py-6 text-secondary text-sm">
          Loading your profile…
        </output>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-element border border-border bg-muted px-4 py-6 text-error text-sm"
        >
          We couldn't load your profile just now. Refresh to try again.
        </p>
      )}

      {/* No profile is an ordinary state, not a failure — the learner may not
          have finished onboarding, or their interview may not have supported
          one. It says so plainly rather than showing an empty form, which
          would imply something is broken or that they have work to do here. */}
      {!isLoading && !error && !profile && (
        <p className="rounded-element border border-border border-dashed bg-muted px-4 py-6 text-secondary text-sm">
          You don't have a profile for this course yet. Viper 7 puts one
          together from your intake conversation once you've finished it.
        </p>
      )}

      {profile && (
        <SkaProfileCardContainer courseSlug={courseSlug} profile={profile} />
      )}
    </section>
  );
};
