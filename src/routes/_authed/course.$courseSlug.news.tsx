import { createFileRoute } from '@tanstack/react-router';
import { SectionStub } from '#/components/section-stub';

/** Placeholder for the News section. */
export const Route = createFileRoute('/_authed/course/$courseSlug/news')({
  component: () => (
    <SectionStub
      title="News"
      description="Industry updates and announcements relevant to this course."
    />
  ),
});
