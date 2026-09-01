import { Toggle } from '@base-ui/react/toggle';
import { Tooltip } from '@base-ui/react/tooltip';
import { MotionConfig, motion } from 'motion/react';
import {
  accessSubscriptions,
  debriefWarning,
  isSubscriptionDisabled,
  isVideoWatchRequiredDisabled,
  videoWatchWarning,
} from '#/components/admin/lesson-config/config-mappings';
import { LessonLevelChip } from '#/components/admin/lesson-level-chip';
import { type ChipTone, chipClassName } from '#/components/ui/chip';
import { IconButtonTooltip } from '#/components/ui/tooltip-icon-button';
import type {
  EditorBoardLesson,
  EditorBoardModule,
  UpdateLessonConfigInput,
} from '#/lib/admin-schemas';
import type { UserLevel } from '#/types';

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
  /** Needed for access: a lesson can only be paid if its module is. */
  module: EditorBoardModule;
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
  <Tooltip.Root>
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
 * **The colour system carries meaning, so don't pick tones by taste:**
 * - *warning* (brown) — narrows **who may see** the lesson: its levels, and paid access.
 * - *success* (green) — demands something **of the learner**: a debrief, a watched video.
 * - *muted* (grey) — unrestricted, or not required. The resting state of everything.
 *
 * So a row of grey chips means "open to everyone, asks nothing", which is what
 * an untouched lesson should look like.
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
  module,
  onPatch,
  disabled = false,
}: LessonQuickshotProps) => {
  const isPaid = lesson.requiredSubscriptions.length > 0;

  // A free module cannot contain a paid lesson: accessSubscriptions would copy
  // the module's empty array back, so the chip would appear to do nothing.
  const accessLocked = disabled || isSubscriptionDisabled(module);
  // You may LEAVE an unsatisfiable "watch required with no video" but not enter
  // one — see isVideoWatchRequiredDisabled.
  const watchLocked = disabled || isVideoWatchRequiredDisabled(lesson);

  const briefNote = debriefWarning(lesson);
  const watchNote = videoWatchWarning(lesson);

  return (
    // `reducedMotion="user"` rather than a `useReducedMotion()` hook: this
    // component has to stay hookless for the render tests, and MotionConfig is
    // a component. Under the preference Motion drops the scale and keeps the
    // colour, which is the right reading of "gentler, not none".
    <MotionConfig reducedMotion="user">
      <div className="flex flex-wrap items-center gap-1 font-semibold">
        <LessonLevelChip
          value={lesson.levels}
          lessonName={lesson.name}
          disabled={disabled}
          onValueChange={(levels: UserLevel[]) => onPatch({ levels })}
        />

        <QuickshotToggle
          label={isPaid ? 'Paid' : 'Free'}
          tooltip={
            isSubscriptionDisabled(module)
              ? 'This module is free, so its lessons cannot be paid. Set the module’s access first.'
              : isPaid
                ? 'Paid — only subscribers see this lesson. Tap to make it free.'
                : 'Free — anyone enrolled sees this lesson. Tap to make it paid.'
          }
          pressed={isPaid}
          tone={isPaid ? 'soft-warning' : 'muted'}
          disabled={accessLocked}
          onPressedChange={(next) =>
            onPatch({
              requiredSubscriptions: accessSubscriptions(
                next ? 'subscription' : 'free',
                module,
              ),
            })
          }
        />

        <QuickshotToggle
          label="Brief"
          tooltip={
            briefNote ??
            (lesson.hasDebrief
              ? 'Debrief on — the learner answers questions after the video. Tap to turn off.'
              : 'Debrief off. Tap to require a debrief after the video.')
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
