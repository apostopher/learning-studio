import { formatTime } from '../format-time';

type TimeDisplayProps = {
  currentTime: number;
  duration: number;
};

export const TimeDisplay = ({ currentTime, duration }: TimeDisplayProps) => (
  <span className="vp-time" aria-hidden="true">
    {formatTime(currentTime)} / {formatTime(duration)}
  </span>
);
