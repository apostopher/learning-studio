// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  invalidate: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('#/lib/auth-client', () => ({
  authClient: { signOut: mocks.signOut },
}));

// Full stub rather than importOriginal: pulling in the real router module
// drags the generated route tree into this unit test for no benefit.
vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ invalidate: mocks.invalidate }),
  useNavigate: () => mocks.navigate,
}));

import { useSignOut } from '../use-sign-out';

/** Every collaborator appends here, so the ORDER is what gets asserted. */
let order: string[] = [];

const renderSignOut = () => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const clear = vi
    .spyOn(queryClient, 'clear')
    .mockImplementation(() => order.push('clear') as unknown as void);

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return { ...renderHook(() => useSignOut(), { wrapper }), clear };
};

beforeEach(() => {
  order = [];
  vi.clearAllMocks();
  mocks.signOut.mockImplementation(async () => {
    order.push('signOut');
  });
  mocks.invalidate.mockImplementation(async () => {
    order.push('invalidate');
  });
  mocks.navigate.mockImplementation(async () => {
    order.push('navigate');
  });
});

describe('useSignOut', () => {
  it('ends the session before doing anything else', async () => {
    const { result } = renderSignOut();
    result.current.mutate();

    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1));
  });

  /**
   * Regression, and the reason this file exists. The session lives in the
   * ROUTER CONTEXT, resolved once in __root's beforeLoad. `/auth/login` has its
   * own guard — "if context.session, redirect to /app". Navigating before the
   * context has been invalidated therefore bounces the user straight back to
   * the page they just signed out of, and sign-out silently does nothing.
   *
   * Asserting the order is the only thing that catches a reordering: every
   * individual call still happens either way.
   */
  it('invalidates the router context BEFORE navigating to login', async () => {
    const { result } = renderSignOut();
    result.current.mutate();

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalled());

    expect(order).toEqual(['signOut', 'clear', 'invalidate', 'navigate']);
    expect(order.indexOf('invalidate')).toBeLessThan(order.indexOf('navigate'));
  });

  /**
   * Every cached query here is user-scoped. Leaving the cache populated lets
   * the next person to sign in on this browser be served the previous user's
   * courses from cache before their own fetch resolves.
   */
  it('clears the user-scoped query cache', async () => {
    const { result, clear } = renderSignOut();
    result.current.mutate();

    await waitFor(() => expect(clear).toHaveBeenCalledTimes(1));
  });

  it('sends the user to the login screen', async () => {
    const { result } = renderSignOut();
    result.current.mutate();

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1));
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/auth/login',
      search: {},
    });
  });

  /**
   * An ambiguous auth state reads as "signed out": if signOut rejects, the
   * server-side session may or may not be gone, so the cache must NOT be left
   * holding the previous user's data on the assumption they are still valid.
   */
  it('surfaces a failed sign-out instead of pretending it worked', async () => {
    mocks.signOut.mockRejectedValueOnce(new Error('network'));
    const { result } = renderSignOut();
    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
