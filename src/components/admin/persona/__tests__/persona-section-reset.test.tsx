// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  editingPersonaIdAtom,
  newPersonaNameAtom,
  pendingDeletePersonaIdAtom,
  personaPaneAtom,
} from '#/atoms/admin';

const { sendBeacon, persona, idle } = vi.hoisted(() => {
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
  usePersonas: () => ({
    data: [persona],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
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

describe('PersonaSectionContainer unmount', () => {
  beforeEach(() => sendBeacon.mockClear());

  it('resets the shared persona UI atoms and still flushes the pending draft first', () => {
    const store = createStore();
    store.set(personaPaneAtom, 'editor');
    store.set(editingPersonaIdAtom, 7);
    store.set(pendingDeletePersonaIdAtom, 7);
    store.set(newPersonaNameAtom, 'half typed');

    const view = render(
      <Provider store={store}>
        <PersonaSectionContainer />
      </Provider>,
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
    // ...and only then were the atoms put back to a fresh list view.
    expect(store.get(personaPaneAtom)).toBe('list');
    expect(store.get(editingPersonaIdAtom)).toBeNull();
    expect(store.get(pendingDeletePersonaIdAtom)).toBeNull();
    expect(store.get(newPersonaNameAtom)).toBe('');
  });
});
