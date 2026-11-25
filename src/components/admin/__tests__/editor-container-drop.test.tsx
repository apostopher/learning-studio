// @vitest-environment jsdom
import { useDraggable } from '@dnd-kit/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'jotai';
import type { ReactNode, Ref } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// One React for src modules and react-dom: see material-section-container.test.
vi.mock('react', async () => {
  const { createRequire } = await import('node:module');
  const cjs = createRequire(import.meta.url)('react');
  return { ...cjs, default: cjs };
});
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock('#/data-hooks/use-lesson-posters', () => ({
  useLessonPosters: () => ({ data: undefined }),
}));

const { none, pane } = vi.hoisted(() => ({
  none: () => null,
  pane: ({ children }: { children?: unknown }) => children,
}));
vi.mock('../lesson-library', () => ({ LessonLibrary: pane }));
vi.mock('../course-rail', () => ({ CourseRail: pane }));
vi.mock('../editor-pane-splitter', () => ({ EditorPaneSplitter: none }));
// Open, so a module's lesson list is there to drop on.
vi.mock('../module-accordion-item', () => ({
  ModuleAccordionItem: (p: { lessonsSlot: ReactNode }) => (
    <div>{p.lessonsSlot}</div>
  ),
}));
vi.mock('../lesson-card', () => ({ LessonCard: none }));
vi.mock('../editor-lesson-quickshot-container', () => ({
  EditorLessonQuickshotContainer: none,
}));
vi.mock('../course-column-actions', () => ({ CourseColumnActions: none }));
vi.mock('../course-column', () => ({
  CourseColumn: (p: {
    course: { id: number };
    children: ReactNode;
    dropRef?: Ref<HTMLElement>;
  }) => (
    <section ref={p.dropRef} data-rect={`course-${p.course.id}`}>
      {p.children}
    </section>
  ),
}));
const DRAGGABLES = [
  {
    id: 'library-module-2',
    name: 'UAS GENERAL',
    data: { type: 'library-module', moduleId: 2, disciplineId: 1 },
  },
  {
    id: 'library-lesson-90',
    name: 'RPASGEN01',
    data: { type: 'library-lesson', disciplineId: 1, disciplineModuleId: 2 },
  },
  {
    id: 'library-lesson-91',
    name: 'eVTOL Intro',
    data: { type: 'library-lesson', disciplineId: 1, disciplineModuleId: null },
  },
];
const DraggableStub = ({ id, name, data }: (typeof DRAGGABLES)[number]) => {
  const { setNodeRef, listeners } = useDraggable({ id, data });
  return (
    <div ref={setNodeRef} data-rect="dragged">
      <button type="button" {...listeners}>
        Drag {name}
      </button>
    </div>
  );
};
vi.mock('../discipline-column-container', () => ({
  DisciplineColumnContainer: () =>
    DRAGGABLES.map((d) => <DraggableStub key={d.id} {...d} />),
}));
vi.mock('../create-course-dialog-container', () => ({
  CreateCourseDialogContainer: none,
}));
vi.mock('../create-discipline-dialog-container', () => ({
  CreateDisciplineDialogContainer: none,
}));
vi.mock('../create-library-lesson-dialog-container', () => ({
  CreateLibraryLessonDialogContainer: none,
}));
vi.mock('../library-lesson-config-dialog-container', () => ({
  LibraryLessonConfigDialogContainer: none,
}));
vi.mock('../lesson-video-modal-container', () => ({
  LessonVideoModalContainer: none,
}));
vi.mock('../remove-course-module-dialog-container', () => ({
  RemoveCourseModuleDialogContainer: none,
}));
vi.mock('../delete-lesson-dialog-container', () => ({
  DeleteLessonDialogContainer: none,
}));
vi.mock('../editor-create-module-dialog-container', () => ({
  EditorCreateModuleDialogContainer: none,
}));
vi.mock('../edit-course-dialog-container', () => ({
  EditCourseDialogContainer: none,
}));
vi.mock('../delete-course-dialog-container', () => ({
  DeleteCourseDialogContainer: none,
}));
vi.mock('../rename-discipline-dialog-container', () => ({
  RenameDisciplineDialogContainer: none,
}));
vi.mock('../discipline-levels-dialog-container', () => ({
  DisciplineLevelsDialogContainer: none,
}));
vi.mock('../delete-discipline-dialog-container', () => ({
  DeleteDisciplineDialogContainer: none,
}));
vi.mock('../create-discipline-module-dialog-container', () => ({
  CreateDisciplineModuleDialogContainer: none,
}));
vi.mock('../rename-discipline-module-dialog-container', () => ({
  RenameDisciplineModuleDialogContainer: none,
}));
vi.mock('../delete-discipline-module-dialog-container', () => ({
  DeleteDisciplineModuleDialogContainer: none,
}));

