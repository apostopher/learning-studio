import { Subtitles } from 'lucide-react';

type CaptionsButtonProps = {
  enabled: boolean;
  onLabel: string;
  offLabel: string;
  onToggle?: () => void;
};

export const CaptionsButton = ({
  enabled,
  onLabel,
  offLabel,
  onToggle,
}: CaptionsButtonProps) => (
  <button
    type="button"
    onClick={onToggle}
    disabled={!onToggle}
    aria-pressed={enabled}
    aria-label={enabled ? onLabel : offLabel}
    className="vp-icon-button"
    style={enabled ? { color: 'var(--color-accent-9)' } : undefined}
  >
    <Subtitles size={20} aria-hidden="true" />
  </button>
);
