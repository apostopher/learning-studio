import { createFileRoute } from '@tanstack/react-router';
import { NewsPageContainer } from '#/components/news/news-page-container';

/**
 * The course news feed. Nested under `/_authed/course/$courseSlug`, so it
 * inherits that layout's subscription guard — a non-subscriber is redirected
 * to /app before this renders. The API re-checks independently.
 */
export const Route = createFileRoute('/_authed/course/$courseSlug/news')({
  component: NewsRoute,
});

function NewsRoute() {
  const { courseSlug } = Route.useParams();
  return <NewsPageContainer courseSlug={courseSlug} />;
}
