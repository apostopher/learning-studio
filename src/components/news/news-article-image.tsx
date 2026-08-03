import { cn } from '#/lib/cn';

interface NewsArticleImageProps {
  src: string | null;
  /** Empty: the headline beside it is the accessible name for the whole card. */
  alt?: string;
  /** width / height of the reserved box. */
  aspect: number;
  className?: string;
}

/**
 * A publisher's article thumbnail.
 *
 * A plain `<img>`, deliberately NOT `OptimizedPicture` — that component emits
 * typed `<source>` elements for our own AVIF/WebP pairs, and these are single
 * hotlinked URLs of unknown format.
 *
 * `referrer-policy="no-referrer"` is the mitigation promised when hotlinking
 * was accepted in the cron ledger: the learner's browser still fetches from
 * the publisher, but does not announce which page they are reading.
 *
 * The aspect box is reserved whether or not an image exists, so a slow or
 * failing image never shifts the column beneath it.
 */
export const NewsArticleImage = ({
  src,
  alt = '',
  aspect,
  className,
}: NewsArticleImageProps) => {
  if (!src) return null;

  return (
    <div
      className={cn(
        'overflow-hidden rounded-sm border border-gray-6 bg-gray-2',
        className,
      )}
      style={{ aspectRatio: aspect }}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className="h-full w-full object-cover"
        // Hotlinked publisher images 404 and get hotlink-blocked routinely.
        // Removing the element leaves the text-led treatment rather than a
        // broken-image glyph; the reserved box collapses with it.
        onError={(event) => {
          const box = event.currentTarget.parentElement;
          if (box) box.remove();
        }}
      />
    </div>
  );
};
