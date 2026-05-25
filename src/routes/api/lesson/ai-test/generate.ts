import { createFileRoute } from "@tanstack/react-router";
import { auth } from "#/lib/auth";
import { generateTest } from "#/ai/generate-test";

export const Route = createFileRoute("/api/lesson/ai-test/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
          return new Response("Unauthorized", { status: 401 });
        }

        const body = await request.json();
        const { lessonSlug, keyPoints, text } = body as {
          lessonSlug: string;
          keyPoints: string[];
          text: string;
        };

        if (!lessonSlug || !keyPoints || !text) {
          return Response.json(
            { error: "lessonSlug, keyPoints, and text are required" },
            { status: 400 },
          );
        }

        try {
          const test = await generateTest(lessonSlug, keyPoints, text);
          return Response.json(test);
        } catch (error) {
          console.error("Failed to generate test:", error);
          return Response.json(
            { error: "Failed to generate test" },
            { status: 500 },
          );
        }
      },
    },
  },
});
