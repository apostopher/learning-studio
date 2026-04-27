import { Slider } from '@base-ui/react/slider';
import { formatTime } from '../format-time';

type ScrubberProps = {
  currentTime: number;
  duration: number;
  bufferedEnd: number;
  seekLabel: string;
  onSeek?: (time: number) => void;
};

export const Scrubber = ({
  currentTime,
  duration,
  bufferedEnd,
  seekLabel,
  onSeek,
}: ScrubberProps) => {
  const max = duration > 0 ? duration : 1;
  const buffered = Math.max(0, Math.min(bufferedEnd, max));
  const value = Math.max(0, Math.min(currentTime, max));
  const valueText = `${formatTime(value)} of ${formatTime(max)}`;
  return (
    <Slider.Root
      value={value}
      max={max}
      min={0}
      step={0.1}
      disabled={!onSeek || duration <= 0}
      onValueChange={(v) => onSeek?.(Array.isArray(v) ? v[0] : v)}
      aria-label={seekLabel}
      aria-valuetext={valueText}
      style={{ inlineSize: '100%' }}
    >
      <Slider.Control>
        <Slider.Track
          style={{
            position: 'relative',
            blockSize: 4,
            borderRadius: 9999,
            background: 'var(--color-gray-a7)',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              insetBlock: 0,
              insetInlineStart: 0,
              inlineSize: `${(buffered / max) * 100}%`,
              background: 'var(--color-gray-a9)',
              borderRadius: 9999,
            }}
          />
          <Slider.Indicator
            style={{
              background: 'var(--color-accent-9)',
              borderRadius: 9999,
            }}
          />
          <Slider.Thumb
            style={{
              inlineSize: 14,
              blockSize: 14,
              borderRadius: 9999,
              background: 'var(--color-accent-9)',
              boxShadow: '0 0 0 4px var(--color-accent-a4)',
            }}
          />
        </Slider.Track>
      </Slider.Control>
    </Slider.Root>
  );
};
