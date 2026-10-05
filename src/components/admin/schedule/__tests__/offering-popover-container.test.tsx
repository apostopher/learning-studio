// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { dispatchOfferingPopoverAtom } from '#/atoms/schedule';
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
vi.mock('#/data-hooks/use-admin-users', () => ({
  useAdminUsers: () => ({ data: { users: [] }, isLoading: false }),
}));

import { OfferingPopoverContainer } from '../offering-popover-container';

const offeringA: Offering = {
  id: 7,
  courseId: 3,
  courseName: 'Instrument Ground School',
  startsOn: '2026-09-23',
  endsOn: '2026-11-06',
  users: [],
};

const renderPopover = () => {
  const store = createStore();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Provider store={store}>
        <OfferingPopoverContainer offerings={[offeringA]} />
      </Provider>
    </QueryClientProvider>,
  );
  const pinA = () =>
    act(() => {
      store.set(dispatchOfferingPopoverAtom, {
        type: 'pin',
        target: { mode: 'edit', offeringId: offeringA.id },
      });
    });
  return { pinA };
};

const startDate = () =>
  (screen.getByLabelText('Start date') as HTMLInputElement).value;

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
