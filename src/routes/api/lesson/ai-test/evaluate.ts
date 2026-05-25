import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { auth } from "#/lib/auth";
import { evaluateMCQ, evaluateFreeText } from "#/ai/evaluate-answer";
import {
  AITestQuestionSchema,
  type AITestMCQQuestion,
  type AITestFreeTextQuestion,
} from "#/ai/schemas";

const EvaluateInputSchema = z.object({
  question: AITestQuestionSchema,
  userAnswer: z.string(),
  keyPoints: z.array(z.string()),
  text: z.string(),
});

export const Route = createFileRoute("/api/lesson/ai-test/evaluate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
          return new Response("Unauthorized", { status: 401 });
        }

        const body = await request.json();
        const parsed = EvaluateInputSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: "Valid question, userAnswer, keyPoints, and text are required" },
            { status: 400 },
          );
        }
        const { question, userAnswer, keyPoints, text } = parsed.data;

        try {
          let result;
          if (question.type === "mcq") {
            result = evaluateMCQ(question as AITestMCQQuestion, userAnswer);
          } else {
            result = await evaluateFreeText(
              question as AITestFreeTextQuestion,
              userAnswer,
              keyPoints,
              text,
            );
          }
          return Response.json(result);
        } catch (error) {
          console.error("Failed to evaluate answer:", error);
          return Response.json(
            { error: "Failed to evaluate answer" },
            { status: 500 },
          );
        }
      },
    },
  },
});
