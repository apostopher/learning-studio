// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ModuleColumn } from '../module-column';

// ClampedText measures with `useRef`/`useState`, and react-compiler nulls the
// hook dispatcher for this repo's components under vitest — rendering it
// here fails before any assertion runs. Stubbed to a plain span, matching
// the pattern already used for `module-accordion-item.test.tsx`.
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

const mod = {
  id: 10,
  name: 'Weather',
  slug: 'weather',
  imageUrlAvif: null,
  imageUrlWebp: null,
  rank: 1,
  requiredSubscriptions: [],
  dependsOn: [],
  sequentialLessons: true,
  learnerCount: 0,
  owner: { id: 6, name: '3D Airmanship' },
  otherCourseCount: 1,
  lessons: [],
};

describe('ModuleColumn for a borrowed module', () => {
  it('shows provenance and the edit link, and offers no add/edit/delete controls', () => {
    render(
      <ModuleColumn
        module={mod}
        provenance={{
          ownerName: '3D Airmanship',
          editLinkSlot: (
            <a
              href="/admin/6/editor"
              aria-label="Edited in 3D Airmanship — open its board to change this module"
            >
              Edited in 3D Airmanship
            </a>
          ),
        }}
      />,
    );
    expect(screen.getByText('from 3D Airmanship')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /Edited in 3D Airmanship/ }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', {
        name: /Add lesson|Edit module|Delete module/,
      }),
    ).toBeNull();
  });
});
