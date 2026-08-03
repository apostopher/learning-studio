import type { NewsArticle } from '#/lib/news-schemas';
import { NewsArticleImage } from './news-article-image';
import { NewsKicker } from './news-kicker';
import { NewsStoryLink } from './news-story-link';

interface NewsColumnItemProps {
  article: NewsArticle;
  timeLabel: string;
}

/**
 * One story in the newsprint grid.
 *
 * The headline clamps at three lines to keep a row rhythm — `line-clamp`
 * truncates visually but leaves the full text in the DOM, so the link's
 * accessible name stays complete and nothing needs a `title` attribute.
 *
 * An article without an image simply has none: the headline and standfirst
 * fill the space. Newspapers run text-only stories constantly, and a grey
 * placeholder box announces a failure that has not occurred.
 */
export const NewsColumnItem = ({ article, timeLabel }: NewsColumnItemProps) => (
  <NewsStoryLink href={article.url} label={article.title} className="h-full">
    <article className="flex h-full flex-col gap-2">
      <NewsArticleImage src={article.imageUrl} aspect={3 / 2} />

      <NewsKicker
        sourceName={article.source.name}
        timeLabel={timeLabel}
        alsoCoveredBy={article.alsoCoveredBy}
      />

      <h3 className="line-clamp-3 font-serif text-lg leading-[1.2] text-primary group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4">
        {article.title}
      </h3>

      {article.description && (
        <p className="line-clamp-3 font-serif text-secondary text-sm leading-snug">
          {article.description}
        </p>
      )}
    </article>
  </NewsStoryLink>
);
