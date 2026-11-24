// @vitest-environment jsdom
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { updateLessonVersionAtom } from '#/atoms/admin';
import type { BoardModule } from '#/lib/admin-schemas';
import { FLAGSHIP_COURSE_SLUG } from '#/lib/flagship-course';

vi.mock('react', async () => {
  const { createRequire } = await import('node:module');
  const cjs = createRequire(import.meta.url)('react');
  return { ...cjs, default: cjs };
});
vi.mock('../../clamped-text', () => ({
  ClampedText: ({ text }: { text: string }) => <span>{text}</span>,
}));
vi.mock('../../ui/tooltip-icon-button', () => ({
  TooltipIconButton: ({ label }: { label: string }) => (
    <button type="button" aria-label={label} />
  ),
  IconButtonTooltip: () => null,
  iconButtonClass: () => '',
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

import { SortableModuleColumn } from '../sortable-module-column';

const module_ = (over: Partial<BoardModule> = {}): BoardModule => ({
  id: 3,
  name: 'Weather',
  slug: 'weather',
  rank: 1,
  requiredSubscriptions: [],
  sequentialLessons: false,
  imageUrlAvif: null,
  imageUrlWebp: null,
  dependsOn: [],
  learnerCount: 0,
  owner: { id: 7, name: 'ITPS' },
  otherCourseCount: 0,
  lessons: [],
  ...over,
});
const LESSON: BoardModule['lessons'][number] = {
  id: 10,
  name: 'Crosswind landings',
  slug: 'crosswind-landings',
  rank: 1,
  isAvailable: true,
  hasDebrief: false,
  needsVideoWatch: false,
  requiredSubscriptions: [],
  levels: [],
  isConfigured: true,
  quizQuestionCount: 0,
  dependsOn: [],
  videoProvider: 'mux',
  videoRef: 'abc',
  version: '1.0',
  disciplineVersion: '1.1',
  contentUpdatedAt: new Date(0),
};

const ITPS = { id: 7, name: 'ITPS', slug: 'itps' };
const FLAGSHIP = { id: 6, name: '3D Airmanship', slug: FLAGSHIP_COURSE_SLUG };
const BORROWED = { owner: { id: 6, name: '3D Airmanship' } };

function renderColumn(mod: BoardModule, course = ITPS) {
  const store = createStore();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Provider store={store}>
        <DndContext>
          <SortableContext items={[]}>
            <SortableModuleColumn course={course} module={mod} posters={{}} />
          </SortableContext>
        </DndContext>
      </Provider>
    </QueryClientProvider>,
  );
  return store;
}

describe("a module on one course's board", () => {
  const empty = () => screen.getByText(/^No lessons yet\./).textContent;

  it('its own, empty: no way to add a lesson, and says where they come from', () => {
    renderColumn(module_());
    expect(screen.queryByRole('button', { name: /add lesson/i })).toBeNull();
    expect(empty()).toBe(
      'No lessons yet. In the knowledge library, drag one from Disciplines into Weather, in the ITPS column.',
    );
  });

  // The flagship has no column to drag into, and its modules are hidden in
  // every other one.
  it.each([
    ["the flagship's own", BORROWED, FLAGSHIP],
    ['borrowed from it', BORROWED, ITPS],
  ])('%s, empty: promises nothing', (_n, over, course) => {
    renderColumn(module_(over), course);
    expect(screen.queryByRole('button', { name: /add lesson/i })).toBeNull();
    expect(empty()).toBe('No lessons yet.');
  });

  it.each([
    ['its own', {}],
    ['a borrowed', BORROWED],
  ])("%s: the chip updates this course's version", (_n, over) => {
    const store = renderColumn(module_({ ...over, lessons: [LESSON] }));
    fireEvent.click(
      screen.getByRole('button', { name: /Update this lesson$/ }),
    );
    expect(store.get(updateLessonVersionAtom)).toMatchObject({
      courseId: 7,
      courseName: 'ITPS',
      lessonId: 10,
      from: '1.0',
      to: '1.1',
    });
  });

  it("calls its own lesson's settings what they are", () => {
    renderColumn(module_({ lessons: [LESSON] }));
    expect(
      screen.getByRole('button', { name: 'Configure lesson' }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit lesson' })).toBeNull();
  });
});
