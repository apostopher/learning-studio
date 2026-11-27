import { Lock } from 'lucide-react';

type PreviewNoticeProps = {
  /** How much of the video the preview plays. */
  seconds: number;
};

/**
 * Shown when a preview reaches its cap (a free seat on a paid lesson): the
 * video stops, and this says why and what would change it, rather than
 * leaving a player that just halted. Same structure and voice as
 * `CoverageNotice`. Presentational and hookless.
 */
export const PreviewNotice = ({ seconds }: PreviewNoticeProps) => (
  // biome-ignore lint/a11y/useSemanticElements: role=status is the live-region semantic; <output> would carry irrelevant form-control semantics
  <div
    role="status"
    className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-1/85 px-6 text-center"
  >
    <span className="flex size-10 items-center justify-center rounded-full bg-gray-a3 text-secondary">
      <Lock className="size-5" aria-hidden="true" />
    </span>
    <p className="text-base font-medium text-primary">Preview ended</p>
    <p className="text-sm text-secondary">
      This is a paid lesson, and your plan plays the first {seconds} seconds of
      its video. Contact your supervisor for full access.
    </p>
  </div>
);
