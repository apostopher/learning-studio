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
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

import { DocumentsSectionContainer } from '../documents-section-container';

const fetchMock = vi.fn();

const SHARED_DOCS = [
  { sourcePath: 'file-wx.pdf', count: 2, source: 'itps' },
  { sourcePath: 'file-nav.docx', count: 5, source: '3d-airmanship' },
];

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
    if (init?.method === 'DELETE') return { ok: true, json: async () => ({}) };
    return { ok: true, json: async () => ({ docsBySource: SHARED_DOCS }) };
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
  toast.success.mockReset();
  toast.error.mockReset();
  vi.unstubAllGlobals();
});

describe('DocumentsSectionContainer', () => {
  /** The shared docs reach the list: every row the GET returned is drawn. */
  it('lists the shared docs, not one course', async () => {
    renderSection();
    await screen.findByText('file-wx.pdf');
    expect(screen.queryByText('file-nav.docx')).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/api/ai-rag');
  });

  /**
   * A failed load is not "no documents". Mutant this catches: the container
   * dropping the query's error, so the list says "No training documents yet."
   * over a failure and offers no way to retry.
   */
  it('shows a failed load as an error with Retry, not as empty', async () => {
    let failing = true;
    fetchMock.mockImplementation(async () =>
      failing
        ? { ok: false, status: 500, json: async () => ({}) }
        : { ok: true, json: async () => ({ docsBySource: SHARED_DOCS }) },
    );
    renderSection();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/couldn't load training documents/i);
    expect(screen.queryByText(/no training documents yet/i)).toBeNull();

    failing = false;
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    await screen.findByText('file-wx.pdf');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  /** Says what to do when there are none (this tab's copy, not the dialog's). */
  it('says how to add the first document when there are none', async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({ docsBySource: [] }),
    }));
    renderSection();
    await screen.findByText(
      'No training documents yet. Upload a PDF or Word file above.',
    );
  });

  /** Shared docs are deleted with no course in the body. */
  it('deletes a shared doc with no courseId', async () => {
    renderSection();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Delete file-wx.pdf' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));

    const deletes = () =>
      fetchMock.mock.calls
        .filter(
          ([, init]) => (init as RequestInit | undefined)?.method === 'DELETE',
        )
        .map(([, init]) => JSON.parse((init as RequestInit).body as string));
    await waitFor(() => expect(deletes()).toHaveLength(1));
    expect(deletes()[0]).toEqual({ sourcePath: 'file-wx.pdf' });
    expect('courseId' in deletes()[0]).toBe(false);
  });

  /** A failed delete is reported, not swallowed. */
  it('toasts when a delete fails', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === 'DELETE'
        ? { ok: false, status: 500, json: async () => ({}) }
        : { ok: true, json: async () => ({ docsBySource: SHARED_DOCS }) },
    );
    renderSection();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Delete file-wx.pdf' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.error.mock.calls[0][0]).toMatch(/file-wx\.pdf/);
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
