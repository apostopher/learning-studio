// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { levelsBoardModeAtom } from '#/atoms/admin';
import type { LibraryLesson } from '#/lib/admin-schemas';

const lesson = (
  id: number,
  name: string,
  levels: LibraryLesson['levels'],
): LibraryLesson => ({
  id,
  name,
  slug: `l-${id}`,
  isConfigured: false,
  isAvailable: true,
  courseCount: 0,
  courseIds: [],
  videoProvider: null,
  disciplineModuleId: null,
  levels,
  requiredSubscriptions: [],
  hasDebrief: false,
  needsVideoWatch: false,
});

// The mutation is the consumer of what a press decides: recorded, and its
// arguments asserted, rather than the board's own state.
const mutate = vi.hoisted(() => vi.fn());
vi.mock('#/data-hooks/use-set-library-lesson-levels', () => ({
  useSetLibraryLessonLevels: () => ({ mutate }),
}));
vi.mock('#/data-hooks/use-discipline-lesson-posters', () => ({
  useDisciplineLessonPosters: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
  }),
}));
vi.mock('#/data-hooks/use-org-library', () => ({
  useOrgLibrary: () => ({
    isLoading: false,
    data: {
      untitled: [],
      disciplines: [
        {
          id: 4,
          name: 'Weather',
          slug: 'weather',
          untitled: [lesson(30, 'Fog', ['advanced'])],
          modules: [
            {
              id: 1,
              name: 'Basics',
              rank: 0,
              lessons: [
                lesson(10, 'Stalls', []),
                lesson(11, 'Spins', ['basic', 'advanced']),
              ],
            },
          ],
        },
      ],
    },
  }),
}));

import { DisciplineLevelsBoardContainer } from '../discipline-levels-dialog-container';

function renderBoard(mode: 'basic' | 'intermediate' | 'advanced') {
  const store = createStore();
  store.set(levelsBoardModeAtom, mode);
  render(
    <Provider store={store}>
      <DisciplineLevelsBoardContainer disciplineId={4} />
    </Provider>,
  );
}

beforeEach(() => mutate.mockClear());

describe('DisciplineLevelsBoardContainer', () => {
  it("adds the mode's level to a lesson that lacks it", () => {
    renderBoard('basic');
    fireEvent.click(screen.getByRole('button', { name: /Stalls/ }));
    expect(mutate).toHaveBeenCalledWith({ lessonId: 10, levels: ['basic'] });
  });

  it("removes the mode's level from a lesson that has it, keeping the others", () => {
    renderBoard('basic');
    fireEvent.click(screen.getByRole('button', { name: /Spins/ }));
    expect(mutate).toHaveBeenCalledWith({ lessonId: 11, levels: ['advanced'] });
  });

  it('works on a lesson outside every module too', () => {
    renderBoard('intermediate');
    fireEvent.click(screen.getByRole('button', { name: /Fog/ }));
    expect(mutate).toHaveBeenCalledWith({
      lessonId: 30,
      levels: ['advanced', 'intermediate'],
    });
  });
});
