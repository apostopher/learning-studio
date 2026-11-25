// @vitest-environment jsdom
import { DndContext, useDndContext } from '@dnd-kit/core';
import { act, render, screen } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import type { ReactNode, Ref } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EditorCourseBoard } from '#/lib/admin-schemas';
import { FLAGSHIP_COURSE_SLUG } from '#/lib/flagship-course';

// One React for src modules and react-dom: see material-section-container.test.
vi.mock('react', async () => {
  const { createRequire } = await import('node:module');
  const cjs = createRequire(import.meta.url)('react');
  return { ...cjs, default: cjs };
});
vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: ReactNode }) => children,
  verticalListSortingStrategy: undefined,
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock('#/data-hooks/use-lesson-posters', () => ({
  useLessonPosters: () => ({ data: undefined }),
}));
vi.mock('../../ui/tooltip-icon-button', () => ({
  TooltipIconButton: ({ label }: { label: string }) => (
    <button type="button" aria-label={label} />
  ),
}));
vi.mock('../course-column', () => ({
  CourseColumn: (p: {
    actions: ReactNode;
    note: string | null;
    emptySlot?: ReactNode;
    children: ReactNode;
    dropRef?: Ref<HTMLElement>;
  }) => (
    <section ref={p.dropRef} data-testid="column">
      {p.actions}
      <p>{p.note}</p>
      {p.children}
    </section>
  ),
}));
vi.mock('../editor-course-empty-container', () => ({
  EditorCourseEmptyContainer: () => null,
}));
vi.mock('../editor-module-container', () => ({
  EditorModuleContainer: ({ module: m }: { module: { name: string } }) => (
    <h3>{m.name}</h3>
  ),
}));

import {
  activeDragLibraryLessonIdAtom,
  activeDragLibraryModuleIdAtom,
} from '#/atoms/admin';
import { EditorCourseColumnContainer } from '../editor-course-column-container';

const FLAGSHIP = { id: 6, name: '3D Airmanship', slug: FLAGSHIP_COURSE_SLUG };
const ITPS = { id: 2, name: 'ITPS', slug: 'itps' };
const module_ = (id: number, name: string, owner: typeof ITPS) => ({
  id,
  name,
  slug: name.toLowerCase(),
  rank: id,
  requiredSubscriptions: [],
  sequentialLessons: false,
  imageUrlAvif: null,
  imageUrlWebp: null,
  dependsOn: [],
  learnerCount: 0,
  owner: { id: owner.id, name: owner.name },
  otherCourseCount: 0,
  lessons: [],
});
const WEATHER = module_(10, 'Weather', FLAGSHIP);
const INTRO = module_(20, 'Intro', ITPS);

/** The droppables dnd-kit hands to the editor's collision detection. */
let offered: { id: unknown; node: HTMLElement | null }[] = [];
const Offered = () => {
  offered = useDndContext()
    .droppableContainers.getEnabled()
    .map((c) => ({ id: c.id, node: c.node.current }));
  return null;
};
const store = createStore();

const open = (
  course: typeof ITPS,
  modules: EditorCourseBoard['modules'],
  remixes: EditorCourseBoard['remixes'],
) =>
  render(
    <Provider store={store}>
      <DndContext>
        <Offered />
        <EditorCourseColumnContainer
          courseBoard={{
            course: {
              ...course,
              description: null,
              imageUrlAvif: null,
              imageUrlWebp: null,
            },
            modules,
            remixes,
          }}
          canEditCourse
          canDeleteCourse
          flagship={FLAGSHIP}
        />
      </DndContext>
    </Provider>,
  );
const modules = () =>
  screen.queryAllByRole('heading', { level: 3 }).map((h) => h.textContent);

describe('EditorCourseColumnContainer', () => {
  it('hides the flagship modules in any other column, which can be deleted', () => {
    open(ITPS, [WEATHER, INTRO], []);
    expect(modules()).toEqual(['Intro']);
    expect(screen.getByRole('button', { name: 'Delete ITPS' })).toBeTruthy();
  });

  describe('as a drop target', () => {
    const column = () => [
      { id: 'course-2', node: screen.getByTestId('column') },
    ];
    const dragLibraryModule = (id: number | null) =>
      act(() => store.set(activeDragLibraryModuleIdAtom, id));
    const dragLibraryLesson = (id: number | null) =>
      act(() => store.set(activeDragLibraryLessonIdAtom, id));
    afterEach(() => {
      dragLibraryModule(null);
      dragLibraryLesson(null);
    });

    it('takes a library lesson, whole, once it already has modules', () => {
      open(ITPS, [WEATHER, INTRO], []);
      dragLibraryLesson(7);
      expect(offered).toEqual(column());
    });

    it('takes a library module, whole, once it already has modules', () => {
      open(ITPS, [WEATHER, INTRO], []);
      dragLibraryModule(7);
      expect(offered).toEqual(column());
    });

    it('is no target for any other drag once it has modules', () => {
      open(ITPS, [WEATHER, INTRO], []);
      expect(offered).toEqual([]);
    });

    it('takes every drag while it draws no modules', () => {
      open(ITPS, [WEATHER], []);
      expect(offered).toEqual(column());
    });
  });
});
