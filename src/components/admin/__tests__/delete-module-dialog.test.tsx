// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteModuleAtom } from '#/atoms/admin';

const mocks = vi.hoisted(() => ({ useDeleteModule: vi.fn() }));
vi.mock('#/data-hooks/use-delete-module', () => ({
  useDeleteModule: mocks.useDeleteModule,
}));

import { DeleteModuleDialogContainer } from '../delete-module-dialog-container';

function renderDialog(target: {
  id: number;
  name: string;
  otherCourseCount: number;
}) {
  const store = createStore();
  store.set(deleteModuleAtom, target);
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <Provider store={store}>{children}</Provider>
    </QueryClientProvider>
  );
  return render(<DeleteModuleDialogContainer courseId={6} />, { wrapper });
}

beforeEach(() => {
  mocks.useDeleteModule.mockReset();
  mocks.useDeleteModule.mockReturnValue({
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isError: false,
  });
});

describe('DeleteModuleDialogContainer', () => {
  it("says how many other courses lose the module, plural, when it's remixed", () => {
    renderDialog({ id: 10, name: 'Weather', otherCourseCount: 2 });

    expect(screen.getByText(/also shown in/)).toBeTruthy();
    expect(screen.getByText('2 other courses')).toBeTruthy();
  });

  it('says nothing extra when no other course teaches the module', () => {
    renderDialog({ id: 10, name: 'Weather', otherCourseCount: 0 });

    expect(screen.queryByText(/also shown in/)).toBeNull();
  });
});
