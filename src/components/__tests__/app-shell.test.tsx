// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppShell } from '../app-shell';

describe('AppShell', () => {
  const renderShell = () =>
    render(
      <AppShell
        header={<div>HEADER_CONTENT</div>}
        aside={<div>ASIDE_CONTENT</div>}
        main={<div>MAIN_CONTENT</div>}
        footer={<div>FOOTER_CONTENT</div>}
      />,
    );

  it('renders the four landmark roles', () => {
    renderShell();
    expect(screen.getByRole('banner')).toBeDefined();
    expect(
      screen.getByRole('complementary', { name: 'Sidebar' }),
    ).toBeDefined();
    expect(screen.getByRole('main')).toBeDefined();
    expect(screen.getByRole('contentinfo')).toBeDefined();
  });

  it('routes each slot into the correct landmark', () => {
    renderShell();
    expect(screen.getByRole('banner').textContent).toBe('HEADER_CONTENT');
    expect(screen.getByRole('complementary').textContent).toBe('ASIDE_CONTENT');
    expect(screen.getByRole('main').textContent).toBe('MAIN_CONTENT');
    expect(screen.getByRole('contentinfo').textContent).toBe('FOOTER_CONTENT');
  });

  it('always renders the unsupported-screen slot (CSS hides it ≥ 768px)', () => {
    const { container } = renderShell();
    const slot = container.querySelector('.app-shell__unsupported');
    expect(slot).not.toBeNull();
    expect(slot?.getAttribute('role')).toBe('alert');
    expect(slot?.textContent).toContain('Desktop only');
  });
});
