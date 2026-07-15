interface CoursePictureProps {
  avifUrl: string | null;
  webpUrl: string | null;
  /** Required alt text for the cover image. */
  alt: string;
  /** Applied to the underlying <img> (sizing, object-fit, etc.). */
  className?: string;
}

/**
 * Renders a course cover as a <picture> so browsers pick AVIF when they can
 * decode it and fall back to WebP otherwise. Returns null when no image is set.
 */
export const CoursePicture = ({
  avifUrl,
  webpUrl,
  alt,
  className,
}: CoursePictureProps) => {
  const fallback = webpUrl ?? avifUrl;
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
