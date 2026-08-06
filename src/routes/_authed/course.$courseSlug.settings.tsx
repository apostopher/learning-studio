import { createFileRoute } from '@tanstack/react-router';
import { SkaProfileSectionContainer } from '#/components/ska-profile/ska-profile-section-container';

/**
 * Course settings. Still mostly a placeholder — the SKA profile is the first
 * real thing to live here, because it needs a home outside the chat widget:
 * the review card is dismissible, and an unreviewed profile is inert, so a
 * learner who closed the card needs somewhere to activate it from.
 */
export const Route = createFileRoute('/_authed/course/$courseSlug/settings')({
  component: SettingsRoute,
});

function SettingsRoute() {
  const { courseSlug } = Route.useParams();

  return (
    <div className="content-grid py-8">
      <div className="content flex flex-col gap-8">
        <header>
          <h1 className="font-semibold text-2xl text-primary">Settings</h1>
        </header>
        <SkaProfileSectionContainer courseSlug={courseSlug} />
      </div>
    </div>
  );
}
