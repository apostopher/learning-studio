// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CourseSidebarHeader } from '../course-sidebar-header';

describe('CourseSidebarHeader', () => {
  it('renders the title and subtitle with module/lesson counts', () => {
    render(
      <CourseSidebarHeader
        title="3D Airmanship"
        moduleCount={12}
        lessonCount={87}
      />,
    );
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(
      '3D Airmanship',
    );
    expect(screen.getByText('12 modules · 87 lessons')).toBeDefined();
  });

  it('singularises the counts correctly', () => {
    render(
      <CourseSidebarHeader title="Tiny" moduleCount={1} lessonCount={1} />,
    );
    expect(screen.getByText('1 module · 1 lesson')).toBeDefined();
  });
});
