// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SidebarSkeleton } from '../sidebar-skeleton';

describe('SidebarSkeleton', () => {
  it('sets aria-busy and aria-hidden on decorative rows', () => {
    const { container } = render(<SidebarSkeleton />);
    const root = container.firstElementChild;
    expect(root?.getAttribute('aria-busy')).toBe('true');
    const rows = container.querySelectorAll('.sidebar-skeleton-row');
    expect(rows.length).toBeGreaterThanOrEqual(7); // 1 header + 6 module rows
    rows.forEach((row) => {
      expect(row.getAttribute('aria-hidden')).toBe('true');
    });
  });

  it('applies decreasing opacity to each module row', () => {
    const { container } = render(<SidebarSkeleton />);
    const moduleRows = container.querySelectorAll(
      '[data-role="sidebar-skeleton-module"]',
    );
    const opacities = Array.from(moduleRows).map((el) =>
      Number.parseFloat((el as HTMLElement).style.opacity || '1'),
    );
    for (let i = 1; i < opacities.length; i += 1) {
      expect(opacities[i]).toBeLessThan(opacities[i - 1]);
    }
  });
});
