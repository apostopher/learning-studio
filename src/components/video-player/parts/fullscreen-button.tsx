import { Maximize, Minimize } from 'lucide-react';

type FullscreenButtonProps = {
  isFullscreen: boolean;
  enterLabel: string;
  exitLabel: string;
  onToggle?: () => void;
};

export const FullscreenButton = ({
  isFullscreen,
  enterLabel,
  exitLabel,
  onToggle,
}: FullscreenButtonProps) => (
  <button
    type="button"
    onClick={onToggle}
    disabled={!onToggle}
    aria-pressed={isFullscreen}
    aria-label={isFullscreen ? exitLabel : enterLabel}
    className="vp-icon-button"
  >
    {isFullscreen ? (
      <Minimize size={20} aria-hidden="true" />
    ) : (
      <Maximize size={20} aria-hidden="true" />
    )}
  </button>
);
