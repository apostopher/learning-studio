// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The blob upload is the one collaborator that is not `fetch('/api/ai-rag')`;
// stubbed so the file "lands" at a known URL and the test can follow it into
// the POST body.
const blob = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock('@vercel/blob/client', () => ({ upload: blob.upload }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { DocumentsSectionContainer } from '../documents-section-container';

const fetchMock = vi.fn();

function renderSection() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <Provider store={createStore()}>{children}</Provider>
    </QueryClientProvider>
  );
  return render(<DocumentsSectionContainer />, { wrapper });
}

function attachFile(container: HTMLElement) {
  const input = container.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  const file = new File(['%PDF'], 'wx.pdf', { type: 'application/pdf' });
  fireEvent.change(input, { target: { files: [file] } });
}

/** The POST requests `/api/ai-rag` received, bodies parsed. */
const posts = () =>
  fetchMock.mock.calls
    .filter(
      ([url, init]) =>
        url === '/api/ai-rag' &&
        (init as RequestInit | undefined)?.method === 'POST',
    )
    .map(([, init]) => JSON.parse((init as RequestInit).body as string));

beforeEach(() => {
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      return {
        ok: true,
        json: async () => ({
          success: true,
          sourcePath: 'file-wx.pdf',
          chunks: 2,
        }),
      };
    }
    return { ok: true, json: async () => ({ docsBySource: [] }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  blob.upload.mockResolvedValue({
    url: 'https://blob.vercel-storage.com/training-docs/x.pdf',
  });
});

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  blob.upload.mockReset();
  vi.unstubAllGlobals();
});

describe('DocumentsSectionContainer', () => {
  it('lists the shared docs, not one course', async () => {
    renderSection();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/ai-rag'));
  });

  /**
   * The source the admin picked must reach the server, and no course: these
   * are the shared documents. Mutant this catches: the container still
   * sending `DEFAULT_DOC_SOURCE` (as the course dialog does), or a stray
   * `courseId: null` in the body.
   */
  it('uploads shared docs with the chosen source', async () => {
    const { container } = renderSection();

    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Source' })).getByRole(
        'radio',
        { name: 'ITPS' },
      ),
    );
    attachFile(container);
    fireEvent.click(screen.getByRole('button', { name: /upload document/i }));

    await waitFor(() => expect(posts()).toHaveLength(1));
    const [body] = posts();
    expect(body.source).toBe('itps');
    expect('courseId' in body).toBe(false);
    expect(body).toMatchObject({
      mode: 'file',
      url: 'https://blob.vercel-storage.com/training-docs/x.pdf',
      fileName: 'wx.pdf',
    });
  });

  it('will not upload until a source is chosen', async () => {
    const { container } = renderSection();
    attachFile(container);

    const button = screen.getByRole('button', {
      name: 'Choose a source first',
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);

    // Let any stray submit run its course before asserting nothing was sent.
    await new Promise((r) => setTimeout(r, 0));
    expect(blob.upload).not.toHaveBeenCalled();
    expect(posts()).toHaveLength(0);
  });
});
