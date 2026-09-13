// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BoardCourse } from '#/lib/admin-schemas';

vi.mock('../../clamped-text', () => ({
  ClampedText: ({ text }: { text: string }) => <span>{text}</span>,
}));

vi.mock('../../ui/tooltip-icon-button', () => ({
  TooltipIconButton: ({
    label,
    onClick,
  }: {
    label: string;
    onClick?: () => void;
  }) => (
    <button type="button" aria-label={label} onClick={onClick}>
      {label}
    </button>
  ),
}));

import { CourseColumn } from '../course-column';

function course(overrides: Partial<BoardCourse> = {}): BoardCourse {
  return {
    id: 1,
    name: '2 Week Intensive',
    slug: '2-week',
    description: null,
    imageUrlAvif: null,
    imageUrlWebp: null,
    ...overrides,
  };
}

describe('CourseColumn', () => {
  it('renders the course name and its children', () => {
    // Mutant: `children` is dropped from the JSX (the Accordion.Root
    // renders empty). This assertion fails against that mutant because the
    // module text passed in as a child would never be found.
    render(
      <CourseColumn course={course()}>
        <div>Module One</div>
      </CourseColumn>,
    );
    expect(screen.getByText('2 Week Intensive')).toBeTruthy();
    expect(screen.getByText('Module One')).toBeTruthy();
  });

  it('renders no action bar at all when it is given none', () => {
    // The header's own edit pencil is gone: course actions live in the
    // subheader now, and they are the caller's to supply. Mutant this
    // catches: the shell rendering its own default actions, which would put
    // edit and delete in front of an actor the caller deliberately withheld
    // them from.
    render(
      <CourseColumn course={course()}>
        <div>Module One</div>
      </CourseColumn>,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('puts its actions in the subheader, not adrift among the modules', () => {
    // Mutant: `actions` rendered inside the ScrollArea alongside the module
    // accordion, where they would scroll away with it. Asserting only that
    // the action is somewhere in the document cannot see this.
    render(
      <CourseColumn
        course={course()}
        actions={<button type="button">Delete 2 Week Intensive</button>}
      >
        <div data-testid="module">Module One</div>
      </CourseColumn>,
    );
    const action = screen.getByRole('button', {
      name: 'Delete 2 Week Intensive',
    });
    const module_ = screen.getByTestId('module');
    expect(module_.parentElement?.contains(action)).toBe(false);
  });

  /**
   * The cover is what tells two columns apart in a rail scrolled past the
   * point where the names are readable.
   *
   * `<picture>` with both sources, not a bare `<img>`: the pair is what makes
   * the browser take the AVIF where it can and the WebP where it cannot, and
   * a mutant that renders `imageUrlWebp` alone serves every browser the
   * larger file.
   */
  it('shows the course cover, offering AVIF and WebP', () => {
    render(
      <CourseColumn
        course={course({
          imageUrlAvif: 'https://blob.example/cover.avif',
          imageUrlWebp: 'https://blob.example/cover.webp',
        })}
      >
        <div>Module One</div>
      </CourseColumn>,
    );

    const img = document.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://blob.example/cover.webp');
    expect(
      Array.from(document.querySelectorAll('source')).map((s) => [
        s.getAttribute('type'),
        s.getAttribute('srcset'),
      ]),
    ).toEqual([
      ['image/avif', 'https://blob.example/cover.avif'],
      ['image/webp', 'https://blob.example/cover.webp'],
    ]);
  });

  /**
   * Decorative, deliberately: the course's name is announced directly above
   * it, so an alt of `2 Week Intensive cover` would make a screen reader read
   * the same name twice for no added information.
   *
   * An empty alt is a DECISION, and `img` with `alt=""` is exposed as
   * presentational. Mutant this catches: the alt dropped entirely, which is
   * the one thing that turns the image into an unnamed graphic a screen
   * reader has to announce.
   */
  it('marks the cover decorative rather than repeating the course name', () => {
    render(
      <CourseColumn
        course={course({ imageUrlWebp: 'https://blob.example/cover.webp' })}
      >
        <div>Module One</div>
      </CourseColumn>,
    );

    expect(document.querySelector('img')?.getAttribute('alt')).toBe('');
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  /**
   * Mutant this catches: the cover rendered unconditionally, which leaves a
   * bordered, background-filled empty box in the column of every course that
   * has no image — the same vertical cost as the thing it stands in for, and
   * nothing said.
   */
  it('renders no cover slot at all when the course has no image', () => {
    const { container } = render(
      <CourseColumn course={course()}>
        <div>Module One</div>
      </CourseColumn>,
    );

    expect(container.querySelector('picture')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  /**
   * Below the subheader and above the modules, and OUTSIDE the scroller with
   * the subheader — a cover that scrolled away would be missing exactly when
   * the rail is scrolled and you most need to tell one column from another.
   *
   * Asserted as document order and containment rather than by class name, so
   * it is the layout that is pinned rather than the spelling of it.
   */
  it('sits below the subheader and above the modules, and does not scroll away', () => {
    render(
      <CourseColumn
        course={course({ imageUrlWebp: 'https://blob.example/cover.webp' })}
        actions={<button type="button">Delete 2 Week Intensive</button>}
      >
        <div data-testid="module">Module One</div>
      </CourseColumn>,
    );

    const action = screen.getByRole('button', {
      name: 'Delete 2 Week Intensive',
    });
    const cover = document.querySelector('picture');
    const module_ = screen.getByTestId('module');
    if (!cover) throw new Error('no cover rendered at all');

    // DOCUMENT_POSITION_FOLLOWING: the cover comes after the subheader.
    expect(
      action.compareDocumentPosition(cover) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // ...and before the modules.
    expect(
      cover.compareDocumentPosition(module_) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // The modules' scroller does not contain it.
    expect(module_.parentElement?.contains(cover)).toBe(false);
  });
});
