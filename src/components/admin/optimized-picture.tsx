interface OptimizedPictureProps {
  avifUrl: string | null;
  webpUrl: string | null;
  /**
   * A ready-made image served as-is — typically an SVG logo, which the
   * AVIF/WebP pair cannot represent. Lowest precedence, and deliberately
   * rendered WITHOUT a `<source type=...>`: declaring a format the file isn't
   * makes the browser select that source and then fail to decode it.
   */
  plainUrl?: string | null;
  /** Required alt text for the image. */
  alt: string;
  /** Applied to the underlying <img> (sizing, object-fit, etc.). */
  className?: string;
}

/**
 * Renders an image as a <picture> so browsers pick AVIF when they can decode
 * it, then WebP, then `plainUrl` as the plain <img> source. Returns null when
 * no image is set at all.
 */
export const OptimizedPicture = ({
  avifUrl,
  webpUrl,
  plainUrl = null,
  alt,
  className,
}: OptimizedPictureProps) => {
  const fallback = webpUrl ?? avifUrl ?? plainUrl;
  if (!fallback) return null;

  return (
    <picture>
      {avifUrl && <source srcSet={avifUrl} type="image/avif" />}
      {webpUrl && <source srcSet={webpUrl} type="image/webp" />}
      <img
        src={fallback}
        alt={alt}
        className={className}
        loading="lazy"
        decoding="async"
      />
    </picture>
  );
};
