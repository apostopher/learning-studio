// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
// The level write is the consumer of a chip press: recorded, its arguments
// asserted, and each call settled by hand.
const levelWrite = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  reset: vi.fn(),
  isPending: false,
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
  actorIsOwner = false,
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
          actorIsOwner={actorIsOwner}
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
  return {
    store,
    pinA,
    previewA,
    rerender,
    outsideClick,
    unmount: view.unmount,
  };
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
  /** Every write's settle handles, in call order. */
  let writes: { resolve: () => void; reject: (error: Error) => void }[] = [];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    directory.users = [adaInDirectory];
    writes = [];
    levelWrite.mutateAsync.mockReset();
    levelWrite.mutateAsync.mockImplementation(
      () =>
        new Promise<void>((resolve, reject) => {
          writes.push({ resolve, reject });
        }),
    );
    levelWrite.reset.mockClear();
    toast.success.mockReset();
    toast.error.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const adaChip = () =>
    screen.getByRole('button', { name: /^Level for Ada Lovelace/ });
  const press = () => fireEvent.click(adaChip());
  const settleDebounce = () => act(() => vi.advanceTimersByTime(700));
  const message = (label: string) =>
    `Your training team set your level in Instrument Ground School to ${label}.`;

  it('a press advances the chip at once, and writes nothing yet', () => {
    const { pinA } = renderPopover([withAda], true);
    pinA();
    expect(adaChip().textContent).toBe('INTER');

    press();
    expect(adaChip().textContent).toBe('EXPERT');
    expect(adaChip().getAttribute('aria-label')).toBe(
      'Level for Ada Lovelace: Advanced. Press to change.',
    );
    press();
    expect(adaChip().textContent).toBe('BASIC');

    expect(levelWrite.mutateAsync).not.toHaveBeenCalled();
    // No confirm dialog any more: the press is the whole gesture.
    expect(screen.queryByRole('dialog', { name: /Set level/ })).toBeNull();
  });

  it('saves only where the admin stops, ~700ms after the last press, with the generated message', () => {
    const { pinA } = renderPopover([withAda], true);
    pinA();
    press(); // advanced
    act(() => vi.advanceTimersByTime(500));
    press(); // basic — restarts the wait
    act(() => vi.advanceTimersByTime(699));
    expect(levelWrite.mutateAsync).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));

    expect(levelWrite.mutateAsync).toHaveBeenCalledTimes(1);
    expect(levelWrite.mutateAsync.mock.calls[0][0]).toEqual({
      profileId: 42,
      courseId: 3,
      level: 'basic',
      message: message('Basic'),
    });
  });

  it('marks the row saving while the write is in flight, and keeps the chip pressable', async () => {
    const { pinA } = renderPopover([withAda], true);
    pinA();
    press();
    settleDebounce();
    expect(adaChip().getAttribute('aria-busy')).toBe('true');

    press();
    expect(adaChip().textContent).toBe('BASIC');
    expect(adaChip().getAttribute('aria-busy')).toBe('true');
  });

  it('sends one write per row at a time: a newer choice waits for the one in flight', async () => {
    const { pinA } = renderPopover([withAda], true);
    pinA();
    press(); // advanced
    settleDebounce();
    press(); // basic
    settleDebounce();
    // Not a second, racing PUT: it waits for the first to settle…
    expect(levelWrite.mutateAsync).toHaveBeenCalledTimes(1);

    await act(async () => writes[0].resolve());
    // …then goes. So a later save can never land before an earlier one.
    expect(levelWrite.mutateAsync).toHaveBeenCalledTimes(2);
    expect(levelWrite.mutateAsync.mock.calls[1][0]).toEqual({
      profileId: 42,
      courseId: 3,
      level: 'basic',
      message: message('Basic'),
    });
    // The first save landing does not throw away the newer choice.
    expect(adaChip().textContent).toBe('BASIC');
    expect(adaChip().getAttribute('aria-busy')).toBe('true');

    await act(async () => writes[1].resolve());
    expect(adaChip().getAttribute('aria-busy')).toBeNull();
    expect(adaChip().textContent).toBe('BASIC');
  });

  it('presses during a flight make exactly one follow-up save, at the final level', async () => {
    const { pinA } = renderPopover([withAda], true);
    pinA();
    press(); // advanced
    settleDebounce();
    press(); // basic
    settleDebounce();
    press(); // intermediate
    settleDebounce();
    expect(levelWrite.mutateAsync).toHaveBeenCalledTimes(1);

    await act(async () => writes[0].resolve());
    await act(async () => writes[1]?.resolve());

    expect(levelWrite.mutateAsync).toHaveBeenCalledTimes(2);
    expect(levelWrite.mutateAsync.mock.calls[1][0]).toMatchObject({
      level: 'intermediate',
      message: message('Intermediate'),
    });
    expect(toast.success).toHaveBeenCalledTimes(2);
  });

  it('sends no follow-up when the presses came back round to what was just saved', async () => {
    const { pinA } = renderPopover([withAda], true);
    pinA();
    press(); // advanced
    settleDebounce();
    press(); // basic
    press(); // intermediate
    press(); // advanced
    settleDebounce();

    await act(async () => writes[0].resolve());

    expect(levelWrite.mutateAsync).toHaveBeenCalledTimes(1);
    expect(adaChip().textContent).toBe('EXPERT');
    expect(adaChip().getAttribute('aria-busy')).toBeNull();
  });

  it('a success then a failure reverts the chip to the last level saved', async () => {
    const { pinA } = renderPopover([withAda], true);
    pinA();
    press(); // advanced
    settleDebounce();
    press(); // basic
    settleDebounce();
    await act(async () => writes[0].resolve());
    await act(async () =>
      writes[1].reject(new Error('That person or course no longer exists.')),
    );

    expect(toast.error).toHaveBeenCalledWith(
      'That person or course no longer exists.',
    );
    expect(adaChip().textContent).toBe('EXPERT');
    expect(adaChip().getAttribute('aria-busy')).toBeNull();
  });

  it('a throw while handling a success still settles the row, and later saves go out', async () => {
    const { pinA } = renderPopover([withAda], true);
    pinA();
    press(); // advanced
    settleDebounce();
    toast.success.mockImplementationOnce(() => {
      throw new Error('toast blew up');
    });
    await act(async () => writes[0].resolve());

    expect(adaChip().getAttribute('aria-busy')).toBeNull();
    press();
    settleDebounce();
    expect(levelWrite.mutateAsync).toHaveBeenCalledTimes(2);
  });

  it('writes nothing when the presses come back round to the saved level', async () => {
    const { pinA } = renderPopover([withAda], true);
    pinA();
    // Round from the row's own level, before the debounce.
    press(); // advanced
    press(); // basic
    press(); // intermediate
    settleDebounce();
    expect(levelWrite.mutateAsync).not.toHaveBeenCalled();
    expect(adaChip().textContent).toBe('INTER');

    // And round again after a save has landed.
    press(); // advanced
    settleDebounce();
    await act(async () => writes[0].resolve());
    press(); // basic
    press(); // intermediate
    press(); // advanced
    settleDebounce();
    expect(levelWrite.mutateAsync).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(adaChip().textContent).toBe('EXPERT');
  });

  it('leaving the page with a save still waiting writes it at once', () => {
    const { pinA, unmount } = renderPopover([withAda], true);
    pinA();
    press();
    unmount();

    expect(levelWrite.mutateAsync).toHaveBeenCalledTimes(1);
    expect(levelWrite.mutateAsync.mock.calls[0][0]).toEqual({
      profileId: 42,
      courseId: 3,
      level: 'advanced',
      message: message('Advanced'),
    });
    settleDebounce();
    expect(levelWrite.mutateAsync).toHaveBeenCalledTimes(1);
  });

  it('one person on two offerings of one course is one level: one queue, one save', () => {
    const offeringB: Offering = {
      ...offeringA,
      id: 8,
      startsOn: '2027-01-04',
      endsOn: '2027-02-17',
      users: [ada],
    };
    const { pinA, store } = renderPopover([withAda, offeringB], true);
    pinA();
    press(); // advanced, chosen on A
    // Straight to B through the store, so nothing flushes A's pending save.
    act(() => {
      store.set(dispatchOfferingPopoverAtom, { type: 'close' });
    });
    act(() => {
      store.set(dispatchOfferingPopoverAtom, {
        type: 'pin',
        target: { mode: 'edit', offeringId: offeringB.id },
      });
    });
    expect(store.get(offeringPopoverAtom)).toMatchObject({
      status: 'pinned',
      target: { offeringId: offeringB.id },
    });
    // B shows the same course's pending level, and steps on from it.
    expect(adaChip().textContent).toBe('EXPERT');
    press(); // basic
    settleDebounce();

    expect(levelWrite.mutateAsync).toHaveBeenCalledTimes(1);
    expect(levelWrite.mutateAsync.mock.calls[0][0]).toMatchObject({
      profileId: 42,
      courseId: 3,
      level: 'basic',
    });
  });

  it('on success: toasts, and the row holds the saved level without dirtying the offering', async () => {
    const { pinA } = renderPopover([withAda], true);
    pinA();
    press();
    settleDebounce();
    await act(async () => writes[0].resolve());

    expect(toast.success).toHaveBeenCalledWith(
      'Ada Lovelace is now Advanced in Instrument Ground School',
    );
    expect(adaChip().textContent).toBe('EXPERT');
    expect(adaChip().getAttribute('aria-busy')).toBeNull();
    // A level already saved is not an unsaved edit: Esc closes cleanly.
    pressEscape();
    expect(screen.queryByRole('button', { name: 'Keep editing' })).toBeNull();
  });

  it('on failure: toasts the reason and reverts the chip to the saved level', async () => {
    const { pinA } = renderPopover([withAda], true);
    pinA();
    press();
    settleDebounce();
    await act(async () =>
      writes[0].reject(
        new Error(
          'Only an owner can change the level of someone with a staff role.',
        ),
      ),
    );

    expect(toast.error).toHaveBeenCalledWith(
      'Only an owner can change the level of someone with a staff role.',
    );
    expect(adaChip().textContent).toBe('INTER');
    expect(adaChip().getAttribute('aria-busy')).toBeNull();
  });

  it('closing with a save still waiting writes it at once, for that course', async () => {
    const { pinA, store } = renderPopover([withAda], true);
    pinA();
    press();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(store.get(offeringPopoverAtom).status).toBe('closed');

    expect(levelWrite.mutateAsync).toHaveBeenCalledTimes(1);
    expect(levelWrite.mutateAsync.mock.calls[0][0]).toEqual({
      profileId: 42,
      courseId: 3,
      level: 'advanced',
      message: message('Advanced'),
    });
    await act(async () => writes[0].resolve());
    expect(toast.success).toHaveBeenCalledWith(
      'Ada Lovelace is now Advanced in Instrument Ground School',
    );
    // And nothing fires a second time when the old debounce would have.
    settleDebounce();
    expect(levelWrite.mutateAsync).toHaveBeenCalledTimes(1);
  });

  it('a save for a roster the popover moved away from does not patch the roster now showing', async () => {
    // Another course: the same person, but a different level to keep.
    const offeringB: Offering = {
      ...offeringA,
      id: 8,
      courseId: 5,
      courseName: 'Multi-Crew Cooperation',
      startsOn: '2027-01-04',
      endsOn: '2027-02-17',
      users: [ada],
    };
    const { pinA, store } = renderPopover([withAda, offeringB], true);
    pinA();
    press();

    // The popover now shows B, whose roster holds the same person.
    act(() => {
      store.set(dispatchOfferingPopoverAtom, { type: 'close' });
    });
    act(() => {
      store.set(dispatchOfferingPopoverAtom, {
        type: 'pin',
        target: { mode: 'edit', offeringId: offeringB.id },
      });
    });
    // A's pending choice is not dropped, and is not B's to show.
    expect(adaChip().textContent).toBe('INTER');
    settleDebounce();
    expect(levelWrite.mutateAsync).toHaveBeenCalledTimes(1);
    expect(levelWrite.mutateAsync.mock.calls[0][0]).toMatchObject({
      profileId: 42,
      courseId: 3,
      level: 'advanced',
    });
    await act(async () => writes[0].resolve());

    expect(adaChip().textContent).toBe('INTER');
  });

  it('works over a dirty (modal) pin without raising the discard question', () => {
    const { pinA } = renderPopover([withAda], true);
    pinA();
    makeDirty();
    press();
    settleDebounce();

    expect(levelWrite.mutateAsync).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Keep editing' })).toBeNull();
    expect(windowInput().value).toBe('60');
  });

  it('offers no level button without level:update', () => {
    const { pinA } = renderPopover([withAda], false);
    pinA();
    expect(
      screen.queryByRole('button', { name: /^Level for Ada Lovelace/ }),
    ).toBeNull();
    expect(screen.getByText(/Levels are view only/)).toBeTruthy();
  });

  it('offers no level button for someone missing from the directory, and says why', () => {
    directory.users = [];
    const { pinA } = renderPopover([withAda], true);
    pinA();
    expect(
      screen.queryByRole('button', { name: /^Level for Ada Lovelace/ }),
    ).toBeNull();
    expect(screen.getByText('Not in directory')).toBeTruthy();
  });

  it('locks a staff member’s level for a non-owner, and says why', () => {
    directory.users = [{ ...adaInDirectory, roles: ['admin'] }];
    const { pinA } = renderPopover([withAda], true, false);
    pinA();
    expect(
      screen.queryByRole('button', { name: /^Level for Ada Lovelace/ }),
    ).toBeNull();
    expect(screen.getByText('Owner only')).toBeTruthy();
  });

  it('lets an owner change a staff member’s level', () => {
    directory.users = [{ ...adaInDirectory, roles: ['admin'] }];
    const { pinA } = renderPopover([withAda], true, true);
    pinA();
    expect(adaChip()).toBeTruthy();
  });
});
