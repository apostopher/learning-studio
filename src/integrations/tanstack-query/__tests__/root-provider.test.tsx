// @vitest-environment jsdom
import { QueryClient, useQuery } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TanstackQueryProvider from '../root-provider';

describe('TanstackQueryProvider', () => {
  it('serves children from the client it is given, without refetching', async () => {
    // staleTime: Infinity keeps the seeded data fresh so the assertion below
    // isolates the wiring bug under test (two clients vs. one) from
    // TanStack Query's unrelated default of always refetching a query whose
    // staleTime is 0 on mount.
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY } },
    });
    client.setQueryData(['seeded'], 'FROM_SEEDED_CLIENT');
    const queryFn = vi.fn(() => Promise.resolve('FROM_NETWORK'));

    const Child = () => {
      const { data } = useQuery({ queryKey: ['seeded'], queryFn });
      return <p>{data}</p>;
    };

    render(
      <TanstackQueryProvider client={client}>
        <Child />
      </TanstackQueryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('FROM_SEEDED_CLIENT')).toBeDefined();
    });
    expect(queryFn).not.toHaveBeenCalled();
  });
});
