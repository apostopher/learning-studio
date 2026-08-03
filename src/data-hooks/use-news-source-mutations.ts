import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CreateNewsSourceInput,
  NewsSource,
  UpdateNewsSourceInput,
} from '#/lib/admin-schemas';
import { newsSourceSchema } from '#/lib/admin-schemas';
import { dataKeys } from './keys';
import { newsSourceRequest } from './news-source-request';

const base = (courseId: number) =>
  `/api/admin/courses/${courseId}/news-sources`;

/** Invalidate the one list this course's sources live in. */
const useInvalidate = (courseId: number) => {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      queryKey: dataKeys.courseNewsSources(courseId),
    });
};

export function useCreateNewsSource(courseId: number) {
  const invalidate = useInvalidate(courseId);
  return useMutation({
    mutationFn: (input: CreateNewsSourceInput) =>
      newsSourceRequest({
        url: base(courseId),
        method: 'POST',
        body: input,
        parse: (json) => newsSourceSchema.parse(json),
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateNewsSource(courseId: number) {
  const invalidate = useInvalidate(courseId);
  return useMutation({
    mutationFn: ({
      sourceId,
      input,
    }: {
      sourceId: number;
      input: UpdateNewsSourceInput;
    }) =>
      newsSourceRequest({
        url: `${base(courseId)}/${sourceId}`,
        method: 'PATCH',
        body: input,
        parse: (json) => newsSourceSchema.parse(json),
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteNewsSource(courseId: number) {
  const invalidate = useInvalidate(courseId);
  return useMutation({
    mutationFn: (sourceId: number) =>
      newsSourceRequest({
        url: `${base(courseId)}/${sourceId}`,
        method: 'DELETE',
      }),
    onSuccess: invalidate,
  });
}

/**
 * Move a source between two neighbours. Optimistic: a drag that only settles
 * after a round trip reads as broken, so the list is reordered in cache
 * immediately and rolled back if the write fails.
 */
export function useReorderNewsSource(courseId: number) {
  const queryClient = useQueryClient();
  const key = dataKeys.courseNewsSources(courseId);

  return useMutation({
    mutationFn: ({
      sourceId,
      prevSourceId,
      nextSourceId,
    }: {
      sourceId: number;
      prevSourceId: number | null;
      nextSourceId: number | null;
      /** Post-drag order, used only to paint the optimistic update. */
      optimistic: NewsSource[];
    }) =>
      newsSourceRequest({
        url: `${base(courseId)}/${sourceId}`,
        method: 'PATCH',
        body: { prevSourceId, nextSourceId },
      }),
    onMutate: async ({ optimistic }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NewsSource[]>(key);
      queryClient.setQueryData<NewsSource[]>(key, optimistic);
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
