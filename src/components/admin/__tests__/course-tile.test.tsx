// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CourseTile } from '../course-tile';

describe('CourseTile', () => {
  it('names the course and counts its modules and lessons, with the cover when there is one', () => {
    const { container } = render(
      <CourseTile
        name="3D Airmanship"
        imageUrlAvif="/a.avif"
        imageUrlWebp="/a.webp"
        moduleCount={7}
        lessonCount={23}
      />,
    );
    expect(screen.getByText('3D Airmanship')).toBeTruthy();
    expect(screen.getByText('7 modules · 23 lessons')).toBeTruthy();
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/a.webp');
    // Decorative: the tile's link already names the course.
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
  });

  it('uses the singular for one module and one lesson, and a placeholder without a cover', () => {
    const { container } = render(
      <CourseTile
        name="Mini"
        imageUrlAvif={null}
        imageUrlWebp={null}
        moduleCount={1}
        lessonCount={1}
      />,
    );
    expect(screen.getByText('1 module · 1 lesson')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });

  /**
   * Same treatment as the lesson cards: an outline in ITPS's orange on hover
   * and keyboard focus, driven by the wrapping link (`group`), colour-only.
   */
  it('lights its outline from the wrapping link’s hover and keyboard focus', () => {
    const { container } = render(
      <CourseTile
        name="Mini"
        imageUrlAvif={null}
        imageUrlWebp={null}
        moduleCount={0}
        lessonCount={0}
      />,
    );
    const cls = (container.firstElementChild as HTMLElement).className;
    expect(cls).toContain('group-hover:outline-warning-9');
    expect(cls).toContain('group-focus-visible:outline-warning-9');
    expect(cls).not.toMatch(/scale|translate/);
  });
});
