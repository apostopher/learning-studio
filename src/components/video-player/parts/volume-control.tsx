import { Slider } from '@base-ui/react/slider';
import { Volume1, Volume2, VolumeX } from 'lucide-react';

type VolumeControlProps = {
  volume: number;
  muted: boolean;
  muteLabel: string;
  unmuteLabel: string;
  volumeLabel: string;
  onMuteToggle?: () => void;
  onVolumeChange?: (volume: number) => void;
};

export const VolumeControl = ({
  volume,
  muted,
  muteLabel,
  unmuteLabel,
  volumeLabel,
  onMuteToggle,
  onVolumeChange,
}: VolumeControlProps) => {
  const effective = muted ? 0 : volume;
  const Icon =
    muted || effective === 0 ? VolumeX : effective < 0.5 ? Volume1 : Volume2;
  const valueText = muted ? 'Muted' : `${Math.round(effective * 100)}%`;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <button
        type="button"
        onClick={onMuteToggle}
        disabled={!onMuteToggle}
        aria-label={muted ? unmuteLabel : muteLabel}
        aria-pressed={muted}
        className="vp-icon-button"
      >
        <Icon size={20} aria-hidden="true" />
      </button>
      <Slider.Root
        value={effective}
        min={0}
        max={1}
        step={0.01}
        disabled={!onVolumeChange}
        onValueChange={(v) => onVolumeChange?.(Array.isArray(v) ? v[0] : v)}
        aria-label={volumeLabel}
        aria-valuetext={valueText}
        style={{ inlineSize: 80 }}
      >
        <Slider.Control>
          <Slider.Track
            style={{
              blockSize: 4,
              borderRadius: 9999,
              background: 'var(--color-gray-a7)',
            }}
          >
            <Slider.Indicator
              style={{ background: 'var(--color-accent-9)', borderRadius: 9999 }}
            />
            <Slider.Thumb
              style={{
                inlineSize: 12,
                blockSize: 12,
                borderRadius: 9999,
                background: 'var(--color-accent-9)',
              }}
            />
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
    </div>
  );
};
