import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { auth } from "#/lib/auth";
import { saveTestResult } from "#/db/lesson-test";
import { AITestSchema, AIEvaluationResultSchema } from "#/ai/schemas";

const SaveResultsInputSchema = z.object({
  lessonSlug: z.string().min(1),
  test: AITestSchema,
  evaluations: z.array(AIEvaluationResultSchema),
  totalScore: z.number().int().min(0).max(100),
});

export const Route = createFileRoute("/api/lesson/ai-test/save-results")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // const session = await auth.api.getSession({ headers: request.headers });
        // if (!session) {
        //   return new Response("Unauthorized", { status: 401 });
        // }

        const body = await request.json();
        const parsed = SaveResultsInputSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: "Valid lessonSlug, test, evaluations, and totalScore are required" },
            { status: 400 },
          );
        }
        const { lessonSlug, test, evaluations, totalScore } = parsed.data;

        try {
          // TODO: restore session.user.id when auth is re-enabled
          const result = await saveTestResult({
            userId: "dev-user",
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
