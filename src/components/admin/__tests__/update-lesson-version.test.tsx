// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dataKeys } from '#/data-hooks/keys';
import { useEditorBoard } from '#/data-hooks/use-editor-board';
import type { EditorBoardLesson, OrgEditorBoard } from '#/lib/admin-schemas';

/**
 * A version chip, its dialog and the write, over a fake server: real
 * containers, hooks and caches. The requests are the assertion throughout.
 */

// One React for src modules and react-dom: see material-section-container.test.
vi.mock('react', async () => {
  const { createRequire } = await import('node:module');
  const cjs = createRequire(import.meta.url)('react');
  return { ...cjs, default: cjs };
});
vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: undefined,
    isSorting: false,
    isDragging: false,
  }),
}));
vi.mock('../editor-lesson-quickshot-container', () => ({
  EditorLessonQuickshotContainer: () => null,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../../clamped-text', () => ({
  ClampedText: ({ text }: { text: string }) => <span>{text}</span>,
}));
// Tooltip popups need a provider; the names are on the buttons.
vi.mock('../../ui/tooltip-icon-button', () => ({
  TooltipIconButton: ({ label }: { label: string }) => (
    <button type="button" aria-label={label} />
  ),
  IconButtonTooltip: () => null,
  iconButtonClass: () => '',
}));

import { BorrowedLessonList } from '../borrowed-lesson-list';
import { EditorLessonCardContainer } from '../editor-lesson-card-container';
import { UpdateLessonVersionDialogContainer } from '../update-lesson-version-dialog-container';

const LESSON: EditorBoardLesson = {
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
  version: '1.0',
  disciplineVersion: '1.1',
  contentUpdatedAt: new Date(2026, 10, 24, 9, 38),
};
const OWNER = { id: 1, name: 'Owner course' };
const BORROWER = { id: 2, name: 'Borrowing course' };
const STALE = 'Disciplines has changed since you opened this. Try again.';

/** Both courses show lesson 10, the second by borrowing the first's module. */
const server = {
  pins: { 1: '1.0', 2: '1.0' } as Record<number, string>,
  lesson: LESSON,
  posts: [] as { path: string; body: unknown }[],
  /** What the next POST answers, instead of applying it. */
  refuse: null as Response | null,
  hold: null as Promise<void> | null,
  holdBoard: null as Promise<void> | null,
  shown: true,
};

const board = (): OrgEditorBoard =>
  [OWNER, BORROWER].map((course) => ({
    course: {
      ...course,
      slug: `course-${course.id}`,
      description: null,
      imageUrlAvif: null,
      imageUrlWebp: null,
    },
    modules: [
      {
        id: 3,
        name: 'Approaches',
        slug: 'approaches',
        rank: 1,
        requiredSubscriptions: [],
        sequentialLessons: false,
        imageUrlAvif: null,
        imageUrlWebp: null,
        dependsOn: [],
        learnerCount: 0,
        owner: OWNER,
        otherCourseCount: 1,
        lessons: server.shown
          ? [{ ...server.lesson, version: server.pins[course.id] }]
          : [],
      },
    ],
    remixes: [],
  }));

async function handle(path: string, init?: RequestInit): Promise<Response> {
  if (path === '/api/admin/editor') {
    if (server.holdBoard) await server.holdBoard;
    return Response.json(board());
  }
  const course = path.match(/courses\/(\d+)\/lessons\/10\/version$/)?.[1];
  if (init?.method !== 'POST' || !course) throw new Error(`Unexpected ${path}`);
  const body = JSON.parse(init.body as string);
  server.posts.push({ path, body });
  if (server.hold) await server.hold;
  const refusal = server.refuse;
  server.refuse = null;
  if (refusal) return refusal;
  server.pins[Number(course)] = body.toVersion;
  return Response.json({ version: body.toVersion });
}

/** Both courses' cards, as the editor draws them, and the one dialog. */
const Rail = () => {
  const { data } = useEditorBoard();
  return (
    <>
      {data?.map(({ course, modules: [mod] }) => (
        <section key={course.id} aria-label={course.name}>
          {course.id === OWNER.id ? (
            mod.lessons.map((lesson) => (
              <EditorLessonCardContainer
                key={lesson.id}
                lesson={lesson}
                module={mod}
                courseId={course.id}
                courseName={course.name}
              />
            ))
          ) : (
            <BorrowedLessonList course={course} lessons={mod.lessons} />
          )}
        </section>
      ))}
    </>
  );
};

async function open() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <Provider store={createStore()}>
        <Rail />
        <UpdateLessonVersionDialogContainer
          readBoards={() =>
            client.getQueryData<OrgEditorBoard>(dataKeys.editorBoard()) ?? []
          }
        />
      </Provider>
    </QueryClientProvider>,
  );
  await screen.findByRole('region', { name: OWNER.name });
  return client;
}

