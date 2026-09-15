// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { createLibraryLessonTargetAtom } from '#/atoms/admin';

vi.mock('../library-lesson-card-container', () => ({
  LibraryLessonCardContainer: () => <div />,
}));
vi.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
}));
vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: undefined,
    isSorting: false,
    isDragging: false,
  }),
  verticalListSortingStrategy: () => null,
}));
vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => undefined } },
}));
// The accordion item is the consumer of the add-lesson callback; stubbed to
// a button so the wiring — not Base UI's accordion — is what is exercised.
vi.mock('../module-accordion-item', () => ({
  ModuleAccordionItem: ({ onAddLesson }: { onAddLesson?: () => void }) => (
    <button type="button" aria-label="Add lesson" onClick={onAddLesson}>
      Add lesson
    </button>
  ),
}));

import { LibraryModuleContainer } from '../library-module-container';

describe('LibraryModuleContainer', () => {
  /**
   * "Add lesson" on a module header opens the create dialog aimed at THIS
   * module, so the lesson is born filed here — never in Untitled to be
   * dragged over afterwards.
   */
  it('aims the create-lesson dialog at this module in this discipline', () => {
    const store = createStore();
    render(
      <Provider store={store}>
        <LibraryModuleContainer
          module={{ id: 12, name: 'Basics', rank: 1, lessons: [] }}
          disciplineId={4}
          disciplineName="Weather"
        />
      </Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add lesson' }));
    expect(store.get(createLibraryLessonTargetAtom)).toEqual({
      id: 4,
      name: 'Weather',
      module: { id: 12, name: 'Basics' },
    });
  });
});
