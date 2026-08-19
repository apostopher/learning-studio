import { Dialog } from '@base-ui/react/dialog';
import { LEVEL_LABELS } from '#/lib/level-labels';
import type { UserLevel } from '#/types';

export interface OutOfTierNoticeProps {
  notice: { level: UserLevel } | null;
  onDismiss: () => void;
}

/**
 * Explains why a direct/bookmarked/history link just bounced the pilot back
 * to the course: the lesson sits outside their current level and they never
 * completed it, so `/api/lesson/material` refused it (see
 * lib/lesson-gating.server.ts's `outOfTier` gate). Without this the redirect
 * alone reads as a bug — a link that silently goes nowhere.
 *
 * Mirrors PromotionInterstitial's structure (same Dialog pattern, same "no
 * z-index" reasoning — see that file's comment on the alert bar) since both
 * are one-shot, course-scoped notices mounted on `CourseLayout`.
 *
 * Pure and hookless by convention — `notice`/`onDismiss` are handed down by
 * the container that reads the atom.
 */
export const OutOfTierNotice = ({
  notice,
  onDismiss,
}: OutOfTierNoticeProps) => (
  <Dialog.Root
    open={notice !== null}
    onOpenChange={(open) => {
      if (!open) onDismiss();
    }}
  >
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 bg-gray-1/70 backdrop-blur-sm" />
      <Dialog.Popup className="fixed inset-0 m-auto h-fit w-[calc(100%-2rem)] max-w-md rounded-xl border border-gray-6 bg-gray-2 p-6 shadow-xl">
        {notice && (
          <>
            <Dialog.Title className="font-semibold text-primary text-xl">
              Not part of your level
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-secondary text-sm">
              That lesson isn&rsquo;t part of your current level (
              {LEVEL_LABELS[notice.level]}).
            </Dialog.Description>
            <button
              type="button"
              onClick={onDismiss}
              className="mt-6 rounded-lg bg-accent-9 px-4 py-2 font-medium text-accent-contrast text-sm transition-colors hover:bg-accent-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-9"
            >
              Got it
            </button>
          </>
        )}
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>
);
