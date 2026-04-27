import { getVideoDetailsWithCache } from '#/integrations/synthesia/videos';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/lesson/video')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { searchParams } = new URL(request.url);
        const videoId = searchParams.get('videoId');
        if (!videoId) {
          return new Response('videoId is required', { status: 400 });
        }
        try {
          const details = await getVideoDetailsWithCache(videoId);
          return Response.json(details);
        } catch {
          return new Response('Video lookup failed', { status: 502 });
        }
      },
    },
  },
});
