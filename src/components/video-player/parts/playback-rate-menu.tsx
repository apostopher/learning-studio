import { Menu } from '@base-ui/react/menu';
import { Gauge } from 'lucide-react';

type PlaybackRateMenuProps = {
  rate: number;
  rates: number[];
  label: string;
  onChange?: (rate: number) => void;
  /**
   * Where the popup is mounted: the player's root. Inside it, the popup shows
   * in fullscreen (where only the root's subtree is drawn) and above any
   * dialog the player sits in.
   */
  container?: React.RefObject<HTMLDivElement | null>;
};

export const PlaybackRateMenu = ({
  rate,
  rates,
  label,
  onChange,
  container,
}: PlaybackRateMenuProps) => (
  <Menu.Root>
    <Menu.Trigger
      className="vp-icon-button vp-icon-button--text"
      aria-label={`${label}: ${rate}x`}
      disabled={!onChange}
    >
      <Gauge size={20} aria-hidden="true" />
      <span
        style={{
          fontSize: '0.75rem',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {rate}x
      </span>
    </Menu.Trigger>
    <Menu.Portal container={container}>
      <Menu.Positioner
        sideOffset={8}
        // Fixed, not absolute: the root clips its overflow, and a short
        // preview would cut the list off.
        positionMethod="fixed"
        style={{ zIndex: 60 }}
      >
        <Menu.Popup
          style={{
            background: 'var(--color-gray-1)',
            color: 'var(--color-gray-12)',
            borderRadius: 'var(--radius-md, 0.375rem)',
            padding: 4,
            boxShadow: '0 8px 24px var(--color-gray-a8)',
            minInlineSize: 96,
          }}
        >
          {rates.map((r) => (
            <Menu.Item
              key={r}
              onClick={() => onChange?.(r)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBlock: 6,
                paddingInline: 8,
                borderRadius: 4,
                cursor: 'pointer',
                background:
                  r === rate ? 'var(--color-accent-a4)' : 'transparent',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <span>{r}x</span>
              {r === rate ? <span aria-hidden="true">✓</span> : null}
            </Menu.Item>
          ))}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  </Menu.Root>
);
