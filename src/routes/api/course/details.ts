import { getCourseDetails } from "#/db/course";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/course/details")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { searchParams } = new URL(request.url);
        const slug = searchParams.get("slug");
        if (!slug) {
          return new Response("Slug is required", { status: 400 });
        }
        const course = await getCourseDetails(slug);
        return Response.json(course);
      },
    },
  },
});
