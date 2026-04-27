import { useAtomValue } from "jotai";
import { atomFamily } from "jotai-family";
import { atomWithQuery } from "jotai-tanstack-query";
import type { CourseDetails } from "@/db/course";
import { queryKeys } from "./keys";

export const courseDetailsAtomFamily = atomFamily((slug: string) =>
  atomWithQuery(() => ({
    queryKey: queryKeys.courseDetails(slug),
    queryFn: async () => {
      const response = await fetch(`/api/course/details?slug=${slug}`);
      if (!response.ok) {
        throw new Error("Failed to fetch course details");
      }
      const data = await response.json();
      return data as CourseDetails;
    },
    enabled: !!slug,
    staleTime: 1000 * 60 * 60 * 48,
    gcTime: 1000 * 60 * 60 * 48,
  })),
);

export function useCourseDetails(slug?: string) {
  return useAtomValue(courseDetailsAtomFamily(slug ?? ""));
}