import { dataKeys } from '#/data-hooks/keys';
import { EditorContainer } from '../editor-container';

const course = (id: number, moduleId: number, lessons: unknown[] = []) => ({
  course: {
    id,
    name: `Course ${id}`,
    slug: `course-${id}`,
    description: null,
    imageUrlAvif: null,
    imageUrlWebp: null,
  },
  remixes: [],
  modules: [
    {
      id: moduleId,
      name: `Module ${moduleId}`,
      slug: `module-${moduleId}`,
      rank: 1,
      requiredSubscriptions: [],
      sequentialLessons: false,
      imageUrlAvif: null,
      imageUrlWebp: null,
      dependsOn: [],
      learnerCount: 0,
      owner: { id, name: `Course ${id}` },
      otherCourseCount: 0,
      lessons,
    },
  ],
});
const PLACED = {
  id: 200,
  name: 'Placed',
  slug: 'placed',
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
  disciplineVersion: '1.0',
};
const libraryLesson = (id: number, name: string, boxId: number | null) => ({
  id,
  name,
  slug: name,
  version: '1.0',
  courseCount: 0,
  courseIds: [],
  disciplineModuleId: boxId,
  levels: [],
  isConfigured: true,
  isAvailable: true,
  hasDebrief: false,
  needsVideoWatch: false,
  requiredSubscriptions: [],
  videoProvider: null,
});
const LIBRARY = {
  disciplines: [
    {
      id: 1,
      name: 'UAS',
      modules: [
        {
          id: 2,
          name: 'UAS GENERAL',
          rank: 1,
          lessons: [libraryLesson(90, 'RPASGEN01', 2)],
        },
      ],
      untitled: [libraryLesson(91, 'eVTOL Intro', null)],
    },
  ],
  untitled: [],
};

/** The bug report's screen, in CSS px. */
function rectOf(el: Element): DOMRect {
  const key = el.getAttribute('data-rect');
  if (key === 'dragged') return new DOMRect(55, 225, 327, 37);
  if (key === 'course-1') return new DOMRect(539, 124, 327, 630);
  if (key === 'course-2') return new DOMRect(880, 124, 327, 630);
  const column = el.parentElement?.getAttribute('data-rect');
  if (column === 'course-1') return new DOMRect(539, 406, 327, 37);
  // Open, holding one lesson.
  if (column === 'course-2') return new DOMRect(880, 406, 327, 160);
  if (el.parentElement?.parentElement?.parentElement?.dataset.rect)
    return new DOMRect(890, 450, 307, 60);
  if (el.querySelector(':scope > [data-rect^="course-"]'))
    return new DOMRect(525, 55, 1000, 700);
  // The overlay: dnd-kit positions it from the dragged node's rect.
  return new DOMRect(55, 225, 327, 37);
}

const sent: unknown[] = [];

