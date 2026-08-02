import { createFileRoute } from '@tanstack/react-router';
import { LibraryPageContainer } from '#/components/library/library-page-container';

/**
 * The course library. Nested under `/_authed/course/$courseSlug`, so it
 * inherits that layout's subscription guard, sidebar and header — a
 * non-subscriber is already redirected to /app before this renders.
 */
export const Route = createFileRoute('/_authed/course/$courseSlug/library')({
  component: LibraryRoute,
});

function LibraryRoute() {
  const { courseSlug } = Route.useParams();
  return <LibraryPageContainer courseSlug={courseSlug} />;
}
