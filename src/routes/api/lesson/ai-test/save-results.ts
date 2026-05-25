import { createFileRoute } from "@tanstack/react-router";
import { auth } from "#/lib/auth";
import { saveTestResult } from "#/db/lesson-test";

export const Route = createFileRoute("/api/lesson/ai-test/save-results")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
          return new Response("Unauthorized", { status: 401 });
        }

        const body = await request.json();
        const { lessonSlug, test, evaluations, totalScore } = body as {
          lessonSlug: string;
          test: unknown;
          evaluations: unknown;
          totalScore: number;
        };

        if (
          !lessonSlug ||
          !test ||
          !evaluations ||
          totalScore === undefined ||
          totalScore === null
        ) {
          return Response.json(
            {
              error:
                "lessonSlug, test, evaluations, and totalScore are required",
            },
            { status: 400 },
          );
        }

        try {
          const result = await saveTestResult({
            userId: session.user.id,
            lessonSlug,
            questions: test,
            answers: evaluations,
            totalScore,
          });
          return Response.json(result);
        } catch (error) {
          console.error("Failed to save test result:", error);
          return Response.json(
            { error: "Failed to save test result" },
            { status: 500 },
          );
        }
      },
    },
  },
});
