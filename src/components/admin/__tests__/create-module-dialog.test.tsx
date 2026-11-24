// @vitest-environment jsdom
import { Tooltip } from '@base-ui/react/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { createModuleDialogOpenAtom } from '#/atoms/admin';
import { FLAGSHIP_COURSE_SLUG } from '#/lib/flagship-course';

vi.mock('react', async () => {
  const { createRequire } = await import('node:module');
  const cjs = createRequire(import.meta.url)('react');
  return { ...cjs, default: cjs };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));
vi.mock('../image-upload-field-container', () => ({
  ImageUploadFieldContainer: () => null,
}));

import { CreateModuleDialogContainer } from '../create-module-dialog-container';

function open(slug: string) {
  const store = createStore();
  store.set(createModuleDialogOpenAtom, true);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Provider store={store}>
        <Tooltip.Provider>
          <CreateModuleDialogContainer course={{ id: 7, name: 'ITPS', slug }} />
        </Tooltip.Provider>
      </Provider>
    </QueryClientProvider>,
  );
}

describe("creating a module on one course's board", () => {
  it('says where its lessons come from', () => {
    open('itps');
    expect(
      screen.getByText(
        'Add a module to this course. Then, in the knowledge library, drag lessons into it from Disciplines, in the ITPS column.',
      ),
    ).toBeTruthy();
  });

  it('promises nothing for the flagship, which has no column', () => {
    open(FLAGSHIP_COURSE_SLUG);
    expect(screen.getByText('Add a module to this course.')).toBeTruthy();
  });
});
