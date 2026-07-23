// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CourseSidebarHeader } from '../course-sidebar-header';

describe('CourseSidebarHeader', () => {
  it('renders the title, subtitle counts, and the course progress ring', () => {
    render(
      <CourseSidebarHeader
        title="3D Airmanship"
        moduleCount={12}
        lessonCount={87}
        coursePercent={42}
      />,
    );
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(
      '3D Airmanship',
    );
    expect(screen.getByText('12 modules · 87 lessons')).toBeDefined();
    const ring = screen.getByRole('progressbar', {
      name: 'Course 3D Airmanship progress',
    });
    expect(ring.getAttribute('aria-valuenow')).toBe('42');
  });

  it('singularises the counts correctly', () => {
    render(
      <CourseSidebarHeader
        title="Tiny"
        moduleCount={1}
        lessonCount={1}
        coursePercent={0}
      />,
    );
    expect(screen.getByText('1 module · 1 lesson')).toBeDefined();
  });
});
