import { useAtom } from 'jotai';
import { toast } from 'sonner';

import { newsSourcesOpenAtom } from '#/atoms/news';
import {
  useCourseNews,
  useSetNewsSourceMuted,
} from '#/data-hooks/use-course-news';
import { useCourseDetails } from '#/hooks/data/use-course-details';
import { computeNewsState } from './compute-news-state';
import {
  formatArticleTime,
  formatDateline,
  formatLastUpdated,
} from './format-article-time';
import { NewsPage } from './news-page';

type NewsPageContainerProps = { courseSlug: string };

export const NewsPageContainer = ({ courseSlug }: NewsPageContainerProps) => {
  const { data, isLoading, isError, refetch } = useCourseNews(courseSlug);
  // The masthead is the course's name, never a fabricated publication title.
  // Served from a 48h-cached query the sidebar has already warmed, so this
  // costs no extra request on a normal navigation.
  const details = useCourseDetails(courseSlug);
  const setMuted = useSetNewsSourceMuted(courseSlug);
  const [pickerOpen, setPickerOpen] = useAtom(newsSourcesOpenAtom);

  const state = computeNewsState({ isLoading, isError, data });

  // One clock read per render, passed down as formatted strings. The
  // presentational components stay free of `new Date()`, which is what makes
  // them renderable in a test without freezing time.
  const now = new Date();
  const timeLabels: Record<number, string> =
    state.kind === 'stories'
      ? Object.fromEntries(
          [state.lead, state.second, ...state.rest]
            .filter((article) => article !== null)
            .map((article) => [
              article.id,
              formatArticleTime(
                article.publishedAt,
                article.publishedAtEstimated,
                now,
              ),
            ]),
        )
      : {};

  const sources =
    state.kind === 'loading' || state.kind === 'error' ? [] : state.sources;

  const handleToggle = (sourceId: number, muted: boolean) => {
    setMuted.mutate(
      { sourceId, muted },
      {
        onError: () =>
          toast.error(
            muted
              ? 'Could not hide that source.'
              : 'Could not show that source.',
          ),
      },
    );
  };

  /** Unmute everything — the way out of the all-muted empty state. */
  const handleShowAll = () => {
    for (const source of sources) {
      if (source.muted) setMuted.mutate({ sourceId: source.id, muted: false });
    }
  };

  return (
    <NewsPage
      state={state}
      courseName={details.data?.name ?? ''}
      dateline={formatDateline(now)}
      lastUpdatedLabel={
        state.kind === 'stories'
          ? formatLastUpdated(state.lastUpdatedAt, now)
          : null
      }
      timeLabels={timeLabels}
      onShowAllSources={handleShowAll}
      onRetry={() => void refetch()}
      sources={sources}
      sourcesOpen={pickerOpen}
      onSourcesOpenChange={setPickerOpen}
      onToggleSource={handleToggle}
      pendingSourceIds={
        setMuted.isPending && setMuted.variables
          ? [setMuted.variables.sourceId]
          : []
      }
    />
  );
};
