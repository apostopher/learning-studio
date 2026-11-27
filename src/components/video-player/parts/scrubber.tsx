import { Slider } from '@base-ui/react/slider';
import { formatTime } from '../format-time';

type ScrubberProps = {
  currentTime: number;
  duration: number;
  bufferedEnd: number;
  seekLabel: string;
  onSeek?: (time: number) => void;
  /**
   * Seconds past which the video is held back (a preview). That stretch of
   * the track is drawn red, and named in the slider's value text.
   */
  lockedFrom?: number;
};

export const Scrubber = ({
  currentTime,
  duration,
  bufferedEnd,
  seekLabel,
  onSeek,
  lockedFrom,
}: ScrubberProps) => {
  const max = duration > 0 ? duration : 1;
  const buffered = Math.max(0, Math.min(bufferedEnd, max));
  const value = Math.max(0, Math.min(currentTime, max));
  const locked =
    lockedFrom !== undefined && lockedFrom < max
      ? Math.max(0, lockedFrom)
      : null;
  const valueText = `${formatTime(value)} of ${formatTime(max)}${
    locked === null ? '' : `, preview ends at ${formatTime(locked)}`
  }`;
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
          {locked !== null && (
            // The held-back rest of a preview. Red, not grey: grey already
            // means "not buffered yet", which would promise it will play.
            <span
              aria-hidden="true"
              data-testid="vp-locked-range"
              style={{
                position: 'absolute',
                insetBlock: 0,
                insetInlineStart: `${(locked / max) * 100}%`,
                insetInlineEnd: 0,
                background: 'var(--color-error-9)',
                borderRadius: 9999,
              }}
            />
          )}
          <Slider.Indicator
            style={{
              background: 'var(--color-accent-9)',
              borderRadius: 9999,
            }}
          />
          <Slider.Thumb
            // On the thumb: it renders the slider's `input`, and Base UI only
            // names that input and gives it value text through these. Set on
            // the Root they never reached a screen reader.
            getAriaLabel={() => seekLabel}
            getAriaValueText={() => valueText}
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
