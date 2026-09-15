import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its test.
import { providerIdSchema } from '#/lib/admin-schemas';
import { dataKeys } from './keys';

const lessonVideoSchema = z.object({
  provider: providerIdSchema.nullable(),
  ref: z.string().nullable(),
});
export type LessonVideo = z.infer<typeof lessonVideoSchema>;

/**
 * Which video a lesson has, for the video field's prefill. Per lesson and
 * guarded server-side (content:read on the lesson's discipline) — the
 * library and editor-board payloads carry no ref, so this is where the
 * dialog gets one. `enabled` false when the lesson has no video: there is
 * nothing to prefill and no request to make.
 */
export function useLessonVideo(lessonId: number, enabled: boolean) {
  return useQuery({
    queryKey: dataKeys.lessonVideo(lessonId),
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<LessonVideo> => {
      const res = await fetch(`/api/admin/lessons/${lessonId}/video`);
      if (!res.ok) throw new Error(`Failed to load video (${res.status})`);
      return lessonVideoSchema.parse(await res.json());
    },
  });
}
