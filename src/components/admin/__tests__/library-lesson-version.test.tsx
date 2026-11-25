// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  editLibraryLessonIdAtom,
  lessonVersionDraftAtomFamily,
  lessonVersionRefusalAtomFamily,
} from '#/atoms/admin';
import { dataKeys } from '#/data-hooks/keys';
import type { LibraryLesson } from '#/lib/admin-schemas';

/**
 * The Disciplines lesson editor and its version, end to end: the real dialog,
 * hooks and caches over a fake server. What the server received is the assertion throughout.
 */

// One React for src modules and react-dom: see material-section-container.test.
vi.mock('react', async () => {
  const { createRequire } = await import('node:module');
  const cjs = createRequire(import.meta.url)('react');
  return { ...cjs, default: cjs };
});

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
vi.mock('../sectioned-config-modal', () => ({
  SectionedConfigModal: (p: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    headerActions?: ReactNode;
    headingSlot?: ReactNode;
    sections: { content: ReactNode }[];
  }) =>
    p.open ? (
      <div role="dialog">
        {/* Each slot keyed by lesson, so each in its own parent. */}
        <div>{p.headerActions}</div>
        <button type="button" onClick={() => p.onOpenChange(false)}>
          Close
        </button>
        <div>{p.headingSlot}</div>
        <div>{p.sections[0].content}</div>
      </div>
    ) : null,
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
// No course is named, so no credentials are asked for (and its module imports
// through `@/`, which vitest cannot resolve).
vi.mock('#/data-hooks/use-course-credentials', () => ({
  useCourseCredentials: () => ({ data: undefined }),
}));
vi.mock('../lesson-config/video-preview', () => ({ VideoPreview: () => null }));
vi.mock('../lesson-config/captions-status-container', () => ({
  CaptionsStatusContainer: () => null,
}));
vi.mock('../lesson-config/credential-flow-container', () => ({
  CredentialFlowContainer: () => null,
}));
vi.mock('../lesson-config/material-upload', () => ({
  MaterialUpload: ({
    onFileSelected,
  }: {
    onFileSelected: (file: File) => void;
  }) => (
    <button
      type="button"
      onClick={() => onFileSelected(new File([], 'a.docx'))}
    >
      Fill form
    </button>
  ),
}));
vi.mock('../lesson-config/rich-text-editor', () => ({
  RichTextEditor: ({
    value,
    onChange,
    ariaLabel,
  }: {
    value: string;
    onChange: (v: string) => void;
    ariaLabel: string;
  }) => (
    <input
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

import { LibraryLessonConfigDialogContainer } from '../library-lesson-config-dialog-container';

const LESSON: LibraryLesson = {
  id: 10,
  name: 'Crosswind landings',
  slug: 'crosswind-landings',
  isAvailable: true,
  isConfigured: true,
  hasDebrief: false,
  needsVideoWatch: false,
  requiredSubscriptions: [],
  levels: [],
  videoProvider: 'mux',
  version: '1.0',
  courseCount: 5,
  courseIds: [],
  disciplineModuleId: null,
};
const MATERIAL = {
  text: 'Saved text',
  keyPoints: [],
  proTips: '',
  quiz: [],
  links: [],
  assignments: '',
  jobOfTheDay: '',
  testThis: [],
};

type Write = { method: string; path: string; body: Record<string, unknown> };
/** The server's lessons by id, what it was sent, and how to hold its answers. */
const server = {
  lessons: new Map<number, LibraryLesson>(),
  material: null as Record<string, unknown> | null,
  alternates: [] as unknown[],
  writes: [] as Write[],
  libraryReads: 0,
  /** Never answers the library again: whatever the page knows is all it has. */
  holdLibrary: false,
  holdWrites: null as Promise<void> | null,
  /** A status every write is answered with, instead of being applied. */
  failWith: null as number | null,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

async function handle(path: string, init?: RequestInit): Promise<Response> {
  const method = init?.method ?? 'GET';
  if (path === '/api/admin/library') {
    server.libraryReads += 1;
    if (server.holdLibrary) return new Promise(() => {});
    return json({ disciplines: [], untitled: [...server.lessons.values()] });
  }
  if (path === '/api/admin/lesson-material/parse') {
    return json({ ...MATERIAL, text: 'From the document' });
  }
  const id = Number(path.match(/lessons\/(\d+)/)?.[1]);
  const lesson = server.lessons.get(id) as LibraryLesson;
  if (method === 'GET') {
    if (path.endsWith('/material'))
      return json({ extraTab: 'jobOfTheDay', material: server.material });
    if (path.endsWith('/video')) return json({ provider: 'mux', ref: 'old' });
    if (path.endsWith('/alternate-videos')) return json(server.alternates);
    throw new Error(`Unexpected read: ${path}`);
  }
  const body = JSON.parse(init?.body as string);
  server.writes.push({ method, path, body });
  if (server.holdWrites) await server.holdWrites;
  if (server.failWith) return json({}, server.failWith);
  server.lessons.set(id, {
    ...lesson,
    version: body.version ?? lesson.version,
  });
  if (path.endsWith('/material')) {
    const { version: _version, ...material } = body;
    server.material = material;
  }
  if (path.endsWith('/alternate-videos')) {
    const { version: _version, ...entry } = body;
    server.alternates = method === 'PUT' ? [...server.alternates, entry] : [];
  }
  if (path.endsWith(`/lessons/${id}`) && body.name) {
    server.lessons.set(id, {
      ...(server.lessons.get(id) as LibraryLesson),
      name: body.name,
    });
  }
  return json({ id });
}

beforeEach(() => {
  server.lessons = new Map();
  server.material = MATERIAL;
  server.alternates = [{ lang: 'fr', provider: 'mux', ref: 'frenchcut' }];
  server.writes = [];
  server.libraryReads = 0;
  server.holdLibrary = false;
  server.holdWrites = null;
  server.failWith = null;
  toast.success.mockClear();
  toast.error.mockClear();
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => handle(url, init)),
  );
});
afterEach(() => vi.unstubAllGlobals());

async function open(
  patch: Partial<LibraryLesson> = {},
  others: LibraryLesson[] = [],
) {
  for (const lesson of [{ ...LESSON, ...patch }, ...others]) {
    server.lessons.set(lesson.id, lesson);
  }
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const store = createStore();
  store.set(editLibraryLessonIdAtom, 10);
  render(
    <QueryClientProvider client={client}>
      <Provider store={store}>
        <LibraryLessonConfigDialogContainer />
      </Provider>
    </QueryClientProvider>,
  );
  await loaded();
  return { client, store };
}

const loaded = async () => {
  await waitFor(() =>
    expect((screen.getByLabelText('Text') as HTMLInputElement).value).toBe(
      server.material?.text ?? '',
    ),
  );
  if (server.lessons.get(10)?.videoProvider) {
    await screen.findByLabelText('Translated video URL or ID');
    await waitFor(() =>
      expect(
        (screen.getByLabelText('Video URL or ID') as HTMLInputElement).value,
      ).toContain('old'),
    );
  }
};

const field = () => screen.getByLabelText('Version') as HTMLInputElement;
const type = (label: string, value: string) =>
  fireEvent.input(screen.getByLabelText(label), { target: { value } });
const typeVersion = (value: string) =>
  fireEvent.change(field(), { target: { value } });
const save = () => screen.getByRole('button', { name: /^Sav(e|ing…)(, |$)/ });
/** The real buttons, so whatever the browser does first happens here too. */
const press = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }));
const pressSave = () => fireEvent.click(save());
const description = () =>
  (field().getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');
const alertText = () =>
  within(field().parentElement as HTMLElement).queryByRole('alert')
    ?.textContent;
const settle = () => act(() => new Promise((r) => setTimeout(r, 20)));

const HINT =
  'Courses keep their own copy. Change the version to flag an update.';
const MALFORMED = 'Use a number like 1.0';

/** The five writes: how each is made, and where the server gets it. */
const WRITES: {
  name: string;
  act: () => void;
  method: string;
  path: string;
  body: Record<string, unknown>;
}[] = [
  {
    name: 'Save',
    act: () => {
      type('Job of the day (URL)', 'https://example.com/job');
      pressSave();
    },
    method: 'POST',
    path: '/api/admin/lessons/10/material',
    body: { jobOfTheDay: 'https://example.com/job' },
  },
  {
    name: 'Replace video',
    act: () => {
      type('Video URL or ID', 'newplayback');
      press('Replace video');
    },
    method: 'PUT',
    path: '/api/admin/lessons/10/video',
    body: { provider: 'mux', ref: 'newplayback' },
  },
  {
    name: 'Add language',
    act: () => {
      type('Translated video URL or ID', 'germancut');
      press('Add language');
    },
    method: 'PUT',
    path: '/api/admin/lessons/10/alternate-videos',
    body: { provider: 'mux', ref: 'germancut' },
  },
  {
    name: 'Remove language',
    act: () =>
      fireEvent.click(screen.getByRole('button', { name: 'Remove French' })),
    method: 'DELETE',
    path: '/api/admin/lessons/10/alternate-videos',
    body: { lang: 'fr' },
  },
  {
    name: 'rename',
    act: () => {
      fireEvent.click(screen.getByRole('button', { name: 'Rename lesson' }));
      type('Lesson name', 'Crosswinds');
      press('Save name');
    },
    method: 'PATCH',
    path: '/api/admin/lessons/10',
    body: { name: 'Crosswinds' },
  },
];

describe('the Version field', () => {
  it('shows the current version and says what changing it does', async () => {
    await open();
    expect(field().value).toBe('1.0');
    expect(document.activeElement).not.toBe(field());
    expect(description()).toBe(HINT);
    expect(field().getAttribute('aria-invalid')).not.toBe('true');
    // Enter in it saves, though it stands outside the form.
    expect(field().form?.id).toBe('lesson-material-form-10');
  });

  it('is there for a lesson with no video', async () => {
    await open({ videoProvider: null });
    expect(screen.queryByText('Other languages')).toBeNull();
    expect(field().value).toBe('1.0');
  });

  it('says a malformed number at the field when it is left', async () => {
    await open();
    typeVersion('v1.1');
    fireEvent.blur(field());
    await waitFor(() => expect(alertText()).toBe('Use a number like 1.0'));
    expect(field().getAttribute('aria-invalid')).toBe('true');
    expect(description()).toBe(`${MALFORMED} ${HINT}`);
    typeVersion('1.1');
    await waitFor(() => expect(alertText()).toBeUndefined());
  });
});

describe.each(WRITES)('$name', (write) => {
  it.each([
    '1.1',
    '0.9',
  ])('a draft of %s is sent with it, then spent', async (draft) => {
    const { client } = await open();
    client.setQueryData(dataKeys.editorBoard(), []);
    client.setQueryData(dataKeys.courseBoard(4), {});
    const reads = server.libraryReads;
    typeVersion(draft);
    write.act();
    await waitFor(() => expect(server.writes).toHaveLength(1));
    expect(server.writes[0].body).toMatchObject({
      ...write.body,
      version: draft,
    });
    await waitFor(() => expect(server.libraryReads).toBeGreaterThan(reads));
    for (const key of [dataKeys.editorBoard(), dataKeys.courseBoard(4)]) {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    }
    await waitFor(() => expect(field().readOnly).toBe(false));
    expect(field().value).toBe(draft);
    await waitFor(() => expect(save().textContent).toBe('Save'));
  });

  it('a malformed draft holds it back: nothing sent, field focused', async () => {
    await open();
    typeVersion('1');
    write.act();
    await waitFor(() => expect(alertText()).toBe(MALFORMED));
    await waitFor(() => expect(document.activeElement).toBe(field()));
    await settle();
    expect(server.writes).toEqual([]);
    expect(field().getAttribute('aria-invalid')).toBe('true');
  });

  it("with draft 1.1: the request carries version '1.1'", async () => {
    await open();
    typeVersion(' 1.1 ');
    write.act();
    await waitFor(() => expect(server.writes).toHaveLength(1));
    const sent = server.writes[0];
    expect([sent.method, sent.path]).toEqual([write.method, write.path]);
    expect(sent.body).toMatchObject({ ...write.body, version: '1.1' });
  });

  it('with the field untouched no version is sent', async () => {
    await open();
    write.act();
    await waitFor(() => expect(server.writes).toHaveLength(1));
    expect(server.writes[0].body).toMatchObject(write.body);
    expect(server.writes[0].body).not.toHaveProperty('version');
  });

  it('the field is read-only while it is in flight', async () => {
    let release = () => {};
    await open();
    server.holdWrites = new Promise((r) => {
      release = r;
    });
    write.act();
    await waitFor(() => expect(field().readOnly).toBe(true));
    await act(async () => release());
    await waitFor(() => expect(field().readOnly).toBe(false));
  });
});

describe('Save', () => {
  it('goes to 1.1 and back to 1.0, with an edit in between', async () => {
    await open();
    const saved = () =>
      waitFor(() =>
        expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy(),
      );
    typeVersion('1.1');
    pressSave();
    await saved();
    WRITES[0].act();
    await waitFor(() => expect(server.writes).toHaveLength(2));
    await saved();
    typeVersion('1.0');
    pressSave();
    await waitFor(() => expect(server.writes).toHaveLength(3));
    await saved();
    expect(server.writes.map((w) => w.body.version)).toEqual([
      '1.1',
      undefined,
      '1.0',
    ]);
    expect(server.lessons.get(10)?.version).toBe('1.0');
    expect(field().value).toBe('1.0');
    expect(alertText()).toBeUndefined();
  });

  it('an emptied field blocks it: the version is required', async () => {
    await open();
    typeVersion('');
    pressSave();
    await waitFor(() => expect(alertText()).toBe('Use a number like 1.0'));
    expect(server.writes).toEqual([]);
  });

  it('with only the version changed sends that alone, and saves no material', async () => {
    // A lesson with none yet: a POST here would create an empty one.
    server.material = null;
    await open();
    typeVersion('1.1');
    expect(
      screen.getByRole('button', { name: 'Save, unsaved changes' }),
    ).toBeTruthy();
    pressSave();
    await waitFor(() => expect(server.writes).toHaveLength(1));
    expect(server.writes).toEqual([
      {
        method: 'PATCH',
        path: '/api/admin/lessons/10',
        body: { version: '1.1' },
      },
    ]);
    await waitFor(() => expect(field().value).toBe('1.1'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy(),
    );
  });

  it('is not lit by retyping the current version, and then sends no version', async () => {
    await open();
    typeVersion('1.1');
    expect(save().getAttribute('aria-label')).toBe('Save, unsaved changes');
    typeVersion('1.0');
    await waitFor(() => expect(save().getAttribute('aria-label')).toBe('Save'));
    pressSave();
    await waitFor(() => expect(server.writes).toHaveLength(1));
    expect(server.writes[0].method).toBe('POST');
    expect(server.writes[0].body).not.toHaveProperty('version');
  });

  it('says Saving… and cannot be pressed again while the version saves', async () => {
    let release = () => {};
    await open();
    server.holdWrites = new Promise((r) => {
      release = r;
    });
    typeVersion('1.1');
    pressSave();
    const saving = await screen.findByRole('button', { name: 'Saving…' });
    expect((saving as HTMLButtonElement).disabled).toBe(true);
    await act(async () => release());
    await screen.findByRole('button', { name: 'Save' });
  });

  it('leaves focus in the Version field while it saves from there', async () => {
    let release = () => {};
    await open();
    server.holdWrites = new Promise((r) => {
      release = r;
    });
    field().focus();
    typeVersion('1.1');
    pressSave();
    await screen.findByRole('button', { name: 'Saving…' });
    await waitFor(() => expect(field().readOnly).toBe(true));
    expect(field().disabled).toBe(false);
    expect(document.activeElement).toBe(field());
    await act(async () => release());
    await screen.findByRole('button', { name: 'Save' });
    expect(document.activeElement).toBe(field());
  });

  it('shows a failed version save by the form', async () => {
    await open();
    typeVersion('1.1');
    server.failWith = 500;
    pressSave();
    expect(
      await screen.findByText('Could not save the version (500)'),
    ).toBeTruthy();
    // Not a version problem: the field is not blamed and the draft is kept.
    expect(alertText()).toBeUndefined();
    expect(field().value).toBe('1.1');
  });

  it('sends typed material with the version even after a refetch reseeded the form', async () => {
    const { client } = await open();
    type('Job of the day (URL)', 'https://example.com/mine');
    // Someone else saves the same lesson; this page refetches it.
    server.material = { ...MATERIAL, proTips: 'Theirs' };
    await act(() =>
      client.invalidateQueries({ queryKey: dataKeys.lessonMaterial(10) }),
    );
    await waitFor(() =>
      expect(
        (screen.getByLabelText('Pro tips') as HTMLInputElement).value,
      ).toBe('Theirs'),
    );
    // react-hook-form recounts after a reseed, a render later.
    await waitFor(() =>
      expect(save().getAttribute('aria-label')).toBe('Save, unsaved changes'),
    );
    typeVersion('1.1');
    pressSave();
    await waitFor(() => expect(server.writes).toHaveLength(1));
    expect(server.writes[0]).toMatchObject({
      method: 'POST',
      body: { jobOfTheDay: 'https://example.com/mine', version: '1.1' },
    });
  });

  it('is clean once the material is saved, so the next version-only Save is one', async () => {
    await open();
    typeVersion('1.1');
    WRITES[0].act();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy(),
    );
    typeVersion('1.2');
    pressSave();
    await waitFor(() => expect(server.writes).toHaveLength(2));
    expect(server.writes[1]).toMatchObject({
      method: 'PATCH',
      body: { version: '1.2' },
    });
  });
});

describe('a link that is not a full web address', () => {
  const NOT_A_URL = 'Enter a full web address, like https://example.com';
  const openWithLink = async (patch: Partial<LibraryLesson> = {}) => {
    server.material = {
      ...MATERIAL,
      links: [
        { name: 'FAA', url: 'www.faa.gov' },
        { name: 'Blank', url: '' },
      ],
    };
    return open(patch);
  };
  const row = (n: number) =>
    screen.getByLabelText(`Link ${n} URL`) as HTMLInputElement;

  it('does not stop a version-only Save', async () => {
    await openWithLink();
    typeVersion('1.1');
    pressSave();
    await waitFor(() =>
      expect(server.writes).toEqual([
        {
          method: 'PATCH',
          path: '/api/admin/lessons/10',
          body: { version: '1.1' },
        },
      ]),
    );
    expect(screen.queryByText(NOT_A_URL)).toBeNull();
  });

  it('refuses a material Save at its row, and the fixed link saves', async () => {
    await openWithLink();
    type('Job of the day (URL)', 'https://example.com/job');
    pressSave();
    const alert = await screen.findByText(NOT_A_URL);
    expect(alert.getAttribute('role')).toBe('alert');
    expect(row(1).getAttribute('aria-invalid')).toBe('true');
    expect(row(1).getAttribute('aria-describedby')).toBe(alert.id);
    expect(document.activeElement).toBe(row(1));
    // A blank row is not wrong.
    expect(row(2).getAttribute('aria-invalid')).toBeNull();
    expect(server.writes).toEqual([]);

    fireEvent.input(row(1), { target: { value: 'https://www.faa.gov' } });
    await waitFor(() => expect(screen.queryByText(NOT_A_URL)).toBeNull());
    pressSave();
    await waitFor(() => expect(server.writes).toHaveLength(1));
    expect(server.writes[0].body.links).toEqual([
      { name: 'FAA', url: 'https://www.faa.gov' },
      { name: 'Blank', url: '' },
    ]);
  });

  it.each([
    'ftp://example.com',
    'javascript:alert(1)',
    'example.com:80',
  ])('refuses %s', async (url) => {
    await openWithLink();
    fireEvent.input(row(1), { target: { value: url } });
    pressSave();
    expect(await screen.findByText(NOT_A_URL)).toBeTruthy();
    expect(server.writes).toEqual([]);
  });

  it('keeps the typed version when the material it goes with is refused', async () => {
    await openWithLink();
    type('Job of the day (URL)', 'https://example.com/job');
    typeVersion('1.1');
    pressSave();
    await screen.findByText(NOT_A_URL);
    expect(field().value).toBe('1.1');
    expect(server.writes).toEqual([]);
  });

  it('is not looked for in a list this lesson does not show', async () => {
    // A Job of the Day lesson still holding TEST THIS! links.
    server.material = {
      ...MATERIAL,
      testThis: [{ name: '', url: 'www.faa.gov' }],
    };
    await open();
    pressSave();
    await waitFor(() => expect(server.writes).toHaveLength(1));
  });
});

describe('several writes sharing one typed version', () => {
  it('Add language then Save: the second sends none, with no library answer in between', async () => {
    await open();
    server.holdLibrary = true;
    type('Job of the day (URL)', 'https://example.com/job');
    typeVersion('1.1');
    WRITES[2].act();
    await waitFor(() => expect(server.writes).toHaveLength(1));
    expect(server.writes[0].body.version).toBe('1.1');
    // The first success already spent the draft.
    await waitFor(() => expect(field().readOnly).toBe(false));
    expect(field().value).toBe('1.1');
    await settle();

    pressSave();
    await waitFor(() => expect(server.writes).toHaveLength(2));
    expect(server.writes[1].body).not.toHaveProperty('version');
    expect(server.writes[1].body.jobOfTheDay).toBe('https://example.com/job');
    await settle();
    expect(alertText()).toBeUndefined();
  });

  it('a library answer sent before the write cannot bring the old version back', async () => {
    const { client } = await open();
    // A read in flight, holding the old state.
    const stale = json({
      disciplines: [],
      untitled: [...server.lessons.values()],
    });
    let answer = () => {};
    const held = new Promise<Response>((r) => {
      answer = () => r(stale);
    });
    vi.mocked(fetch).mockImplementationOnce(() => held);
    void client.invalidateQueries({ queryKey: dataKeys.orgLibrary() });
    await settle();
    server.holdLibrary = true;
    typeVersion('1.1');
    WRITES[2].act();
    await waitFor(() => expect(server.writes).toHaveLength(1));
    await waitFor(() => expect(field().readOnly).toBe(false));
    await act(async () => answer());
    await settle();
    expect(field().value).toBe('1.1');
    expect(save().getAttribute('aria-label')).toBe('Save');
  });

  it('two writes started together both carry it', async () => {
    let release = () => {};
    await open();
    server.holdWrites = new Promise((r) => {
      release = r;
    });
    typeVersion('1.1');
    WRITES[2].act();
    await waitFor(() => expect(server.writes).toHaveLength(1));
    WRITES[0].act();
    await waitFor(() => expect(server.writes).toHaveLength(2));
    await act(async () => release());
    await waitFor(() => expect(field().readOnly).toBe(false));
    expect(server.writes.map((w) => w.body.version)).toEqual(['1.1', '1.1']);
    expect(alertText()).toBeUndefined();
    expect(field().value).toBe('1.1');
  });
});

describe('another SME changes the version meanwhile', () => {
  const change = async (client: QueryClient, version: string) => {
    server.lessons.set(10, { ...LESSON, version });
    await act(() =>
      client.invalidateQueries({ queryKey: dataKeys.orgLibrary() }),
    );
  };

  it('a draft already saved is not left to compete with theirs', async () => {
    const { client } = await open();
    typeVersion('1.1');
    WRITES[2].act();
    await waitFor(() => expect(server.writes).toHaveLength(1));
    await waitFor(() => expect(field().readOnly).toBe(false));
    await change(client, '1.2');
    await waitFor(() => expect(field().value).toBe('1.2'));
    expect(save().getAttribute('aria-label')).toBe('Save');
  });

  it('a draft not saved yet is kept', async () => {
    const { client } = await open();
    typeVersion('2.0');
    await change(client, '1.2');
    await settle();
    expect(field().value).toBe('2.0');
  });
});

describe('a refusal', () => {
  it('goes once the number is right, and does not come back by itself', async () => {
    await open();
    typeVersion('1');
    WRITES[3].act();
    await waitFor(() => expect(alertText()).toBe(MALFORMED));
    typeVersion('1.1');
    await waitFor(() => expect(alertText()).toBeUndefined());
    expect(server.writes).toEqual([]);
  });

  it('takes focus again each time', async () => {
    await open();
    typeVersion('1');
    WRITES[3].act();
    await waitFor(() => expect(document.activeElement).toBe(field()));
    screen.getByLabelText('Pro tips').focus();
    WRITES[3].act();
    await waitFor(() => expect(document.activeElement).toBe(field()));
  });
});

describe('what the version has no part in', () => {
  it('Word-doc fill fills the form and does not touch the version', async () => {
    await open();
    typeVersion('1.1');
    fireEvent.click(screen.getByRole('button', { name: 'Fill form' }));
    await waitFor(() =>
      expect((screen.getByLabelText('Text') as HTMLInputElement).value).toBe(
        'From the document',
      ),
    );
    expect(field().value).toBe('1.1');
    expect(server.writes).toEqual([]);
    pressSave();
    await waitFor(() =>
      expect(server.writes[0]?.body).toMatchObject({
        text: 'From the document',
        version: '1.1',
      }),
    );
  });
});

describe('the draft lives as long as the dialog', () => {
  it('closing the dialog clears the draft and the refusal', async () => {
    const { store } = await open();
    typeVersion('1');
    WRITES[3].act();
    await waitFor(() => expect(alertText()).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    for (const family of [
      lessonVersionDraftAtomFamily,
      lessonVersionRefusalAtomFamily,
    ]) {
      expect([...family.getParams()]).not.toContain(10);
    }
    act(() => store.set(editLibraryLessonIdAtom, 10));
    await loaded();
    expect(field().value).toBe('1.0');
    expect(alertText()).toBeUndefined();
    expect(save().getAttribute('aria-label')).toBe('Save');
    expect(document.activeElement).not.toBe(field());
  });

  it('switching lessons discards it, and it never reaches the other lesson', async () => {
    const { store } = await open({}, [
      { ...LESSON, id: 11, name: 'Stalls', version: '2.0' },
    ]);
    typeVersion('1.1');
    act(() => store.set(editLibraryLessonIdAtom, 11));
    await waitFor(() => expect(field().value).toBe('2.0'));
    expect(save().getAttribute('aria-label')).toBe('Save');
    pressSave();
    await waitFor(() => expect(server.writes).toHaveLength(1));
    expect(server.writes[0].path).toBe('/api/admin/lessons/11/material');
    expect(server.writes[0].body).not.toHaveProperty('version');

    act(() => store.set(editLibraryLessonIdAtom, 10));
    await waitFor(() => expect(field().value).toBe('1.0'));
    expect(save().getAttribute('aria-label')).toBe('Save');
  });
});
