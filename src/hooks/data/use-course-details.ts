import { useQuery } from "@tanstack/react-query";
import type { CourseDetails } from "@/db/course";

export function useCourseDetails(slug?: string) {
  return useQuery({
    queryKey: ["course-details", slug],
    queryFn: async () => {
      const response = await fetch(`/api/course/details?slug=${slug}`);
      if (!response.ok) {
        throw new Error("Failed to fetch course details");
      }
      const data = await response.json();
      return data as CourseDetails;
    },
    staleTime: 1000 * 60 * 60 * 48, // 48 hours
    gcTime: 1000 * 60 * 60 * 48, // 48 hours
    enabled: !!slug,
  });
}
