import { Dialog } from '@base-ui/react/dialog';
import { LEVEL_LABELS } from '#/lib/level-labels';
import type { UserLevel } from '#/types';

export interface PromotionInterstitialProps {
  promotion: { id: number; from: UserLevel; to: UserLevel } | null;
  onDismiss: () => void;
}

/**
 * Announces a level promotion the moment it happens.
 *
 * Visibility in this course is exact-match by level, so the instant a pilot
 * is promoted every lesson they just finished disappears from the sidebar and
 * a new set appears. Without this, a pilot who just succeeded would return to
 * what looks like data loss. This dialog is the thing that stops that read —
 * it has to say all three of: you moved up, new material exists, and nothing
 * you did is gone.
 *
 * Pure and hookless by convention (see CLAUDE.md's React coding-style rules
 * and this repo's render-test setup, which nulls the hook dispatcher for any
 * component that calls its own hook) — `promotion`/`onDismiss` are the whole
 * of its state, both handed down by the container that reads the atom.
 */
export const PromotionInterstitial = ({
  promotion,
  onDismiss,
}: PromotionInterstitialProps) => (
  <Dialog.Root
    open={promotion !== null}
    onOpenChange={(open) => {
      if (!open) onDismiss();
    }}
  >
    <Dialog.Portal>
      {/* No z-index, matching every other dialog mounted under this layout
          (see the `.alert-bar` comment in styles.css): the alert bar
          deliberately stays at z-index: auto, relying on DOM order — every
          Base UI portal mounts after it in <body> — to paint above it. A
          dialog that set its own z-index here would invert that on any page
          where the alert bar is on. */}
      <Dialog.Backdrop className="fixed inset-0 bg-gray-1/70 backdrop-blur-sm" />
      <Dialog.Popup className="fixed inset-0 m-auto h-fit w-[calc(100%-2rem)] max-w-md rounded-xl border border-gray-6 bg-gray-2 p-6 shadow-xl">
        {promotion && (
          <>
            <Dialog.Title className="font-semibold text-primary text-xl">
              You're now {LEVEL_LABELS[promotion.to]}
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-secondary text-sm">
              You've completed every {LEVEL_LABELS[promotion.from]} lesson in
              this course, and moved up a level. New lessons are available now.
              Nothing you finished is gone — your completed work is still saved,
              and you can open it again any time as a read-only reference.
            </Dialog.Description>
            <button
              type="button"
              onClick={onDismiss}
              className="mt-6 rounded-lg bg-accent-9 px-4 py-2 font-medium text-accent-contrast text-sm transition-colors hover:bg-accent-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-9"
            >
              See what's new
            </button>
          </>
        )}
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>
);
