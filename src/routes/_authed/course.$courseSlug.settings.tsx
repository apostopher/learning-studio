import { createFileRoute } from '@tanstack/react-router';
import { SectionStub } from '#/components/section-stub';

/** Placeholder for the Settings section. */
export const Route = createFileRoute('/_authed/course/$courseSlug/settings')({
  component: () => (
    <SectionStub
      title="Settings"
      description="Your profile, notification preferences, and course options."
    />
  ),
});
