// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dispatchOfferingPopoverAtom,
  offeringPopoverAtom,
} from '#/atoms/schedule';
import type { Offering } from '#/lib/offering-schemas';

/**
 * The container calls React hooks directly; under this repo's Vite pipeline a
 * src module's `react` is a different instance from react-dom's unless it is
 * pointed at the CJS one (see material-section-container.test.tsx).
 */
vi.mock('react', async () => {
  const { createRequire } = await import('node:module');
  const cjs = createRequire(import.meta.url)('react');
  return { ...cjs, default: cjs };
});

const { mutation } = vi.hoisted(() => ({
  mutation: () => ({
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    error: null,
  }),
}));
vi.mock('#/data-hooks/use-offerings', () => ({
  useCreateOffering: mutation,
  useUpdateOffering: mutation,
  useDeleteOffering: mutation,
}));
// The directory the roster resolves profiles from — empty unless a test
// seeds it.
const directory = vi.hoisted(() => ({ users: [] as unknown[] }));
vi.mock('#/data-hooks/use-admin-users', () => ({
  useAdminUsers: () => ({
    data: { users: directory.users, pending: [] },
    isLoading: false,
  }),
}));
// The level write is the consumer of the confirm dialog: recorded, and its
// arguments asserted.
const levelWrite = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  variables: undefined as unknown,
}));
vi.mock('#/data-hooks/use-user-levels', () => ({
  useSetUserCourseLevel: () => levelWrite,
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

import { OfferingPopoverContainer } from '../offering-popover-container';

const offeringA: Offering = {
  id: 7,
  courseId: 3,
  courseName: 'Instrument Ground School',
  startsOn: '2026-09-23',
  endsOn: '2026-11-06',
  users: [],
};

const renderPopover = (
  initial: Offering[] = [offeringA],
  canEditLevels = false,
) => {
  const store = createStore();
  const tree = (offerings: Offering[], isListSettled = true) => (
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <button type="button" onClick={outsideClick}>
          Outside
        </button>
        <OfferingPopoverContainer
          offerings={offerings}
          isListSettled={isListSettled}
          canEditLevels={canEditLevels}
        />
      </Provider>
    </QueryClientProvider>
  );
  const queryClient = new QueryClient();
  const outsideClick = vi.fn();
  const view = render(tree(initial));
  const pinA = () =>
    act(() => {
      store.set(dispatchOfferingPopoverAtom, {
        type: 'pin',
        target: { mode: 'edit', offeringId: offeringA.id },
      });
    });
  const previewA = () =>
    act(() => {
      store.set(dispatchOfferingPopoverAtom, {
        type: 'preview',
        offeringId: offeringA.id,
      });
    });
  const rerender = (offerings: Offering[], isListSettled = true) =>
    view.rerender(tree(offerings, isListSettled));
  return { store, pinA, previewA, rerender, outsideClick };
};

const startDate = () =>
  (screen.getByLabelText('Start date') as HTMLInputElement).value;
const windowInput = () => screen.getByLabelText('Window') as HTMLInputElement;
const nextFrame = () =>
  act(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
/** Edits the Window, which moves Complete by — the form is now dirty. */
const makeDirty = () => {
  fireEvent.change(windowInput(), { target: { value: '60' } });
  expect(windowInput().value).toBe('60');
};
const pressEscape = () =>
  fireEvent.keyDown(screen.getByLabelText('Start date'), { key: 'Escape' });
const popup = () => document.querySelector('.offering-popover');

describe('OfferingPopoverContainer seeding', () => {
  /**
   * Regression: Cancel resets the form to empty, and the old `values: undefined`
   * while closed meant reopening A handed RHF the same `values` object shape it
   * last saw — RHF only resets on a deep change, so the form stayed blank.
   */
  it('re-seeds the same offering after Cancel', async () => {
    const { pinA } = renderPopover();

    pinA();
    expect(startDate()).toBe(offeringA.startsOn);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    pinA();

    expect(startDate()).toBe(offeringA.startsOn);
  });
});

describe('OfferingPopoverContainer discard confirm', () => {
  it('Esc on a dirty pin asks before throwing the edits away', () => {
    const { pinA } = renderPopover();
    pinA();
    makeDirty();

    pressEscape();

    expect(screen.getByRole('button', { name: 'Keep editing' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Discard changes' }),
    ).toBeTruthy();
  });

  it('Keep editing keeps the edit and puts focus back on a real field', async () => {
    const { pinA } = renderPopover();
    pinA();
    makeDirty();
    pressEscape();
    const keep = screen.getByRole('button', { name: 'Keep editing' });
    keep.focus();

    fireEvent.click(keep);
    await nextFrame();

    expect(screen.queryByRole('button', { name: 'Keep editing' })).toBeNull();
    expect(windowInput().value).toBe('60');
    // The confirm unmounted with the focused button; focus must not fall to
    // <body>, where the next keystroke goes nowhere.
    expect(document.activeElement).toBe(screen.getByLabelText('Start date'));
  });

  it('Discard changes closes, and re-pinning shows the saved values', async () => {
    const { pinA } = renderPopover();
    pinA();
    makeDirty();
    pressEscape();

    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    await nextFrame();
    expect(screen.queryByLabelText('Start date')).toBeNull();

    pinA();
    expect(startDate()).toBe(offeringA.startsOn);
    expect(windowInput().value).toBe('45');
  });
});

describe('OfferingPopoverContainer modes', () => {
  it('a preview is inert — out of the tab order and the a11y tree', () => {
    const { previewA } = renderPopover();
    previewA();
    expect(popup()?.hasAttribute('inert')).toBe(true);
  });

  /**
   * Regression: the popover was non-modal even with unsaved edits, so a click
   * outside both raised the discard confirm AND acted on what was clicked —
   * the calendar's arrows blanked the popover, a nav link left it stale.
   */
  it('a dirty pin is modal: the page behind is hidden and a press outside only asks', () => {
    const { pinA } = renderPopover();
    pinA();
    const outside = screen.getByRole('button', {
      name: 'Outside',
      hidden: true,
    });
    expect(outside.closest('[aria-hidden="true"]')).toBeNull();

    makeDirty();

    // Focus is trapped: the page is hidden from assistive tech.
    expect(outside.closest('[aria-hidden="true"]')).not.toBeNull();
    // A backdrop takes the outside press, so nothing behind receives it…
    const backdrop = document.querySelector<HTMLElement>(
      '[role="presentation"][data-base-ui-inert]',
    );
    expect(backdrop).not.toBeNull();
    // …and pressing it still raises the question.
    if (!backdrop) return;
    fireEvent.pointerDown(backdrop, { pointerType: 'mouse', button: 0 });
    fireEvent.mouseDown(backdrop, { button: 0 });
    fireEvent.pointerUp(backdrop, { pointerType: 'mouse', button: 0 });
    fireEvent.mouseUp(backdrop, { button: 0 });
    fireEvent.click(backdrop, { button: 0, detail: 1 });
    expect(screen.getByRole('button', { name: 'Keep editing' })).toBeTruthy();
  });

  it('a clean pin stays non-modal, so another bar can still be clicked', () => {
    const { pinA } = renderPopover();
    pinA();
    expect(
      document.querySelector('[role="presentation"][data-base-ui-inert]'),
    ).toBeNull();
    expect(
      screen
        .getByRole('button', { name: 'Outside' })
        .closest('[aria-hidden="true"]'),
    ).toBeNull();
  });
});

describe('OfferingPopoverContainer unresolved target', () => {
  /**
   * Regression: when the pinned offering left the list (the window moved, or
   * someone else unscheduled it) the popover rendered with a blank title and
   * a Save that silently did nothing.
   */
  it('closes when the pinned offering is no longer in the loaded list', async () => {
    const { store, pinA, rerender } = renderPopover();
    pinA();
    expect(startDate()).toBe(offeringA.startsOn);

    rerender([]);
    await nextFrame();
    await nextFrame();

    expect(screen.queryByLabelText('Start date')).toBeNull();
    expect(store.get(offeringPopoverAtom).status).toBe('closed');
  });

  it('keeps the pin while the list is still loading', async () => {
    const { store, pinA, rerender } = renderPopover();
    pinA();

    rerender([], false);
    await nextFrame();

    expect(store.get(offeringPopoverAtom).status).toBe('pinned');
  });
});

describe('OfferingPopoverContainer Close button', () => {
  it('closes a clean pin', async () => {
    const { store, pinA } = renderPopover();
    pinA();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await nextFrame();
    expect(store.get(offeringPopoverAtom).status).toBe('closed');
  });

  it('asks before closing a dirty pin, like Esc', () => {
    const { pinA } = renderPopover();
    pinA();
    makeDirty();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('button', { name: 'Keep editing' })).toBeTruthy();
    expect(screen.getByLabelText('Window')).toBeTruthy();
  });
});

describe('OfferingPopoverContainer roster levels', () => {
  const ada = {
    userId: 'u-ada',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    level: 'intermediate' as const,
  };
  const withAda: Offering = { ...offeringA, users: [ada] };
  const adaInDirectory = {
    profileId: 42,
    userId: 'u-ada',
    email: 'ada@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
    callSign: null,
    phoneNumber: null,
    roles: [],
    courses: [],
    levels: { 3: 'intermediate' },
    createdAt: '2026-01-01',
  };

  beforeEach(() => {
    directory.users = [adaInDirectory];
    levelWrite.mutate.mockReset();
    levelWrite.isPending = false;
    levelWrite.variables = undefined;
    toast.success.mockReset();
    toast.error.mockReset();
  });

  const adaSelect = () =>
    screen.getByRole('combobox', { name: 'Level for Ada Lovelace' });
  const pick = async (name: string) => {
    fireEvent.click(adaSelect());
    const option = await screen.findByRole('option', { name });
    fireEvent.mouseMove(option);
    fireEvent.click(option);
  };
  const writeMessage = (text: string) =>
    fireEvent.change(screen.getByLabelText(/Message for the pilot/), {
      target: { value: text },
    });

  it('asks for the pilot message before writing anything', async () => {
    const { pinA } = renderPopover([withAda], true);
    pinA();
    await pick('Advanced');

    expect(
      await screen.findByRole('dialog', { name: /Set level to Advanced/ }),
    ).toBeTruthy();
    expect(levelWrite.mutate).not.toHaveBeenCalled();
  });

  it('writes the picked level for that profile, course and message on Save', async () => {
    const { pinA } = renderPopover([withAda], true);
    pinA();
    await pick('Advanced');
    writeMessage('Cleared for advanced ops.');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(levelWrite.mutate).toHaveBeenCalled());
    expect(levelWrite.mutate.mock.calls[0][0]).toEqual({
      profileId: 42,
      courseId: 3,
      level: 'advanced',
      message: 'Cleared for advanced ops.',
      note: undefined,
    });
  });

  it('on success: toasts, shows the new level on the row, and closes the dialog', async () => {
    const { pinA } = renderPopover([withAda], true);
    pinA();
    await pick('Advanced');
    writeMessage('Cleared for advanced ops.');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(levelWrite.mutate).toHaveBeenCalled());

    act(() => levelWrite.mutate.mock.calls[0][1].onSuccess());

    expect(toast.success).toHaveBeenCalledWith(
      'Ada Lovelace is now Advanced in Instrument Ground School',
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /Set level/ })).toBeNull(),
    );
    expect(adaSelect().textContent).toContain('EXPERT');
    // A level already saved is not an unsaved edit of the offering.
    expect(screen.queryByRole('button', { name: 'Keep editing' })).toBeNull();
  });

  it('on failure: toasts the reason and keeps the dialog open', async () => {
    const { pinA } = renderPopover([withAda], true);
    pinA();
    await pick('Advanced');
    writeMessage('Cleared for advanced ops.');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(levelWrite.mutate).toHaveBeenCalled());

    act(() =>
      levelWrite.mutate.mock.calls[0][1].onError(
        new Error('You do not have permission to change levels.'),
      ),
    );

    expect(toast.error).toHaveBeenCalledWith(
      'You do not have permission to change levels.',
    );
    expect(screen.getByRole('dialog', { name: /Set level/ })).toBeTruthy();
  });

  it('Cancel writes nothing, keeps the old level and the popover', async () => {
    const { pinA } = renderPopover([withAda], true);
    pinA();
    await pick('Advanced');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /Set level/ })).toBeNull(),
    );
    expect(levelWrite.mutate).not.toHaveBeenCalled();
    expect(adaSelect().textContent).toContain('INTER');
    expect(screen.getByLabelText('Start date')).toBeTruthy();
  });

  it('works over a dirty (modal) pin without raising the discard question', async () => {
    const { pinA } = renderPopover([withAda], true);
    pinA();
    makeDirty();
    await pick('Advanced');
    writeMessage('Cleared for advanced ops.');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(levelWrite.mutate).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Keep editing' })).toBeNull();
    // The offering edit is untouched underneath.
    expect(windowInput().value).toBe('60');
  });

  it('marks the row being saved busy', () => {
    levelWrite.isPending = true;
    levelWrite.variables = { profileId: 42 };
    const { pinA } = renderPopover([withAda], true);
    pinA();
    expect(adaSelect().getAttribute('aria-busy')).toBe('true');
  });

  it('offers no select without level:update', () => {
    const { pinA } = renderPopover([withAda], false);
    pinA();
    expect(
      screen.queryByRole('combobox', { name: 'Level for Ada Lovelace' }),
    ).toBeNull();
    expect(screen.getByText(/Levels are view only/)).toBeTruthy();
  });

  it('offers no select for someone missing from the directory', () => {
    directory.users = [];
    const { pinA } = renderPopover([withAda], true);
    pinA();
    expect(
      screen.queryByRole('combobox', { name: 'Level for Ada Lovelace' }),
    ).toBeNull();
  });
});
