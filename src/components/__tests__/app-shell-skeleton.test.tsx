// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppShellSkeleton } from '../app-shell-skeleton';

describe('AppShellSkeleton', () => {
  it('announces that the course is loading', () => {
    render(<AppShellSkeleton />);
    expect(screen.getByRole('status').textContent).toContain('Loading course');
  });

  it('puts the sidebar skeleton in the complementary landmark', () => {
    render(<AppShellSkeleton />);
    const aside = screen.getByRole('complementary', { name: 'Sidebar' });
    expect(aside.querySelector('.sidebar-skeleton-row')).not.toBeNull();
  });

  it('puts the lesson skeleton in the main landmark', () => {
    render(<AppShellSkeleton />);
    const main = screen.getByRole('main');
    expect(main.querySelector('.lesson-skeleton-player')).not.toBeNull();
  });
});