beforeEach(() => {
  sent.length = 0;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: Element) {
      return rectOf(this);
    },
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST')
      sent.push({ url, body: JSON.parse(String(init.body)) });
    return new Response('{}', { status: 500 });
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function drag(name: string, x: number, y: number) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  client.setQueryData(dataKeys.editorBoard(), [
    course(1, 10),
    course(2, 20, [PLACED]),
  ]);
  client.setQueryData(dataKeys.orgLibrary(), LIBRARY);
  render(
    <QueryClientProvider client={client}>
      <Provider>
        <EditorContainer
          capabilities={{
            canCreateDiscipline: false,
            canManageDisciplines: false,
            canCreateCourse: false,
            canEditCourse: false,
            canDeleteCourse: false,
          }}
        />
      </Provider>
    </QueryClientProvider>,
  );
  const settle = () => act(() => new Promise((r) => setTimeout(r, 20)));
  const at = (clientX: number, clientY: number) => ({
    clientX,
    clientY,
    isPrimary: true,
    button: 0,
    bubbles: true,
  });
  const handle = screen.getByRole('button', { name: `Drag ${name}` });
  fireEvent.pointerDown(handle, at(364, 243));
  fireEvent.pointerMove(document, at(380, 250));
  await settle();
  fireEvent.pointerMove(document, at(x - 1, y));
  await settle();
  fireEvent.pointerMove(document, at(x, y));
  await settle();
  fireEvent.pointerUp(document, at(x, y));
  await settle();
}

describe('dropping a library module on a course that already has one', () => {
  it.each([
    ['below its modules', 637, 478, 1, null],
    ['on its module', 637, 425, 1, 10],
    ['at the start of the next course’s module', 900, 425, 2, 20],
    ['below the next course’s modules', 900, 640, 2, null],
  ])('%s adds it there', async (_where, x, y, courseId, afterModuleId) => {
    await drag('UAS GENERAL', x, y);
    expect(sent).toEqual([
      {
        url: `/api/admin/courses/${courseId}/modules/from-library`,
        body: { disciplineModuleId: 2, afterModuleId },
      },
    ]);
  });

  it('released over the library adds nothing', async () => {
    await drag('UAS GENERAL', 300, 640);
    expect(sent).toEqual([]);
  });
});

describe('dropping a library lesson on a course that already has a module', () => {
  it.each([
    ['just below its modules', 637, 450, 1],
    ['below its modules', 637, 478, 1],
    ['far below its modules', 700, 640, 1],
    ['below the next course’s modules, at its start', 885, 640, 2],
    ['in the gap, nearer the next course', 877, 640, 2],
  ])('%s: creates a module for it', async (_where, x, y, courseId) => {
    await drag('RPASGEN01', x, y);
    expect(sent).toEqual([
      {
        url: `/api/admin/courses/${courseId}/modules/from-library`,
        body: { disciplineModuleId: 2, afterModuleId: null, onlyLessonId: 90 },
      },
    ]);
  });

  it('creates one for a lesson that is in no library module', async () => {
    await drag('eVTOL Intro', 637, 478);
    expect(sent).toEqual([
      {
        url: '/api/admin/courses/1/modules/from-library',
        body: {
          disciplineModuleId: null,
          afterModuleId: null,
          onlyLessonId: 91,
        },
      },
    ]);
  });

  it.each([
    ['at its start', 545, 425, 10],
    ['at its end', 860, 425, 10],
    ['the next course’s', 885, 425, 20],
    ['on a lesson in its list', 1000, 480, 20],
    ['in its list, below the last lesson', 1000, 550, 20],
  ])('on a module, %s: joins that module', async (_where, x, y, moduleId) => {
    await drag('RPASGEN01', x, y);
    expect(sent).toEqual([
      { url: `/api/admin/modules/${moduleId}/lessons`, body: { lessonId: 90 } },
    ]);
  });

  it('released over the library adds nothing to a course', async () => {
    await drag('RPASGEN01', 300, 640);
    expect(sent).toEqual([]);
  });
});
