import { createFileRoute } from "@tanstack/react-router";
import { auth } from "#/lib/auth";
import { getTestResults } from "#/db/lesson-test";

export const Route = createFileRoute("/api/lesson/ai-test/results")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const lessonSlug = searchParams.get("lessonSlug");

        if (!lessonSlug) {
          return Response.json(
            { error: "lessonSlug is required" },
            { status: 400 },
          );
        }

        try {
          const results = await getTestResults(session.user.id, lessonSlug);
          return Response.json(results);
        } catch (error) {
          console.error("Failed to fetch test results:", error);
          return Response.json(
            { error: "Failed to fetch test results" },
            { status: 500 },
          );
        }
      },
    },
  },
});
