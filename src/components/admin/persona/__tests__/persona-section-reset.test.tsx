// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  editingPersonaIdAtom,
  newPersonaNameAtom,
  pendingDeletePersonaIdAtom,
  personaPaneAtom,
} from '#/atoms/admin';

const { sendBeacon, persona, idle, personasQuery } = vi.hoisted(() => {
  const content = {
    basicInfo: '',
    mission: 'published',
    goal: '',
    communicationStyle: '',
    quotes: [] as string[],
    coreDirective: '',
    howToAnswer: '',
  };
  return {
    sendBeacon: vi.fn(() => true),
    persona: {
      id: 7,
      name: 'Viper7',
      content,
      draftContent: null,
      isPublished: true,
      isOrgDefault: false,
      usedByCourses: [] as string[],
      updatedAt: '2026-11-19T00:00:00.000Z',
    },
    /** What `usePersonas` returns; a test may swap in a failed load. */
    personasQuery: {
      current: null as null | {
        data: unknown;
        isLoading: boolean;
        error: Error | null;
        refetch: () => unknown;
      },
    },
    idle: () => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
      error: null,
    }),
  };
});

// Duplicate-React shim: without it src components get a null hook dispatcher.
vi.mock('react', async () => {
  const { createRequire } = await import('node:module');
  const cjs = createRequire(import.meta.url)('react');
  return { ...cjs, default: cjs };
});
// The real one imports `@/lib/cn`, which vitest can't resolve.
vi.mock('#/components/admin/auto-grow-textarea', () => ({
  AutoGrowTextarea: (props: Record<string, unknown>) => <textarea {...props} />,
}));
vi.mock('#/data-hooks/use-personas', () => ({
  PersonaRequestError: class PersonaRequestError extends Error {},
  sendPersonaDraftBeacon: sendBeacon,
  usePersonas: () =>
    personasQuery.current ?? {
      data: [persona],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    },
  useCreatePersona: idle,
  useDeletePersona: idle,
  useDiscardPersonaDraft: idle,
  usePublishPersona: idle,
  useRenamePersona: idle,
  useSavePersonaDraft: idle,
  useSetOrgDefaultPersona: idle,
}));
vi.mock('#/data-hooks/use-course-persona', () => ({
  useCoursePersona: () => ({ data: undefined }),
  useSetCoursePersona: idle,
}));

import { PersonaSectionContainer } from '../persona-section-container';

afterEach(() => cleanup());

describe('PersonaSectionContainer', () => {
  beforeEach(() => {
    sendBeacon.mockClear();
    personasQuery.current = null;
  });

  it('resets the shared persona UI atoms and still flushes the pending draft first', () => {
    const store = createStore();
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    store.set(personaPaneAtom, 'editor');
    store.set(editingPersonaIdAtom, 7);
    store.set(pendingDeletePersonaIdAtom, 7);
    store.set(newPersonaNameAtom, 'half typed');

    const view = render(
      <QueryClientProvider client={client}>
        <Provider store={store}>
          <PersonaSectionContainer />
        </Provider>
      </QueryClientProvider>,
    );
    const mission = screen
      .getAllByRole('textbox')
      .find(
        (el) => (el as HTMLTextAreaElement).value === 'published',
      ) as HTMLTextAreaElement;
    act(() => {
      fireEvent.change(mission, { target: { value: 'edited, unsaved' } });
    });

    view.unmount();

    // The beacon (draft flush) received the edited content for persona 7...
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [personaId, draft] = sendBeacon.mock.calls[0] as unknown as [
      number,
      { mission: string },
    ];
    expect(personaId).toBe(7);
    expect(draft.mission).toBe('edited, unsaved');
    // The personas refetch is asked for only after the draft went out.
    expect(invalidate.mock.invocationCallOrder[0]).toBeGreaterThan(
      sendBeacon.mock.invocationCallOrder[0] as number,
    );
    // ...and only then were the atoms put back to a fresh list view.
    expect(store.get(personaPaneAtom)).toBe('list');
    expect(store.get(editingPersonaIdAtom)).toBeNull();
    expect(store.get(pendingDeletePersonaIdAtom)).toBeNull();
    expect(store.get(newPersonaNameAtom)).toBe('');
  });

  /**
   * The Chat section reads the same personas query to label "Testing draft /
   * Testing published". Autosave deliberately doesn't invalidate it, so
   * leaving this section must, or the chat keeps a stale label. Mutant this
   * catches: the cleanup dropping the invalidation.
   */
  it('marks the personas query stale on unmount', () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const view = render(
      <QueryClientProvider client={client}>
        <Provider store={createStore()}>
          <PersonaSectionContainer />
        </Provider>
      </QueryClientProvider>,
    );
    expect(invalidate).not.toHaveBeenCalled();

    view.unmount();

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['admin', 'personas'],
    });
  });

  /**
   * In the AI Training tab there is nothing to close and reopen, so a failed
   * load offers Retry, wired to the personas query. Mutant this catches: the
   * dialog's "Close and reopen to retry." copy shown in the tab with no way
   * to act on it.
   */
  it('offers Retry for a failed load in the AI Training tab', () => {
    const refetch = vi.fn();
    personasQuery.current = {
      data: undefined,
      isLoading: false,
      error: new Error('500'),
      refetch,
    };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Provider store={createStore()}>
          <PersonaSectionContainer />
        </Provider>
      </QueryClientProvider>,
    );

    const alert = screen.getByRole('alert');
    expect(alert.textContent).not.toMatch(/close and reopen/i);
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the dialog copy for a failed load in the course dialog', () => {
    personasQuery.current = {
      data: undefined,
      isLoading: false,
      error: new Error('500'),
      refetch: vi.fn(),
    };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Provider store={createStore()}>
          <PersonaSectionContainer course={{ id: 1, name: 'ITPS' }} />
        </Provider>
      </QueryClientProvider>,
    );

    expect(screen.getByRole('alert').textContent).toBe(
      'Could not load personas. Close and reopen to retry.',
    );
  });
});
