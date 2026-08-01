import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { MotionConfig, motion } from 'motion/react';
import { cn } from '#/lib/cn';

export interface BinaryToggleOption<V extends string> {
  value: V;
  label: string;
}

interface BinaryToggleProps<V extends string> {
  /** Currently selected value. */
  value: V;
  onValueChange: (next: V) => void;
  options: readonly [BinaryToggleOption<V>, BinaryToggleOption<V>];
  /** Optional value rendered disabled (e.g. an unavailable choice). */
  disabledValue?: V;
  /**
   * Accessible name for the group (the setting name). Also seeds the pill's
   * `layoutId`, so it must be unique among the BinaryToggles mounted together —
   * two controls sharing a label would slide their pills into each other.
   *
   * When rendering one per row, include the row's identity (e.g. the module
   * name), not just the setting's.
   */
  label: string;
}

/**
 * Two-option single-select segmented control on Base UI ToggleGroup.
 * Presentational: the parent owns the value and persistence. A single-select
 * ToggleGroup emits an empty array when the active item is clicked; that
 * change is ignored so the control always keeps a value.
 *
 * The selection is a single pill that travels between the two segments via a
 * shared-layout morph. Motion earns its place here over a CSS transform: the
 * spring stays interruptible when the setting is toggled rapidly, and Motion
 * measures real positions, so the travel direction is correct in RTL without a
 * physical-axis translate.
 */
export const BinaryToggle = <V extends string>({
  value,
  onValueChange,
  options,
  disabledValue,
  label,
}: BinaryToggleProps<V>) => {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ type: 'spring', visualDuration: 0.28, bounce: 0.18 }}
    >
      <ToggleGroup
        aria-label={label}
        value={[value]}
        onValueChange={(groupValue) => {
          const next = groupValue[0] as V | undefined;
          if (next && next !== value) onValueChange(next);
        }}
        // Equal-width columns rather than intrinsic ones: the pill then travels
        // a fixed distance without resizing, so its corners never distort.
        className="inline-grid grid-cols-2 gap-1 rounded-lg border border-gray-6 bg-gray-1 p-1"
      >
        {options.map((option) => {
          const isActive = option.value === value;
          const isDisabled = option.value === disabledValue;

          return (
            <Toggle
              key={option.value}
              value={option.value}
              disabled={isDisabled}
              className={cn(
                // min-h-9 keeps each segment a 36px target, and the group's
                // padding + border takes the whole control past 44px. Weight is
                // uniform across both segments on purpose: bolding the active
                // label would change its width and jitter the layout mid-slide.
                'relative flex min-h-9 min-w-16 items-center justify-center rounded-md px-3 font-medium text-sm',
                // Both labels cross-fade symmetrically as the pill passes, so
                // neither is ever the same colour as what is behind it.
                'transition-colors duration-150 ease-out',
                // The ring is offset OUTWARD on purpose. An inset ring would be
                // painted under the pill (an absolutely positioned child paints
                // over its parent's box-shadow), and a flush ring on the active
                // segment would just read as the pill having grown. Offset by 2
                // in the track colour, it separates from the pill and lands
                // inside the group's 4px padding in both states.
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9',
                'focus-visible:ring-offset-2 focus-visible:ring-offset-gray-1',
                isActive
                  ? cn(
                      'text-apple-contrast',
                      isDisabled && 'cursor-not-allowed',
                    )
                  : isDisabled
                    ? // `text-disabled` (not opacity) — the token is the
                      // WCAG-exempt one meant for inactive controls.
                      'cursor-not-allowed text-disabled'
                    : 'cursor-pointer text-secondary hover:bg-overlay-hover hover:text-primary active:bg-overlay-pressed',
              )}
            >
              {isActive && (
                <motion.span
                  layoutId={`binary-toggle-pill-${label}`}
                  // `layoutId` implies `layout`, so without this the pill
                  // re-measures on EVERY re-render of its parent and springs to
                  // wherever it landed. That is invisible in a static form, but
                  // in a list whose rows can collapse it means every pill on
                  // screen flies across the page when an unrelated section is
                  // folded — the control's own value never changed.
                  //
                  // Gating on `value` limits the layout animation to the one
                  // change that should move the pill: this toggle being
                  // switched. Reflows caused by anything else just render it in
                  // place, which is already correct, since it is `inset-0` of
                  // whichever segment is active.
                  layoutDependency={value}
                  aria-hidden="true"
                  className="absolute inset-0 bg-apple-9 shadow-low"
                  // Inline pixel radius: Motion only corrects corner distortion
                  // during a layout animation when the radius is in px, not from
                  // a utility class.
                  style={{ borderRadius: 8 }}
                />
              )}
              {/* Above the pill, and its own stacking context so the label never
                  gets painted under the travelling background. */}
              <span className="relative">{option.label}</span>
            </Toggle>
          );
        })}
      </ToggleGroup>
    </MotionConfig>
  );
};
