import { MotionConfig, motion } from 'motion/react';
import type { NewsSourceChoice } from '#/lib/news-schemas';
import type { NewsPageState } from './compute-news-state';
import { NewsColumnItem } from './news-column-item';
import { NewsEmptyState } from './news-empty-state';
import { NewsLead } from './news-lead';
import { NewsMasthead } from './news-masthead';
import { NewsSkeleton } from './news-skeleton';

interface NewsPageProps {
  state: NewsPageState;
  courseName: string;
  dateline: string;
  lastUpdatedLabel: string | null;
  /** Formatted per article id, so this component stays free of clock access. */
  timeLabels: Record<number, string>;
  sources: readonly NewsSourceChoice[];
  sourcesOpen: boolean;
  onSourcesOpenChange: (open: boolean) => void;
  onToggleSource: (sourceId: number, muted: boolean) => void;
  pendingSourceIds: readonly number[];
  onShowAllSources: () => void;
  onRetry: () => void;
}

/**
 * Entrance motion.
 *
 * `staggerChildren` is why this is Motion rather than CSS: with 25 items the
 * CSS equivalent is a per-item inline `animation-delay`, computed in the
 * markup, which is exactly the kind of thing that rots when the list changes.
 *
 * The distance is small on purpose. This is a page settling into place, not
 * content flying in — a large travel on 27 elements reads as a slot machine.
 * `bounce: 0` because paper does not overshoot.
 */
const CONTAINER_VARIANTS = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.035, delayChildren: 0.05 } },
};

const ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 12 },
  shown: { opacity: 1, y: 0 },
};

export const NewsPage = ({
  state,
  courseName,
  dateline,
  lastUpdatedLabel,
  timeLabels,
  sources,
  sourcesOpen,
  onSourcesOpenChange,
  onToggleSource,
  pendingSourceIds,
  onShowAllSources,
  onRetry,
}: NewsPageProps) => {
  if (state.kind === 'loading') {
    return (
      <div className="content-grid py-8">
        <div className="content">
          <NewsSkeleton />
        </div>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="content-grid py-8">
        <div className="content flex flex-col items-center gap-3 py-16 text-center">
          <h2 className="font-serif text-primary text-xl">
            Today’s edition didn’t arrive
          </h2>
          <p className="max-w-prose font-sans text-secondary text-sm">
            We couldn’t load the news for this course.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 rounded-lg bg-accent-9 px-4 py-2 font-sans font-medium text-accent-contrast text-sm transition-colors hover:bg-accent-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-9 focus-visible:ring-offset-2"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    // `reducedMotion="user"` rather than branching per component: it drops
    // movement and keeps opacity across the whole subtree, which is what
    // "gentler, not none" means in practice.
    <MotionConfig
      reducedMotion="user"
      transition={{ type: 'spring', duration: 0.45, bounce: 0 }}
    >
      <div className="content-grid py-8">
        <div className="content">
          <NewsMasthead
            courseName={courseName}
            dateline={dateline}
            lastUpdatedLabel={lastUpdatedLabel}
            sources={sources}
            sourcesOpen={sourcesOpen}
            onSourcesOpenChange={onSourcesOpenChange}
            onToggleSource={onToggleSource}
            pendingSourceIds={pendingSourceIds}
          />
        </div>

        {state.kind === 'empty' ? (
          <div className="content pt-8">
            <NewsEmptyState
              reason={state.reason}
              mutedCount={state.mutedCount}
              onShowAll={
                state.reason === 'all-muted' ? onShowAllSources : undefined
              }
            />
          </div>
        ) : (
          /* Spans the outer grid and is itself a `.content-grid`, rather
             than `display: contents`. Contents would fix layout participation
             but NOT the `.content-grid > .breakout` child selector — the
             breakout would become a grandchild and stop breaking out. */
          <motion.div
            className="full-width content-grid"
            variants={CONTAINER_VARIANTS}
            initial="hidden"
            animate="shown"
          >
            {/*
              The heroes break out past the column measure. That step is what
              makes "more space" read structurally rather than as merely bigger
              type — the eye registers the lead crossing outside the grid.
            */}
            <motion.section
              variants={ITEM_VARIANTS}
              className="breakout grid grid-cols-1 gap-8 pt-8 lg:grid-cols-3"
              aria-label="Top stories"
            >
              <div className="lg:col-span-2">
                <NewsLead
                  article={state.lead}
                  timeLabel={timeLabels[state.lead.id] ?? ''}
                  variant="lead"
                />
              </div>
              {state.second && (
                <div className="border-gray-6 lg:border-s lg:ps-8">
                  <NewsLead
                    article={state.second}
                    timeLabel={timeLabels[state.second.id] ?? ''}
                    variant="second"
                  />
                </div>
              )}
            </motion.section>

            {state.rest.length > 0 && (
              <section
                className="content mt-10 border-gray-12 border-t-2 pt-8"
                aria-label="More stories"
              >
                {/*
                  Grid, not `column-count`. Flowed columns would put reading
                  order down column one and back up column two — which on a
                  scrolling page also detaches DOM order from visual order and
                  breaks keyboard and screen-reader traversal.
                */}
                <ul className="grid list-none grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                  {state.rest.map((article, index) => (
                    <motion.li
                      key={article.id}
                      variants={ITEM_VARIANTS}
                      className={
                        // Only the 2nd and 3rd of each row of three carry a
                        // rule, so none ever hangs off the grid's edge.
                        index % 3 === 0
                          ? undefined
                          : 'lg:border-gray-6 lg:border-s lg:ps-8'
                      }
                    >
                      <NewsColumnItem
                        article={article}
                        timeLabel={timeLabels[article.id] ?? ''}
                      />
                    </motion.li>
                  ))}
                </ul>
              </section>
            )}
          </motion.div>
        )}
      </div>
    </MotionConfig>
  );
};
