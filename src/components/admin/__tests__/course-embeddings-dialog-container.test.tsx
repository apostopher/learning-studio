// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trainCourseAtom } from '#/atoms/admin';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@vercel/blob/client', () => ({ upload: vi.fn() }));
// Not under test here; the real one pulls in modules vitest can't resolve.
vi.mock('../persona/persona-section-container', () => ({
  PersonaSectionContainer: () => null,
}));

import { CourseEmbeddingsDialogContainer } from '../course-embeddings-dialog-container';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockImplementation(async () => ({
    ok: true,
    json: async () => ({
      docsBySource: [{ sourcePath: 'file-wx.pdf', count: 2, source: 'itps' }],
    }),
  }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('CourseEmbeddingsDialogContainer', () => {
  /**
   * The course dialog stays as it was: its docs all belong to one course, so
   * the training-set chip is the AI Training tab's alone. Mutant this
   * catches: the dialog handing the list each doc's `source`, which draws an
   * "ITPS" chip on every row.
   */
  it('lists the course docs without a source chip', async () => {
    const store = createStore();
    store.set(trainCourseAtom, { id: 4, name: 'UAS' });
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <Provider store={store}>
          <CourseEmbeddingsDialogContainer />
        </Provider>
      </QueryClientProvider>,
    );

    await screen.findByText('file-wx.pdf');
    expect(fetchMock).toHaveBeenCalledWith('/api/ai-rag?courseId=4');
    expect(screen.queryByText('ITPS')).toBeNull();
  });
});
