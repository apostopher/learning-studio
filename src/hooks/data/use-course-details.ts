import { useQuery } from "@tanstack/react-query";

export function useCourseDetails(slug?: string) {
  return useQuery({
    queryKey: ["course-details", slug],
    queryFn: async () => {
      const response = await fetch(`/api/course/details?slug=${slug}`);
      if (!response.ok) {
        throw new Error("Failed to fetch course details");
      }
      return response.json();
    },
    staleTime: 1000 * 60 * 60 * 48, // 48 hours
    gcTime: 1000 * 60 * 60 * 48, // 48 hours
    enabled: !!slug,
  });
}
