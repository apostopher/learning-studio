import { createFileRoute } from "@tanstack/react-router";
import { auth } from "#/lib/auth";
import { getUserVideoProgress } from "#/db/videos-progress";

export const Route = createFileRoute("/api/course/progress")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth.api.getSession({
          headers: request.headers,
        });
        if (!session) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { searchParams } = new URL(request.url);
        const slug = searchParams.get("slug");
        if (!slug) {
          return new Response("Slug is required", { status: 400 });
        }
        const {
          user: { id: userId },
        } = session;
        const { progressByVideo, watchHistory } = await getUserVideoProgress({
          userId,
        });
        // Sets don't survive JSON.stringify — serialise as arrays.
        const progressByVideoJson: Record<string, number[]> = {};
        for (const [videoId, set] of Object.entries(progressByVideo)) {
          progressByVideoJson[videoId] = [...set];
        }
        return Response.json({
          progressByVideo: progressByVideoJson,
          watchHistory,
        });
      },
    },
  },
});
