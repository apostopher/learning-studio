import { Toggle } from '@base-ui/react/toggle';
import { Tooltip } from '@base-ui/react/tooltip';
import { MotionConfig, motion } from 'motion/react';
import {
  isVideoWatchRequiredDisabled,
  videoWatchWarning,
} from '#/components/admin/lesson-config/config-mappings';
import { type ChipTone, chipClassName } from '#/components/ui/chip';
import { IconButtonTooltip } from '#/components/ui/tooltip-icon-button';
import type {
  EditorBoardLesson,
  UpdateLessonConfigInput,
} from '#/lib/admin-schemas';

/**
 * Fast enough to feel like the chip answered, slow enough to be seen. A quarter
 * second is the whole gesture: press, release, settle.
 */
const PRESS_SPRING = { type: 'spring', duration: 0.25, bounce: 0.35 } as const;

interface LessonQuickshotProps {
  /**
   * The editor's narrower lesson type, so this row renders on BOTH boards —
   * the per-course board and the org-level knowledge editor, whose payload
   * omits `videoProvider`/`videoRef`. A full `BoardLesson` still satisfies it.
   */
  lesson: EditorBoardLesson;
  onPatch: (patch: UpdateLessonConfigInput) => void;
  /** Set while a mutation is in flight, or when the actor may not edit. */
  disabled?: boolean;
}

interface QuickshotToggleProps {
  label: string;
  /** What the tooltip says. Carries the reason when disabled or consequential. */
  tooltip: string;
  pressed: boolean;
  tone: ChipTone;
  disabled: boolean;
  onPressedChange: (next: boolean) => void;
}

const QuickshotToggle = ({
  label,
  tooltip,
  pressed,
  tone,
  disabled,
  onPressedChange,
}: QuickshotToggleProps) => (
  // Closes as soon as the pointer leaves — see `tooltip-icon-button.tsx`.
  <Tooltip.Root disableHoverablePopup>
    <Tooltip.Trigger
      // `aria-disabled`, NOT the native attribute: Base UI's Tooltip.Trigger
      // swallows `disabled` so a tooltip can still explain an unavailable
      // control — see the note in tooltip-icon-button.tsx. Dropping the
      // handler is what actually makes it inert, since `pointer-events-none`
      // stops the pointer but not Enter or Space.
      aria-disabled={disabled || undefined}
      aria-label={tooltip}
      render={
        <Toggle
          value={label}
          pressed={pressed}
          onPressedChange={disabled ? undefined : onPressedChange}
          // Motion earns its place here and nowhere else on this chip: the
          // colour swap is a CSS `transition-colors` already, but a press that
          // springs back — interruptible, with a little overshoot — is the one
          // thing CSS cannot do. `bounce` is what separates "the chip moved"
          // from "the chip is springy"; at 0.35 on a 5mm target it reads as
          // liveliness rather than wobble.
          render={
            <motion.button
              type="button"
              whileTap={disabled ? undefined : { scale: 0.92 }}
              transition={PRESS_SPRING}
            />
          }
        />
      }
      className={chipClassName(
        tone,
        'cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-apple-9 focus-visible:outline-offset-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
      )}
    >
      {label}
    </Tooltip.Trigger>
    <IconButtonTooltip label={tooltip} />
  </Tooltip.Root>
);

/**
 * The lesson's settings, as a row of chips you can hit without opening a dialog.
 *
 * No level chip: a lesson's levels belong to its discipline and are set on
 * the library's Update levels board, not per course.
 *
 * Only what the lesson asks **of the learner** lives here. Who may see it —
 * paid or free — is the padlock on the card itself (`LessonCard` `access`).
 *
 * **The colour system carries meaning, so don't pick tones by taste:**
 * - *success* (green) — demands something of the learner: a debrief, a watched video.
 * - *muted* (grey) — not required. The resting state.
 *
 * **Every chip carries a tooltip, and that is not decoration.** `BRIEF` and
 * `WATCH` are five letters of jargon; without hover text an admin has to open
 * the dialog to find out what they mean, which defeats the point of a quickshot.
 * The tooltip is also where a disabled chip explains itself.
 *
 * Deliberately hookless — the same react-compiler + Vitest constraint documented
 * on LinkPopover. All state comes in as props; every change leaves via `onPatch`.
 */
export const LessonQuickshot = ({
  lesson,
  onPatch,
  disabled = false,
}: LessonQuickshotProps) => {
  // You may LEAVE an unsatisfiable "watch required with no video" but not enter
  // one — see isVideoWatchRequiredDisabled.
  const watchLocked = disabled || isVideoWatchRequiredDisabled(lesson);

  const watchNote = videoWatchWarning(lesson);

  return (
    // `reducedMotion="user"` rather than a `useReducedMotion()` hook: this
    // component has to stay hookless for the render tests, and MotionConfig is
    // a component. Under the preference Motion drops the scale and keeps the
    // colour, which is the right reading of "gentler, not none".
    <MotionConfig reducedMotion="user">
      <div className="flex flex-wrap items-center gap-1 font-semibold">
        <QuickshotToggle
          label="Brief"
          tooltip={
            lesson.hasDebrief
              ? 'Debrief required — it counts toward the lesson score. Tap to make it optional.'
              : 'Debrief optional — learners can still take it, but it does not count toward the score. Tap to require it.'
          }
          pressed={lesson.hasDebrief}
          tone={lesson.hasDebrief ? 'solid-success' : 'muted'}
          disabled={disabled}
          onPressedChange={(hasDebrief) => onPatch({ hasDebrief })}
        />

        <QuickshotToggle
          label="Watch"
          tooltip={
            watchNote ??
            (lesson.needsVideoWatch
              ? 'Watch required — the video must be watched to complete this lesson. Tap to make it optional.'
              : 'Watch optional. Tap to require the video be watched.')
          }
          pressed={lesson.needsVideoWatch}
          tone={lesson.needsVideoWatch ? 'solid-success' : 'muted'}
          disabled={watchLocked}
          onPressedChange={(needsVideoWatch) => onPatch({ needsVideoWatch })}
        />
      </div>
    </MotionConfig>
  );
};
