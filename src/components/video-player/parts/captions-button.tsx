import { Subtitles } from 'lucide-react';

type CaptionsButtonProps = {
  enabled: boolean;
  /**
   * True when this video is known to have no caption track at all (as
   * opposed to captions simply not being toggled on). Disclosed two ways,
   * per this project's rule that a disabled/unavailable control states its
   * reason VISIBLY and in the accessible name — never colour or opacity
   * alone: an always-visible `unavailableText` label next to the icon, and
   * `aria-label` carrying the full sentence for screen readers.
   *
   * Uses `aria-disabled`, not the `disabled` attribute: a native `disabled`
   * button is pulled out of the tab order entirely, which would make the
   * one thing that explains a missing caption track unreachable by keyboard
   * or screen-reader users — exactly the audience this exists for.
   */
  unavailable?: boolean;
  onLabel: string;
  offLabel: string;
  unavailableLabel?: string;
  /** Short, always-visible text shown next to the icon when `unavailable`. */
  unavailableText?: string;
  onToggle?: () => void;
};

export const CaptionsButton = ({
  enabled,
  unavailable = false,
  onLabel,
  offLabel,
  unavailableLabel,
  unavailableText,
  onToggle,
}: CaptionsButtonProps) => (
  <button
    type="button"
    onClick={unavailable ? undefined : onToggle}
    disabled={!unavailable && !onToggle}
    aria-disabled={unavailable ? true : undefined}
    aria-pressed={unavailable ? undefined : enabled}
    aria-label={
      unavailable
        ? (unavailableLabel ?? offLabel)
        : enabled
          ? onLabel
          : offLabel
    }
    className={
      unavailable ? 'vp-icon-button vp-icon-button--text' : 'vp-icon-button'
    }
    style={enabled ? { color: 'var(--color-accent-9)' } : undefined}
  >
    <Subtitles size={20} aria-hidden="true" />
    {unavailable ? (
      <span style={{ fontSize: '0.75rem' }}>{unavailableText}</span>
    ) : null}
  </button>
);
