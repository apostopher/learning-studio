export interface CourseLevelBannerProps {
  /** Display label, e.g. "Intermediate" — already resolved via LEVEL_LABELS. */
  level: string;
  /**
   * 'earned' is an achievement the pilot did; 'admin' is something an admin
   * did to them. The copy has to say which — the same words for both would
   * misrepresent one of the two.
   */
  source: 'admin' | 'earned';
  /** The admin's note. Always null for an earned promotion. */
  message: string | null;
  onDismiss: () => void;
}

/**
 * The between-visits notice for a level change the pilot has not yet
 * acknowledged — mounted inside `AlertBar` (see CourseLevelBannerContainer).
 *
 * `role="status"` because this can appear on a page the pilot is already
 * looking at (the query resolving after mount, or a promotion earned earlier
 * in the session surfacing on the next course visit) — the same reason
 * LessonLocked/MaterialLocked use it. `text-white` rather than a semantic
 * token: `--color-alert-bar` is an arbitrary admin-configured hex with no
 * paired contrast token (unlike generateRadixColors' accentContrast), so
 * there is nothing to derive from — white clears WCAG AA on the fixed value
 * this env ships (~5.8:1).
 *
 * Presentational and hookless (see Global Constraints).
 */
export const CourseLevelBanner = ({
  level,
  source,
  message,
  onDismiss,
}: CourseLevelBannerProps) => (
  // biome-ignore lint/a11y/useSemanticElements: role=status is the live-region semantic; <output> would carry irrelevant form-control semantics
  <div
    role="status"
    className="flex w-full items-center justify-between gap-3 text-white"
  >
    <p className="text-sm">
      {source === 'earned' ? (
        <>
          You&rsquo;ve reached <strong>{level}</strong>. New lessons are
          available now.
        </>
      ) : (
        <>
          Your level in this course was changed to <strong>{level}</strong>.
          {message && <span> {message}</span>}
        </>
      )}
    </p>
    <button
      type="button"
      onClick={onDismiss}
      className="shrink-0 text-sm underline underline-offset-2"
    >
      Dismiss
    </button>
  </div>
);
