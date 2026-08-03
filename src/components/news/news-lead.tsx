import type { NewsArticle } from '#/lib/news-schemas';
import { NewsArticleImage } from './news-article-image';
import { NewsKicker } from './news-kicker';
import { NewsStoryLink } from './news-story-link';

interface NewsLeadProps {
  article: NewsArticle;
  timeLabel: string;
  /** `lead` is the dominant story; `second` is the smaller companion. */
  variant: 'lead' | 'second';
}

/**
 * One of the two stories above the fold.
 *
 * The lead never truncates its headline — it is the story, and a newspaper
 * would set it to fit rather than cut it. The second clamps its standfirst so
 * the pair keeps a shared baseline.
 */
export const NewsLead = ({ article, timeLabel, variant }: NewsLeadProps) => {
  const isLead = variant === 'lead';

  return (
    <NewsStoryLink href={article.url} label={article.title}>
      <article className="flex h-full flex-col gap-3">
        <NewsArticleImage
          src={article.imageUrl}
          aspect={isLead ? 16 / 9 : 4 / 3}
        />

        <NewsKicker
          sourceName={article.source.name}
          timeLabel={timeLabel}
          alsoCoveredBy={article.alsoCoveredBy}
        />

        <h2
          className={
            isLead
              ? 'font-serif text-3xl leading-[1.12] text-primary sm:text-[2.75rem] group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4'
              : 'font-serif text-2xl leading-[1.15] text-primary group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4'
          }
        >
          {article.title}
        </h2>

        {article.description && (
          <p
            className={
              isLead
                ? 'font-serif text-base text-secondary leading-relaxed'
                : 'line-clamp-3 font-serif text-sm text-secondary leading-relaxed'
            }
          >
            {article.description}
          </p>
        )}
      </article>
    </NewsStoryLink>
  );
};
