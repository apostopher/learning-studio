import type { FileTypeIconKind } from '#/lib/library-file-display';

type FileTypeIconProps = {
  kind: FileTypeIconKind;
  /** Rendered size in px. The sprite symbols are all 32×32. */
  size?: number;
};

/**
 * One file-type icon, referencing a symbol defined once by
 * `LibraryIconSprite`. Decorative: the file's name and type are already stated
 * in text beside it, so announcing "PDF icon" would only repeat them.
 */
export const FileTypeIcon = ({ kind, size = 36 }: FileTypeIconProps) => (
  <svg
    width={size}
    height={size}
    aria-hidden="true"
    focusable="false"
    className="shrink-0"
  >
    <use href={`#lib-icon-${kind}`} />
  </svg>
);
