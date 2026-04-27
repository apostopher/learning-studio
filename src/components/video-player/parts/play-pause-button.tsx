import { Pause, Play } from 'lucide-react';

type PlayPauseButtonProps = {
  paused: boolean;
  playLabel: string;
  pauseLabel: string;
  onPlay?: () => void;
  onPause?: () => void;
};

export const PlayPauseButton = ({
  paused,
  playLabel,
  pauseLabel,
  onPlay,
  onPause,
}: PlayPauseButtonProps) => {
  const handler = paused ? onPlay : onPause;
  const label = paused ? playLabel : pauseLabel;
  return (
    <button
      type="button"
      onClick={handler}
      disabled={!handler}
      aria-label={label}
      className="vp-icon-button"
    >
      {paused ? (
        <Play size={20} aria-hidden="true" />
      ) : (
        <Pause size={20} aria-hidden="true" />
      )}
    </button>
  );
};