const chip = (course: string) =>
  within(screen.getByRole('region', { name: course, hidden: true })).getByRole(
    'button',
    { name: /^v\d/, hidden: true },
  );
const dialog = () => screen.queryByRole('alertdialog');
const button = (name: string) => screen.getByRole('button', { name });
const user = userEvent.setup();

beforeEach(() => {
  server.pins = { 1: '1.0', 2: '1.0' };
  server.lesson = LESSON;
  server.posts = [];
  server.refuse = null;
  server.hold = null;
  server.holdBoard = null;
  server.shown = true;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => handle(url, init)),
  );
});
afterEach(() => vi.unstubAllGlobals());

async function openFor(course: string) {
  const client = await open();
  await user.click(chip(course));
  await screen.findByRole('alertdialog');
  return client;
}

describe('a course card in the editor', () => {
  it('has no Edit lesson control: content is edited in Disciplines', async () => {
    await open();
    expect(screen.queryByRole('button', { name: /Edit lesson/ })).toBeNull();
  });
});

describe('the update dialog', () => {
  it('says which lesson, in which course, from what to what, and what it costs', async () => {
    await openFor(OWNER.name);
    expect(
      screen.getByRole('alertdialog', {
        name: 'Do you want to update this lesson?',
      }),
    ).toBeTruthy();
    const text = dialog()?.textContent;
    expect(text).toContain('Crosswind landings in Owner course');
    expect(screen.getByText('v1.0 → v1.1').getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(text).toContain('From v1.0 to v1.1.');
    expect(text).toContain('Last edited 24 Nov 2026, 09:38');
    expect(text).toContain(
      'Learners keep their progress. A debrief they have not passed starts over. You cannot go back to v1.0.',
    );
  });

  it.each([OWNER, BORROWER])('updates $name and no other course', async ({
    id,
    name,
  }) => {
    await openFor(name);
    await user.click(button('Update lesson'));
    await waitFor(() => expect(dialog()).toBeNull());
    expect(server.posts).toEqual([
      {
        path: `/api/admin/courses/${id}/lessons/10/version`,
        body: { toVersion: '1.1' },
      },
    ]);
    const other = id === OWNER.id ? BORROWER.name : OWNER.name;
    expect(chip(name).getAttribute('aria-label')).toBe(
      'v1.1. Up to date with Disciplines',
    );
    expect(chip(other).getAttribute('aria-label')).toBe(
      'v1.0. Disciplines has v1.1. Update this lesson',
    );
  });

  it('opens and confirms from the keyboard', async () => {
    await open();
    chip(OWNER.name).focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('alertdialog');
    expect(server.posts).toEqual([]);
    // Cancel first, so a stray Enter does not update.
    await waitFor(() => expect(document.activeElement).toBe(button('Cancel')));
    await user.tab();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(dialog()).toBeNull());
    expect(server.posts).toHaveLength(1);
  });

  it.each([
    ['Cancel', () => user.click(button('Cancel'))],
    ['Escape', () => user.keyboard('{Escape}')],
  ])('%s posts nothing', async (_name, dismiss) => {
    await openFor(OWNER.name);
    await dismiss();
    await waitFor(() => expect(dialog()).toBeNull());
    expect(server.posts).toEqual([]);
  });

  it('while in flight: says so, cannot be repeated or dismissed, and only its chip waits', async () => {
    let release = () => {};
    await openFor(OWNER.name);
    server.hold = new Promise((resolve) => {
      release = resolve;
    });
    await user.click(button('Update lesson'));
    const confirm = await screen.findByRole('button', { name: 'Updating…' });
    expect(confirm.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(confirm);

    await user.click(confirm);
    await user.click(button('Cancel'));
    await user.keyboard('{Escape}');
    expect(dialog()).not.toBeNull();
    expect(server.posts).toHaveLength(1);

    expect(chip(OWNER.name).getAttribute('aria-label')).toBe(
      'v1.0. Updating to v1.1…',
    );
    expect(chip(OWNER.name).getAttribute('aria-disabled')).toBe('true');
    expect(chip(BORROWER.name).getAttribute('aria-disabled')).toBeNull();

    await act(async () => release());
    await waitFor(() => expect(dialog()).toBeNull());
  });

  it('closes only once the board shows the new version', async () => {
    let release = () => {};
    await openFor(OWNER.name);
    server.holdBoard = new Promise((resolve) => {
      release = resolve;
    });
    await user.click(button('Update lesson'));
    await waitFor(() => expect(server.pins[OWNER.id]).toBe('1.1'));
    await act(() => new Promise((r) => setTimeout(r, 30)));
    expect(button('Updating…')).toBeTruthy();
    await act(async () => release());
    await waitFor(() => expect(dialog()).toBeNull());
    expect(chip(OWNER.name).getAttribute('aria-label')).toContain('Up to date');
  });

  it('a board refetched behind it does not change what is posted', async () => {
    const client = await openFor(OWNER.name);
    server.lesson = { ...LESSON, disciplineVersion: '1.2' };
    await act(async () => {
      await client.invalidateQueries();
    });
    await waitFor(() =>
      expect(chip(OWNER.name).getAttribute('aria-label')).toContain('v1.2'),
    );
    expect(dialog()?.textContent).toContain('From v1.0 to v1.1.');
    await user.click(button('Update lesson'));
    await waitFor(() =>
      expect(server.posts.map((p) => p.body)).toEqual([{ toVersion: '1.1' }]),
    );
  });

  it('stale: stays open with the reason and the new version, which the next confirm asks for', async () => {
    await openFor(OWNER.name);
    server.lesson = {
      ...LESSON,
      disciplineVersion: '1.2',
      contentUpdatedAt: new Date(2026, 10, 25, 10, 5),
    };
    server.refuse = Response.json(
      { error: STALE, code: 'stale' },
      { status: 409 },
    );
    await user.click(button('Update lesson'));
    expect((await screen.findByRole('alert')).textContent).toBe(STALE);
    expect(dialog()?.textContent).toContain('From v1.0 to v1.2.');
    expect(dialog()?.textContent).toContain('Last edited 25 Nov 2026, 10:05');

    await user.click(button('Update lesson'));
    await waitFor(() => expect(dialog()).toBeNull());
    expect(server.posts.map((p) => p.body)).toEqual([
      { toVersion: '1.1' },
      { toVersion: '1.2' },
    ]);
  });

  it('stale, with the course already moved meanwhile: closes, nothing left to ask', async () => {
    await openFor(OWNER.name);
    server.lesson = { ...LESSON, disciplineVersion: '1.2' };
    server.pins[OWNER.id] = '1.2';
    server.refuse = Response.json(
      { error: STALE, code: 'stale' },
      { status: 409 },
    );
    await user.click(button('Update lesson'));
    await waitFor(() => expect(dialog()).toBeNull());
    expect(chip(OWNER.name).getAttribute('aria-label')).toContain('Up to date');
  });

  it('current: closes without an error, on a green chip', async () => {
    await openFor(OWNER.name);
    server.pins[OWNER.id] = '1.1';
    server.refuse = Response.json(
      { error: 'This course already has this version.', code: 'current' },
      { status: 409 },
    );
    await user.click(button('Update lesson'));
    await waitFor(() => expect(dialog()).toBeNull());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(chip(OWNER.name).getAttribute('aria-label')).toContain('Up to date');
  });

  it.each([
    [
      'a caller who may not',
      () => new Response('Forbidden', { status: 403 }),
      'Only someone who can edit this course can update its lessons.',
    ],
    [
      'a lesson that has gone',
      () => Response.json({ error: 'Lesson not found' }, { status: 404 }),
      'Lesson not found',
    ],
    [
      'a failure',
      () => new Response('boom', { status: 500 }),
      'Could not update this lesson. Please try again.',
    ],
    [
      'a 409 it cannot read',
      () => new Response('proxy', { status: 409 }),
      'Could not update this lesson. Please try again.',
    ],
  ])('%s: says why, and can be cancelled', async (_name, refusal, message) => {
    await openFor(OWNER.name);
    server.refuse = refusal();
    await user.click(button('Update lesson'));
    expect((await screen.findByRole('alert')).textContent).toBe(message);
    expect(dialog()?.textContent).toContain('From v1.0 to v1.1.');
    await user.click(button('Cancel'));
    await waitFor(() => expect(dialog()).toBeNull());
  });

  it('an error does not greet the next lesson', async () => {
    await openFor(OWNER.name);
    server.refuse = new Response('Forbidden', { status: 403 });
    await user.click(button('Update lesson'));
    await screen.findByRole('alert');
    await user.click(button('Cancel'));
    await waitFor(() => expect(dialog()).toBeNull());
    await user.click(chip(BORROWER.name));
    await screen.findByRole('alertdialog');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a lesson gone from the board: the 404 refetches it, and the dialog stays to say so', async () => {
    await openFor(OWNER.name);
    server.shown = false;
    server.refuse = Response.json(
      { error: 'Lesson not found' },
      { status: 404 },
    );
    await user.click(button('Update lesson'));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Lesson not found',
    );
    expect(
      within(
        screen.getByRole('region', { name: OWNER.name, hidden: true }),
      ).queryByRole('button', { hidden: true }),
    ).toBeNull();
  });
});
