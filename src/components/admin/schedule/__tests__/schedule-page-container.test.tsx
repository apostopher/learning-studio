// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { addDays, format } from 'date-fns';
import { createStore, Provider } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  offeringPopoverAnchorAtom,
  offeringPopoverAtom,
  offeringPopoverReturnFocusAtom,
  scheduleWindowStartAtom,
} from '#/atoms/schedule';
import type { Offering } from '#/lib/offering-schemas';

/** Hook-using src components need the CJS react (see the container test). */
vi.mock('react', async () => {
  const { createRequire } = await import('node:module');
  const cjs = createRequire(import.meta.url)('react');
  return { ...cjs, default: cjs };
});

const { mutation, state } = vi.hoisted(() => ({
  mutation: () => ({
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    error: null,
  }),
  state: { offerings: [] as unknown[] },
}));
vi.mock('#/data-hooks/use-offerings', () => ({
  useOfferings: () => ({
    data: state.offerings,
    isLoading: false,
    error: null,
  }),
  useCreateOffering: mutation,
  useUpdateOffering: mutation,
  useDeleteOffering: mutation,
}));
vi.mock('#/data-hooks/use-admin-courses', () => ({
  useAdminCourses: () => ({ data: [], isLoading: false, error: null }),
}));
vi.mock('#/data-hooks/use-admin-users', () => ({
  useAdminUsers: () => ({ data: { users: [] }, isLoading: false }),
}));

import { SchedulePageContainer } from '#/components/admin/schedule/schedule-page-container';

const nextFrame = () =>
  act(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );

const renderPage = () => {
  const store = createStore();
  const windowStart = store.get(scheduleWindowStartAtom);
  const offering: Offering = {
    id: 7,
    courseId: 3,
    courseName: 'Instrument Ground School',
    startsOn: format(addDays(windowStart, 3), 'yyyy-MM-dd'),
    endsOn: format(addDays(windowStart, 5), 'yyyy-MM-dd'),
    users: [],
  };
  state.offerings = [offering];
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Provider store={store}>
        <SchedulePageContainer canSchedule />
      </Provider>
    </QueryClientProvider>,
  );
  const segment = () =>
    screen.getAllByRole('button', { name: /Edit this offering/ })[0];
  return { store, offering, segment };
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('SchedulePageContainer wiring', () => {
  it('a mouse click pins the offering and focuses its Start date', async () => {
    const { store, offering, segment } = renderPage();

    fireEvent.click(segment(), { detail: 1, clientX: 40, clientY: 20 });
    await nextFrame();

    const start = screen.getByLabelText('Start date') as HTMLInputElement;
    expect(start.value).toBe(offering.startsOn);
    expect(document.activeElement).toBe(start);
    // A mouse pin records no segment to return focus to.
    expect(store.get(offeringPopoverReturnFocusAtom)).toBeNull();
  });

  it('a keyboard click pins and records the segment for focus return', async () => {
    const { store, segment } = renderPage();
    const button = segment();

    fireEvent.click(button, { detail: 0 });
    await nextFrame();

    expect(store.get(offeringPopoverAtom).status).toBe('pinned');
    expect(store.get(offeringPopoverReturnFocusAtom)).toBe(button);
  });

  it('an outside press after a keyboard pin does not send focus back to the bar', async () => {
    // Real browsers read `focus({ preventScroll })`; jsdom does not, and Base
    // UI then skips focus return on outside-press by itself — which would let
    // this test pass with the page's clearing removed. Read it, like a browser.
    const realFocus = HTMLElement.prototype.focus;
    const focusSpy = vi
      .spyOn(HTMLElement.prototype, 'focus')
      .mockImplementation(function (this: HTMLElement, options) {
        void options?.preventScroll;
        realFocus.call(this);
      });
    const { store, segment } = renderPage();
    fireEvent.click(segment(), { detail: 0 });
    await nextFrame();
    expect(store.get(offeringPopoverReturnFocusAtom)).toBe(segment());

    // Outside the popover: Base UI reports outside-press from the pointer
    // sequence on the document.
    const outside = screen.getByRole('heading', { name: 'Schedule' });
    fireEvent.pointerDown(outside, { pointerType: 'mouse', button: 0 });
    fireEvent.mouseDown(outside, { button: 0 });
    fireEvent.pointerUp(outside, { pointerType: 'mouse', button: 0 });
    fireEvent.mouseUp(outside, { button: 0 });
    fireEvent.click(outside, { button: 0, detail: 1 });
    await nextFrame();

    expect(store.get(offeringPopoverAtom).status).toBe('closed');
    expect(document.activeElement).not.toBe(segment());
    expect(focusSpy).toHaveBeenCalled();
  });

  it('Escape after a keyboard pin returns focus to the segment it came from', async () => {
    const { store, segment } = renderPage();
    const button = segment();
    fireEvent.click(button, { detail: 0 });
    await nextFrame();
    const start = screen.getByLabelText('Start date');
    expect(document.activeElement).toBe(start);

    fireEvent.keyDown(start, { key: 'Escape' });
    await nextFrame();

    expect(store.get(offeringPopoverAtom).status).toBe('closed');
    expect(document.activeElement).toBe(button);
  });

  /**
   * Regression: in a real browser the segment `finalFocus` refocuses after a
   * keyboard pin matches `:focus-visible` (the last input was a key), so its
   * onFocus used to re-preview the offering the user had just closed. jsdom
   * never matches `:focus-visible`, so pretend it does.
   */
  it('closing a keyboard pin does not re-preview from the focus it returns', async () => {
    const realMatches = Element.prototype.matches;
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      return selector === ':focus-visible'
        ? true
        : realMatches.call(this, selector);
    });
    const { store, segment } = renderPage();
    const button = segment();
    fireEvent.click(button, { detail: 0 });
    await nextFrame();

    fireEvent.keyDown(screen.getByLabelText('Start date'), { key: 'Escape' });
    await nextFrame();
    await act(() => Promise.resolve());

    expect(document.activeElement).toBe(button);
    expect(store.get(offeringPopoverAtom).status).toBe('closed');
    await nextFrame();
    expect(store.get(offeringPopoverAtom).status).toBe('closed');
  });

  it('a mouse resting on a segment previews it at the cursor after 300 ms', () => {
    const { store, segment } = renderPage();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    fireEvent.pointerEnter(segment(), {
      pointerType: 'mouse',
      clientX: 30,
      clientY: 10,
    });
    act(() => vi.advanceTimersByTime(299));
    expect(store.get(offeringPopoverAtom).status).toBe('closed');
    act(() => vi.advanceTimersByTime(1));

    expect(store.get(offeringPopoverAtom)).toEqual({
      status: 'preview',
      offeringId: 7,
    });
    expect(store.get(offeringPopoverAnchorAtom)?.kind).toBe('cursor');
  });

  it('a touch on a segment never previews it', () => {
    const { store, segment } = renderPage();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    fireEvent.pointerEnter(segment(), { pointerType: 'touch' });
    act(() => vi.advanceTimersByTime(1000));

    expect(store.get(offeringPopoverAtom).status).toBe('closed');
    expect(store.get(offeringPopoverAnchorAtom)).toBeNull();
  });
});
