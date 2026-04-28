import { atomFamily } from "jotai-family";
import { atomWithQuery } from "jotai-tanstack-query";
import type { LessonMaterial } from "#/db/lesson";
import { queryKeys } from "#/hooks/data/keys";

export const lessonMaterialAtomFamily = atomFamily((lessonSlug: string) =>
  atomWithQuery<LessonMaterial>(() => ({
    queryKey: queryKeys.lessonMaterial(lessonSlug),
    queryFn: async () => {
      const response = await fetch(
        `/api/lesson/material?lessonSlug=${encodeURIComponent(lessonSlug)}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch lesson material");
      }
      return (await response.json()) as LessonMaterial;
    },
    enabled: !!lessonSlug,
    staleTime: 1000 * 60 * 60 * 1, // 1 hour
    gcTime: 1000 * 60 * 60 * 1, // 1 hour
    retry: 1,
  })),
);
