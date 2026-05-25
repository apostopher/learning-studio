import { createFileRoute } from "@tanstack/react-router";
import { auth } from "#/lib/auth";
import { evaluateMCQ, evaluateFreeText } from "#/ai/evaluate-answer";
import type {
  AITestQuestion,
  AITestMCQQuestion,
  AITestFreeTextQuestion,
} from "#/ai/schemas";

export const Route = createFileRoute("/api/lesson/ai-test/evaluate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
          return new Response("Unauthorized", { status: 401 });
        }

        const body = await request.json();
        const { question, userAnswer, keyPoints, text } = body as {
          question: AITestQuestion;
          userAnswer: string;
          keyPoints: string[];
          text: string;
        };

        if (!question || userAnswer === undefined || userAnswer === null) {
          return Response.json(
            { error: "question and userAnswer are required" },
            { status: 400 },
          );
        }

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
