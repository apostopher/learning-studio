// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { describe, expect, it, vi } from 'vitest';

// dnd-kit needs a DndContext ancestor; the card's draggable wiring is not what
// this suite is about.
vi.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    isDragging: false,
  }),
}));
// ClampedText measures with hooks that react-compiler nulls under vitest, and
// TooltipIconButton needs a Tooltip.Provider — both stubbed, matching the
// pattern in `module-accordion-item.test.tsx`.
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
vi.mock('../lesson-video-tile', () => ({
  LessonVideoTile: () => <div />,
}));

import { editLibraryLessonIdAtom } from '#/atoms/admin';
import { LibraryLessonCardContainer } from '../library-lesson-card-container';

const LESSON = {
  id: 42,
  name: 'Stalls',
  slug: 'stalls',
  isConfigured: true,
  isAvailable: true,
  courseCount: 2,
};

describe('LibraryLessonCardContainer', () => {
  it('opens the lesson-level editor for THIS lesson', () => {
    // The regression this pins: `LibraryLessonCard` accepted `onEdit` from the
    // day it was written and this container never passed it, so the pencil
    // never rendered and the library had no way to edit a lesson at all.
    // Asserting the atom holds this lesson's id — not merely that a button
    // exists — is what catches a hardcoded or wrong id reaching the modal.
    const store = createStore();
    render(
      <Provider store={store}>
        <LibraryLessonCardContainer lesson={LESSON} disciplineId={7} />
      </Provider>,
    );

    expect(store.get(editLibraryLessonIdAtom)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit lesson' }));
    expect(store.get(editLibraryLessonIdAtom)).toBe(42);
  });
});
