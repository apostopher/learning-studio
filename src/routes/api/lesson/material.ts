import { createFileRoute } from "@tanstack/react-router";
import { getLessonMaterial } from "#/db/lesson";

export const Route = createFileRoute("/api/lesson/material")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { searchParams } = new URL(request.url);
        const lessonSlug = searchParams.get("lessonSlug");
        if (!lessonSlug) {
          return new Response("lessonSlug is required", { status: 400 });
        }
        const lessonMaterials = await getLessonMaterial(lessonSlug);

        if (!lessonMaterials) {
          return Response.json(
            { error: "Lesson material not found" },
            { status: 404 },
          );
        }
        return Response.json(lessonMaterials);
      },
    },
  },
});
