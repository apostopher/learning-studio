import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { auth } from "#/lib/auth";
import { generateTest } from "#/ai/generate-test";

const GenerateInputSchema = z.object({
  lessonSlug: z.string().min(1),
  keyPoints: z.array(z.string()).min(1),
  text: z.string().min(1),
});

export const Route = createFileRoute("/api/lesson/ai-test/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // const session = await auth.api.getSession({ headers: request.headers });
        // if (!session) {
        //   return new Response("Unauthorized", { status: 401 });
        // }

        const body = await request.json();
        const parsed = GenerateInputSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: "lessonSlug, keyPoints (non-empty), and text are required" },
            { status: 400 },
          );
        }
        const { lessonSlug, keyPoints, text } = parsed.data;

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
