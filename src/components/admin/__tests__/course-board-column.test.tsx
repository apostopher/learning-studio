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

function renderColumn(mod: BoardModule) {
  const store = createStore();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Provider store={store}>
        <DndContext>
          <SortableContext items={[]}>
            <SortableModuleColumn
              courseId={7}
              courseName="ITPS"
              module={mod}
              posters={{}}
            />
          </SortableContext>
        </DndContext>
      </Provider>
    </QueryClientProvider>,
  );
  return store;
}

const BORROWED = { owner: { id: 6, name: '3D Airmanship' } };

describe("a module on one course's board", () => {
  it.each([
    ['its own', {}],
    ['a borrowed', BORROWED],
  ])('%s, empty: no way to add a lesson, and says where they come from', (_n, over) => {
    renderColumn(module_(over));
    expect(screen.queryByRole('button', { name: /add lesson/i })).toBeNull();
    expect(
      screen.getByText(/^No lessons yet\. Drag one .*from Disciplines/),
    ).toBeTruthy();
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
