import { Subtitles } from 'lucide-react';

type CaptionsButtonProps = {
  enabled: boolean;
  /**
   * True when this video is known to have no caption track at all (as
   * opposed to captions simply not being toggled on). Renders the same
   * icon, permanently disabled, with an aria-label that says so — so the
   * absence is disclosed rather than looking identical to "no captions
   * button needed here."
   */
  unavailable?: boolean;
  onLabel: string;
  offLabel: string;
  unavailableLabel?: string;
  onToggle?: () => void;
};

export const CaptionsButton = ({
  enabled,
  unavailable = false,
  onLabel,
  offLabel,
  unavailableLabel,
  onToggle,
}: CaptionsButtonProps) => (
  <button
    type="button"
    onClick={onToggle}
    disabled={!onToggle}
    aria-pressed={unavailable ? undefined : enabled}
    aria-label={
      unavailable
        ? (unavailableLabel ?? offLabel)
        : enabled
          ? onLabel
          : offLabel
    }
    className="vp-icon-button"
    style={enabled ? { color: 'var(--color-accent-9)' } : undefined}
  >
    <Subtitles size={20} aria-hidden="true" />
  </button>
);
