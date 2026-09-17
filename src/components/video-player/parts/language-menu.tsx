import { Menu } from '@base-ui/react/menu';
import { Languages } from 'lucide-react';
import type { VideoLanguageOption } from '../types';

type LanguageMenuProps = {
  languages: VideoLanguageOption[];
  active: string;
  label: string;
  onChange?: (code: string) => void;
};

/**
 * Same chrome as PlaybackRateMenu: an icon button carrying the short badge,
 * a popup listing every language with its full name and a check on the one
 * playing. The trigger's accessible name says which language is on.
 */
export const LanguageMenu = ({
  languages,
  active,
  label,
  onChange,
}: LanguageMenuProps) => {
  const current = languages.find((l) => l.code === active) ?? languages[0];
  return (
    <Menu.Root>
      <Menu.Trigger
        className="vp-icon-button vp-icon-button--text"
        aria-label={`${label}: ${current.label}`}
        disabled={!onChange}
      >
        <Languages size={20} aria-hidden="true" />
        <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>
          {current.badge}
        </span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={8}>
          <Menu.Popup
            style={{
              background: 'var(--color-gray-1)',
              color: 'var(--color-gray-12)',
              borderRadius: 'var(--radius-md, 0.375rem)',
              padding: 4,
              boxShadow: '0 8px 24px var(--color-gray-a8)',
              minInlineSize: 180,
            }}
          >
            {languages.map((l) => (
              <Menu.Item
                key={l.code}
                onClick={() => onChange?.(l.code)}
                aria-current={l.code === active ? 'true' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  paddingBlock: 6,
                  paddingInline: 8,
                  borderRadius: 4,
                  cursor: 'pointer',
                  background:
                    l.code === active
                      ? 'var(--color-accent-a4)'
                      : 'transparent',
                }}
              >
                <span aria-hidden="true" style={{ inlineSize: 14 }}>
                  {l.code === active ? '✓' : ''}
                </span>
                <span style={{ flex: 1 }}>{l.label}</span>
                <span
                  style={{
                    // Matches the trigger's badge; `-text` is the measured
                    // AAA token, never a raw step 11.
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--color-gray-text)',
                  }}
                >
                  {l.badge}
                </span>
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
};
