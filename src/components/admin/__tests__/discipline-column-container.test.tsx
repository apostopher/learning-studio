// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  createLibraryLessonTargetAtom,
  disciplineLevelsTargetAtom,
} from '#/atoms/admin';

const posters = vi.hoisted(() => ({ useDisciplineLessonPosters: vi.fn() }));
vi.mock('#/data-hooks/use-discipline-lesson-posters', () => posters);
vi.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false, active: null }),
}));
vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: ReactNode }) => <>{children}</>,
  verticalListSortingStrategy: () => null,
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
vi.mock('../discipline-column', () => ({
  DisciplineColumn: ({
    actions,
    children,
  }: {
    actions?: ReactNode;
    children: ReactNode;
  }) => (
    <section>
      {actions}
      {children}
    </section>
  ),
}));
vi.mock('../library-module-container', () => ({
  LibraryModuleContainer: () => null,
}));
vi.mock('../library-untitled-container', () => ({
  LibraryUntitledContainer: () => null,
}));

import { DisciplineColumnContainer } from '../discipline-column-container';

describe('DisciplineColumnContainer', () => {
  /**
   * The header's "Add lesson" replaced the one the Untitled heading carried.
   * The create dialog is the consumer and reads this atom: it must be aimed
   * at THIS discipline and no module, so the lesson lands at root level.
   */
  it("aims the create-lesson dialog at this discipline's root level", () => {
    const store = createStore();
    render(
      <Provider store={store}>
        <DisciplineColumnContainer
          disciplineId={4}
          name="Weather"
          discipline={{ slug: 'weather', modules: [], untitled: [] }}
        />
      </Provider>,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Add a lesson to Weather' }),
    );
    expect(store.get(createLibraryLessonTargetAtom)).toEqual({
      id: 4,
      name: 'Weather',
      module: null,
    });
  });

  // The levels board reads this atom to know which discipline to lay out.
  it('opens the levels board on THIS discipline', () => {
    const store = createStore();
    render(
      <Provider store={store}>
        <DisciplineColumnContainer
          disciplineId={4}
          name="3D Airmanship"
          discipline={{ slug: '3d-airmanship', modules: [], untitled: [] }}
        />
      </Provider>,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Update levels in 3D Airmanship' }),
    );
    expect(store.get(disciplineLevelsTargetAtom)).toEqual({
      id: 4,
      name: '3D Airmanship',
    });
  });

  // Levels gate only 3D Airmanship lessons, so tagging any other
  // discipline's would change nothing a pilot sees.
  it('offers no levels board on any other discipline', () => {
    render(
      <Provider store={createStore()}>
        <DisciplineColumnContainer
          disciplineId={7}
          name="UAS"
          discipline={{ slug: 'uas', modules: [], untitled: [] }}
        />
      </Provider>,
    );
    expect(
      screen.queryByRole('button', { name: 'Update levels in UAS' }),
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Add a lesson to UAS' }),
    ).toBeTruthy();
  });

  it("starts loading this shelf's posters as soon as the column renders", () => {
    render(
      <Provider store={createStore()}>
        <DisciplineColumnContainer
          disciplineId={4}
          name="Weather"
          discipline={{ slug: 'weather', modules: [], untitled: [] }}
        />
      </Provider>,
    );
    expect(posters.useDisciplineLessonPosters).toHaveBeenCalledWith(4);
  });
});
