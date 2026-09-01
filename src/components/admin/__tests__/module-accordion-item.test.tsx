// @vitest-environment jsdom
import { Accordion } from '@base-ui/react/accordion';
import { render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { BoardModule } from '#/lib/admin-schemas';

// ClampedText measures with `useRef`/`useState`, and react-compiler nulls the
// hook dispatcher for this repo's components under vitest — rendering it
// here fails before any assertion runs. Stubbed to a plain span, matching
// the pattern already used for `LibraryLessonCard`'s tests.
vi.mock('../../clamped-text', () => ({
  ClampedText: ({ text }: { text: string }) => <span>{text}</span>,
}));

// TooltipIconButton requires a Base UI `Tooltip.Provider` ancestor and
// renders its label into a portal-only tooltip popup, neither of which this
// suite needs — stub it down to a plain button keyed by its accessible name,
// matching the pattern in `course-actions-container.test.tsx`.
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

import { ModuleAccordionItem } from '../module-accordion-item';

function module_(overrides: Partial<BoardModule> = {}): BoardModule {
  return {
    id: 10,
    name: 'Preflight Basics',
    slug: 'preflight-basics',
    rank: 1,
    requiredSubscriptions: [],
    sequentialLessons: false,
    dependsOn: [],
    imageUrlAvif: null,
    imageUrlWebp: null,
    learnerCount: 0,
    lessons: [
      { id: 1 } as BoardModule['lessons'][number],
      { id: 2 } as BoardModule['lessons'][number],
      { id: 3 } as BoardModule['lessons'][number],
      { id: 4 } as BoardModule['lessons'][number],
    ],
    ...overrides,
  } as BoardModule;
}

/** Renders inside an open `Accordion.Root` so the panel content is present. */
function renderOpen(
  mod: BoardModule,
  props: Partial<ComponentProps<typeof ModuleAccordionItem>> = {},
) {
  return render(
    <Accordion.Root defaultValue={[mod.id]}>
      <ModuleAccordionItem module={mod} lessonsSlot={null} {...props} />
    </Accordion.Root>,
  );
}

describe('ModuleAccordionItem', () => {
  it('shows the module name and its lesson count in the trigger', () => {
    // Mutant: the lesson-count span is dropped from the trigger (only the
    // name renders). This assertion fails against that mutant because
    // `within(trigger).getByText('4 lessons')` would throw.
    renderOpen(module_());
    // Exact name, not a substring match: the drag handle's own accessible
    // name ("Reorder module Preflight Basics") also contains "Preflight
    // Basics", so a loose regex would ambiguously match both buttons.
    const trigger = screen.getByRole('button', {
      name: 'Toggle module Preflight Basics, 4 lessons',
    });
    expect(within(trigger).getByText('Preflight Basics')).toBeTruthy();
    expect(within(trigger).getByText('4 lessons')).toBeTruthy();
  });

  it('does not nest the drag handle inside the accordion trigger', () => {
    // Mutant: the drag handle button is moved inside `Accordion.Trigger`
    // (structurally nested) instead of living as its sibling. This
    // assertion fails against that mutant because
    // `within(trigger).queryByLabelText(...)` would then find it.
    renderOpen(module_());
    const trigger = screen.getByRole('button', {
      name: 'Toggle module Preflight Basics, 4 lessons',
    });
    expect(within(trigger).queryByLabelText(/reorder module/i)).toBeNull();
    // Sanity check the handle actually exists elsewhere in the document.
    expect(
      screen.getByLabelText(/reorder module preflight basics/i),
    ).toBeTruthy();
  });

  it('does not nest the action buttons inside the accordion trigger either', () => {
    // The three action buttons carry the IDENTICAL collapse-on-click hazard
    // as the drag handle above: nested inside `Accordion.Trigger`, clicking
    // "Delete module" would also toggle the accordion open/closed. Only the
    // drag handle had a structural (`within(trigger)`) test for this; these
    // were checked only at document level, which would still pass even if a
    // future edit moved them inside the trigger.
    //
    // Mutant: any of `Add lesson` / `Edit module` / `Delete module` moved to
    // be children of `Accordion.Trigger` instead of its siblings. This
    // assertion fails against that mutant because
    // `within(trigger).queryByLabelText(...)` would then find the button.
    const onAddLesson = vi.fn();
    const onEditModule = vi.fn();
    const onDeleteModule = vi.fn();
    renderOpen(module_(), { onAddLesson, onEditModule, onDeleteModule });
    const trigger = screen.getByRole('button', {
      name: 'Toggle module Preflight Basics, 4 lessons',
    });

    expect(within(trigger).queryByLabelText('Add lesson')).toBeNull();
    expect(within(trigger).queryByLabelText('Edit module')).toBeNull();
    expect(within(trigger).queryByLabelText('Delete module')).toBeNull();
    // Sanity check all three actually exist elsewhere in the document.
    expect(screen.getByLabelText('Add lesson')).toBeTruthy();
    expect(screen.getByLabelText('Edit module')).toBeTruthy();
    expect(screen.getByLabelText('Delete module')).toBeTruthy();
  });

  it('renders the lessonsSlot inside the panel', () => {
    // Mutant: `lessonsSlot` is dropped from the panel's JSX (e.g. the panel
    // renders a static "No lessons" placeholder instead of the prop). This
    // assertion fails against that mutant because the slot's own content
    // would never appear.
    renderOpen(module_(), {
      lessonsSlot: <span>Crosswind landings sortable list</span>,
    });
    expect(screen.getByText('Crosswind landings sortable list')).toBeTruthy();
  });

  it('renders each action button only when its callback is supplied', () => {
    // Mutant: `onDeleteModule &&` guard is dropped, so the delete button
    // always renders regardless of whether a handler was passed. This
    // assertion fails against that mutant because
    // `queryByLabelText('Delete module')` would then resolve to an element.
    const onAddLesson = vi.fn();
    const onEditModule = vi.fn();
    renderOpen(module_(), { onAddLesson, onEditModule });

    expect(screen.getByLabelText('Add lesson')).toBeTruthy();
    expect(screen.getByLabelText('Edit module')).toBeTruthy();
    expect(screen.queryByLabelText('Delete module')).toBeNull();
  });
});
