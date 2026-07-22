# Course Training-Documents UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "AI training" icon button to the course toolbar that opens a single-column modal for uploading PDF/Word training docs (→ Vercel Blob → `/api/ai-rag` course-scoped embeddings) and listing/deleting them.

**Architecture:** Presentational Base UI components + a jotai-atom-driven container wiring TanStack Query data-hooks; upload form via react-hook-form + zod; the already-built `/api/ai-rag` endpoint does chunk+embed. The `/api/admin/uploads` blob-token route is extended to accept PDF/DOCX for `training-docs/` keys.

**Tech Stack:** React, TanStack Router/Query, Base UI (`@base-ui/react`), react-hook-form + `@hookform/resolvers/zod`, zod v4, jotai, `@vercel/blob/client`, lucide-react, sonner, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-21-course-training-embeddings-ui-design.md`

## Global Constraints

- **Import alias:** vitest cannot resolve `@/` — only `#/` and relative paths. Therefore: **any source file that a test imports (directly or transitively) must use `#/` for its cross-module imports**, and its tests use `#/`. Relative imports (`./x`) are always fine. A source file with no `@/` cross-module imports (only `./` + npm packages) needs no change. Untested files (e.g. `course-actions-container.tsx`) may keep the sibling `@/` style. Concretely here: the new **container** and its `atoms`/`data-hooks` imports use `#/`; the data-hooks import `./keys` relatively (no `@/`); presentational components import only `./` + packages (no `@/`). (memory: [[vitest-alias-and-env]])
- **Presentational vs container:** presentational components are pure (props in → JSX out), build on Base UI, no data-fetching/atoms. The container reads a jotai atom and wires data-hooks. File names kebab-case; components PascalCase.
- **HOOKLESS PRESENTATIONAL COMPONENTS (hard infra constraint):** this repo's Vite pipeline (react-compiler + TanStack Start under Vitest) NULLS the React hook dispatcher for any of our `src/` components that call a React hook (`useState`/`useRef`/`useEffect`/…) directly when rendered in a test — the render throws `Cannot read properties of null (reading 'useRef')`. See the note atop `src/components/admin/lesson-config/link-popover.tsx`. Therefore **every presentational component in this feature MUST be hookless**: use `<label>`-wrapped inputs (not `useRef`+`.click()`), controlled inputs via props, and Base UI components (`Popover`/`Dialog` — their internal hooks live in node_modules and are fine) for any open/close state. Library-internal hooks are fine; OUR components calling hooks are not. Containers DO use hooks (they run fine in the real app) but are therefore **NOT render-tested** — extract any testable logic into pure exported functions and unit-test those instead.
- **State:** jotai for shared client state, TanStack Query for server state, react-hook-form + zod for the upload form (all in the container, which is not render-tested). No `useState`/`useReducer` for shared state.
- **Colors:** radix gray/red tokens only (`gray-2/6/10/11/12`, `red-9/11`, focus ring `apple-9`) — no hardcoded hex or Tailwind palette classes.
- **CSS:** logical properties / Tailwind logical variants (`ps-*`, `pe-*`, `ms-*`, `text-start`) — no physical `left/right`.
- **DOCX mime (exact):** `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
- **Course scoping:** every `/api/ai-rag` call carries `courseId`; the list shows only that course's docs.
- **Commit discipline:** explicit `git add <paths>` only, never `git add -A`/`.`. Do not stage unrelated working-state (`src/env.ts`, `styles.css`, `brand-colors.*`, `generate-theme-css.*`). Each task's commit lists exact files.
- **No `@testing-library/jest-dom`** — it is NOT installed and NOT in `vitest.setup.ts`. Do NOT import it or use its matchers (`toBeInTheDocument`, `toBeDisabled`, `toBeEnabled`, `toHaveTextContent`, …). Use plain DOM/vitest assertions like the existing tests (`src/components/ui/__tests__/circular-progress.test.tsx`): presence via `screen.getByText/getByRole` (throws if absent) or `expect(screen.queryByText(x)).not.toBeNull()`; absence via `expect(screen.queryByText(x)).toBeNull()`; disabled via `expect((el as HTMLButtonElement).disabled).toBe(true)`; text via `expect(el.textContent).toContain('…')`; attributes via `el.getAttribute(...)`/`el.hasAttribute(...)`.
- **Run one test file:** `pnpm test <path>`. Typecheck: `pnpm exec tsc --noEmit -p tsconfig.json`.

---

### Task 1: Extend `/api/admin/uploads` for training documents

Allow PDF/DOCX at 50 MB for `training-docs/` blob keys; images stay images-only at 8 MB. Extract a pure policy helper so it's unit-testable.

**Files:**
- Modify: `src/routes/api/admin/uploads.ts`
- Test: `src/routes/api/admin/__tests__/uploads-policy.test.ts`

**Interfaces:**
- Produces: `uploadPolicyFor(pathname: string): { allowedContentTypes: string[]; maximumSizeInBytes: number }` (exported from `uploads.ts`).

- [ ] **Step 1: Write the failing test**

Create `src/routes/api/admin/__tests__/uploads-policy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { uploadPolicyFor } from '#/routes/api/admin/uploads';

const DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('uploadPolicyFor', () => {
  it('allows pdf/docx at 50MB for training-docs keys', () => {
    const p = uploadPolicyFor('training-docs/abc.pdf');
    expect(p.allowedContentTypes).toEqual(['application/pdf', DOCX]);
    expect(p.maximumSizeInBytes).toBe(50 * 1024 * 1024);
  });

  it('keeps image-only 8MB policy for other keys', () => {
    const p = uploadPolicyFor('courses/xyz.avif');
    expect(p.allowedContentTypes).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/avif',
    ]);
    expect(p.maximumSizeInBytes).toBe(8 * 1024 * 1024);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/routes/api/admin/__tests__/uploads-policy.test.ts`
Expected: FAIL — `uploadPolicyFor` not exported.

- [ ] **Step 3: Edit `uploads.ts`**

Read the current file first. Replace the top constants and wire the helper into `onBeforeGenerateToken`. The current constants:

```ts
const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
];
const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB
```

Replace them with:

```ts
const IMAGE_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
];
const DOC_CONTENT_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const IMAGE_MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const DOC_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

/** Upload policy (allowed mimes + size cap) selected by the blob key prefix. */
export function uploadPolicyFor(pathname: string): {
  allowedContentTypes: string[];
  maximumSizeInBytes: number;
} {
  if (pathname.startsWith('training-docs/')) {
    return {
      allowedContentTypes: DOC_CONTENT_TYPES,
      maximumSizeInBytes: DOC_MAX_BYTES,
    };
  }
  return {
    allowedContentTypes: IMAGE_CONTENT_TYPES,
    maximumSizeInBytes: IMAGE_MAX_BYTES,
  };
}
```

Then in `onBeforeGenerateToken` (which receives the `pathname`), return the policy fields from `uploadPolicyFor(pathname)` in place of the hardcoded `allowedContentTypes`/`maximumSizeInBytes`. Keep `addRandomSuffix: false` and the existing `requireAdmin` guard unchanged. If the current `onBeforeGenerateToken` signature is `async () => …`, change it to `async (pathname) => { const policy = uploadPolicyFor(pathname); … return { allowedContentTypes: policy.allowedContentTypes, maximumSizeInBytes: policy.maximumSizeInBytes, addRandomSuffix: false, … }; }`. Preserve every other returned field exactly.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/routes/api/admin/__tests__/uploads-policy.test.ts`
Expected: PASS (2 cases).

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -i "uploads.ts" || echo clean`
Expected: `clean`.

- [ ] **Step 6: Commit**

```bash
git add src/routes/api/admin/uploads.ts src/routes/api/admin/__tests__/uploads-policy.test.ts
git commit -m "feat(admin): allow pdf/docx uploads (50MB) for training-docs blobs"
```

---

### Task 2: Data-hooks + query key

Four TanStack hooks + the query key for the `/api/ai-rag` calls.

**Files:**
- Modify: `src/data-hooks/keys.ts`
- Create: `src/data-hooks/use-course-embeddings.ts`
- Create: `src/data-hooks/use-upload-training-doc.ts`
- Create: `src/data-hooks/use-add-embeddings.ts`
- Create: `src/data-hooks/use-delete-embedding.ts`
- Test: `src/data-hooks/__tests__/use-course-embeddings.test.tsx`
- Test: `src/data-hooks/__tests__/use-add-embeddings.test.tsx`

**Interfaces:**
- Produces:
  - `dataKeys.courseEmbeddings(courseId: number)`
  - `useCourseEmbeddings(courseId: number)` → `UseQueryResult<{ sourcePath: string; count: number }[]>`
  - `useUploadTrainingDoc()` → mutation `File → { url: string; fileName: string; mimeType: string }`
  - `useAddEmbeddings(courseId: number)` → mutation `{ url: string; fileName: string; mimeType: string } → { sourcePath: string; chunks: number }`
  - `useDeleteEmbedding(courseId: number)` → mutation `{ sourcePath: string } → void`

- [ ] **Step 1: Add the query key**

In `src/data-hooks/keys.ts`, add inside `dataKeys`:

```ts
  courseEmbeddings: (courseId: number) =>
    ['admin', 'course-embeddings', courseId] as const,
```

- [ ] **Step 2: Write the failing tests**

Create `src/data-hooks/__tests__/use-course-embeddings.test.tsx`:

```tsx
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCourseEmbeddings } from '#/data-hooks/use-course-embeddings';

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('useCourseEmbeddings', () => {
  it('fetches the course-scoped list and returns docsBySource', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        docsBySource: [{ sourcePath: 'file-a.pdf', count: 12 }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useCourseEmbeddings(7), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith('/api/ai-rag?courseId=7');
    expect(result.current.data).toEqual([
      { sourcePath: 'file-a.pdf', count: 12 },
    ]);
  });
});
```

Create `src/data-hooks/__tests__/use-add-embeddings.test.tsx`:

```tsx
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAddEmbeddings } from '#/data-hooks/use-add-embeddings';

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('useAddEmbeddings', () => {
  it('posts file-mode payload with courseId and returns result', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, sourcePath: 'file-x.pdf', chunks: 9 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAddEmbeddings(3), {
      wrapper: wrapper(),
    });
    result.current.mutate({
      url: 'https://blob.vercel-storage.com/training-docs/x.pdf',
      fileName: 'x.pdf',
      mimeType: 'application/pdf',
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [, init] = fetchMock.mock.calls[0];
    expect(fetchMock.mock.calls[0][0]).toBe('/api/ai-rag');
    expect(JSON.parse(init.body)).toEqual({
      mode: 'file',
      courseId: 3,
      url: 'https://blob.vercel-storage.com/training-docs/x.pdf',
      fileName: 'x.pdf',
      mimeType: 'application/pdf',
    });
    expect(result.current.data).toEqual({ sourcePath: 'file-x.pdf', chunks: 9 });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test src/data-hooks/__tests__/use-course-embeddings.test.tsx src/data-hooks/__tests__/use-add-embeddings.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 4: Create the hooks**

`src/data-hooks/use-course-embeddings.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { dataKeys } from './keys';

const responseSchema = z.object({
  docsBySource: z.array(
    z.object({ sourcePath: z.string(), count: z.number() }),
  ),
});

export type CourseEmbeddingDoc = { sourcePath: string; count: number };

/** Docs (grouped by source, with embedding counts) for one course. */
export function useCourseEmbeddings(courseId: number) {
  return useQuery({
    queryKey: dataKeys.courseEmbeddings(courseId),
    queryFn: async (): Promise<CourseEmbeddingDoc[]> => {
      const res = await fetch(`/api/ai-rag?courseId=${courseId}`);
      if (!res.ok) {
        throw new Error(`Failed to load training docs (${res.status})`);
      }
      return responseSchema.parse(await res.json()).docsBySource;
    },
    staleTime: 30_000,
  });
}
```

`src/data-hooks/use-upload-training-doc.ts`:

```ts
import { useMutation } from '@tanstack/react-query';
import { upload } from '@vercel/blob/client';

export interface UploadedTrainingDoc {
  url: string;
  fileName: string;
  mimeType: string;
}

/**
 * Upload a PDF/Word file directly to Vercel Blob under a unique `training-docs/`
 * key via the admin client-token endpoint. The server never sees the bytes.
 */
export function useUploadTrainingDoc() {
  return useMutation<UploadedTrainingDoc, Error, File>({
    mutationFn: async (file) => {
      const ext = file.name.split('.').pop() ?? 'bin';
      const result = await upload(
        `training-docs/${crypto.randomUUID()}.${ext}`,
        file,
        {
          access: 'public',
          contentType: file.type,
          handleUploadUrl: '/api/admin/uploads',
        },
      );
      return { url: result.url, fileName: file.name, mimeType: file.type };
    },
  });
}
```

`src/data-hooks/use-add-embeddings.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataKeys } from './keys';

export interface AddEmbeddingsInput {
  url: string;
  fileName: string;
  mimeType: string;
}

/** Ingest an uploaded doc into course-scoped embeddings, then refetch the list. */
export function useAddEmbeddings(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: AddEmbeddingsInput,
    ): Promise<{ sourcePath: string; chunks: number }> => {
      const res = await fetch('/api/ai-rag', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'file', courseId, ...input }),
      });
      if (!res.ok) throw new Error(`Failed to add embeddings (${res.status})`);
      const data = await res.json();
      return { sourcePath: data.sourcePath, chunks: data.chunks };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.courseEmbeddings(courseId),
      });
    },
  });
}
```

`src/data-hooks/use-delete-embedding.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataKeys } from './keys';

/** Delete all embeddings (and blob) for one source in a course, then refetch. */
export function useDeleteEmbedding(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sourcePath }: { sourcePath: string }) => {
      const res = await fetch('/api/ai-rag', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ courseId, sourcePath }),
      });
      if (!res.ok) throw new Error(`Failed to delete (${res.status})`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.courseEmbeddings(courseId),
      });
    },
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test src/data-hooks/__tests__/use-course-embeddings.test.tsx src/data-hooks/__tests__/use-add-embeddings.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "data-hooks/(use-course-embeddings|use-upload-training-doc|use-add-embeddings|use-delete-embedding)|keys.ts" || echo clean` → `clean`.

```bash
git add src/data-hooks/keys.ts src/data-hooks/use-course-embeddings.ts src/data-hooks/use-upload-training-doc.ts src/data-hooks/use-add-embeddings.ts src/data-hooks/use-delete-embedding.ts src/data-hooks/__tests__/use-course-embeddings.test.tsx src/data-hooks/__tests__/use-add-embeddings.test.tsx
git commit -m "feat(data): hooks for course training-doc embeddings (list/upload/add/delete)"
```

---

### Task 3: Presentational — modal shell + upload card

**Files:**
- Create: `src/components/admin/course-embeddings-modal.tsx`
- Create: `src/components/admin/training-doc-upload-card.tsx`
- Test: `src/components/admin/__tests__/training-doc-upload-card.test.tsx`

**Interfaces:**
- Produces:
  - `CourseEmbeddingsModal(props: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: ReactNode })`
  - `type UploadStatus = 'idle' | 'uploading' | 'processing'`
  - `TrainingDocUploadCard(props: { fileName: string | null; onPickFile: (file: File) => void; docName: string; onDocNameChange: (v: string) => void; onSubmit: () => void; status: UploadStatus; error: string | null })`

- [ ] **Step 1: Write the failing test**

Create `src/components/admin/__tests__/training-doc-upload-card.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TrainingDocUploadCard } from '../training-doc-upload-card';

const base = {
  fileName: null,
  onPickFile: vi.fn(),
  docName: '',
  onDocNameChange: vi.fn(),
  onSubmit: vi.fn(),
  status: 'idle' as const,
  error: null,
};

describe('TrainingDocUploadCard', () => {
  it('disables submit when no file is selected', () => {
    render(<TrainingDocUploadCard {...base} />);
    expect(
      screen.getByRole('button', { name: /upload document/i }),
    ).toBeDisabled();
  });

  it('enables submit and shows the selected file name', () => {
    render(<TrainingDocUploadCard {...base} fileName="drone-manual.pdf" />);
    expect(screen.getByText('drone-manual.pdf')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /upload document/i }),
    ).toBeEnabled();
  });

  it('shows processing label and disables submit while processing', () => {
    render(
      <TrainingDocUploadCard
        {...base}
        fileName="drone-manual.pdf"
        status="processing"
      />,
    );
    expect(screen.getByText(/processing embeddings/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /processing embeddings/i }),
    ).toBeDisabled();
  });

  it('renders an error message', () => {
    render(<TrainingDocUploadCard {...base} error="Only PDF or Word files" />);
    expect(screen.getByText('Only PDF or Word files')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/admin/__tests__/training-doc-upload-card.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the modal shell**

`src/components/admin/course-embeddings-modal.tsx`:

```tsx
import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface CourseEmbeddingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}

/**
 * Single-column scrolling modal at the lesson-editor's height. Header with a
 * close button; body scrolls. Presentational shell — the caller owns content.
 */
export const CourseEmbeddingsModal = ({
  open,
  onOpenChange,
  title,
  children,
}: CourseEmbeddingsModalProps) => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-40 bg-gray-1/70 backdrop-blur-sm" />
      <Dialog.Popup className="fixed inset-0 z-40 m-auto grid h-[85vh] max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-[720px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-xl border border-gray-6 bg-gray-2 shadow-xl">
        <div className="flex items-center justify-between gap-4 border-gray-6 border-b px-6 py-4">
          <Dialog.Title className="font-semibold text-gray-12 text-lg">
            {title}
          </Dialog.Title>
          <Dialog.Close className="shrink-0 rounded-md p-1.5 text-gray-11 transition-colors hover:bg-gray-4 hover:text-gray-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9">
            <X className="h-5 w-5" aria-hidden="true" />
          </Dialog.Close>
        </div>
        <div className="overflow-y-auto p-6">{children}</div>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>
);
```

- [ ] **Step 4: Create the upload card**

`src/components/admin/training-doc-upload-card.tsx`:

```tsx
import { Upload } from 'lucide-react';

export type UploadStatus = 'idle' | 'uploading' | 'processing';

interface TrainingDocUploadCardProps {
  fileName: string | null;
  onPickFile: (file: File) => void;
  docName: string;
  onDocNameChange: (value: string) => void;
  onSubmit: () => void;
  status: UploadStatus;
  error: string | null;
}

const STATUS_LABEL: Record<UploadStatus, string> = {
  idle: 'Upload Document',
  uploading: 'Uploading…',
  processing: 'Processing embeddings…',
};

/**
 * "Upload Training Document" card: dropzone + name + submit. Presentational and
 * HOOKLESS — the dropzone is a `<label>` wrapping a hidden file input (clicking
 * the label opens the picker natively; no `useRef`). See the hookless-component
 * constraint in the plan's Global Constraints.
 */
export const TrainingDocUploadCard = ({
  fileName,
  onPickFile,
  docName,
  onDocNameChange,
  onSubmit,
  status,
  error,
}: TrainingDocUploadCardProps) => {
  const busy = status !== 'idle';

  return (
    <section className="rounded-xl border border-gray-6 bg-gray-2 p-6">
      <h2 className="font-semibold text-gray-12 text-lg">
        Upload Training Document
      </h2>

      <span className="mt-4 block text-gray-11 text-sm">Select Document</span>
      <label
        className={`mt-2 flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-gray-6 border-dashed px-6 py-12 text-center transition-colors hover:border-gray-8 focus-within:ring-2 focus-within:ring-apple-9 ${
          busy ? 'pointer-events-none opacity-60' : ''
        }`}
      >
        <input
          type="file"
          accept=".pdf,.docx"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onPickFile(file);
            e.currentTarget.value = '';
          }}
        />
        <Upload className="h-6 w-6 text-gray-10" aria-hidden="true" />
        <span className="font-medium text-gray-12">
          {fileName ?? 'Click to upload PDF or Word document'}
        </span>
        <span className="text-gray-10 text-sm">
          Only .pdf and .docx files are supported
        </span>
      </label>

      <label
        htmlFor="training-doc-name"
        className="mt-6 block text-gray-11 text-sm"
      >
        Document Name
      </label>
      <input
        id="training-doc-name"
        value={docName}
        onChange={(e) => onDocNameChange(e.target.value)}
        placeholder="Enter a name for this document"
        disabled={busy}
        className="mt-2 w-full rounded-lg border border-gray-6 bg-gray-1 px-3 py-2 text-gray-12 placeholder:text-gray-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:opacity-60"
      />
      <p className="mt-1 text-gray-10 text-xs">
        Optional — defaults to the file name. Identifies the document in the
        system.
      </p>

      {error ? <p className="mt-3 text-red-11 text-sm">{error}</p> : null}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!fileName || busy}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-3 px-4 py-2 font-medium text-gray-12 transition-colors hover:bg-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          {STATUS_LABEL[status]}
        </button>
      </div>
    </section>
  );
};
```

Note: hookless by design — the dropzone `<label>` wraps a hidden `<input type="file">`, so no `useRef` is needed. The doc-name input is controlled via props (the container owns the value). This is required for the render test to pass under this repo's Vitest pipeline.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/components/admin/__tests__/training-doc-upload-card.test.tsx`
Expected: PASS (4 cases).

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "course-embeddings-modal|training-doc-upload-card" || echo clean` → `clean`.

```bash
git add src/components/admin/course-embeddings-modal.tsx src/components/admin/training-doc-upload-card.tsx src/components/admin/__tests__/training-doc-upload-card.test.tsx
git commit -m "feat(admin): training-doc upload card + embeddings modal shell"
```

---

### Task 4: Presentational — training-docs list + row

**Files:**
- Create: `src/components/admin/training-doc-row.tsx`
- Create: `src/components/admin/training-docs-list.tsx`
- Test: `src/components/admin/__tests__/training-docs-list.test.tsx`
- Test: `src/components/admin/__tests__/training-doc-row.test.tsx`

**Interfaces:**
- Produces:
  - `TrainingDocRow(props: { sourcePath: string; count: number; onDelete: () => void; isDeleting: boolean })`
  - `TrainingDocsList(props: { docs: {sourcePath: string; count: number}[]; search: string; onSearchChange: (v: string) => void; onDelete: (sourcePath: string) => void; deletingSourcePath: string | null; isLoading: boolean })`

- [ ] **Step 1: Write the failing tests**

Create `src/components/admin/__tests__/training-doc-row.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TrainingDocRow } from '../training-doc-row';

describe('TrainingDocRow', () => {
  it('renders source and embedding count', () => {
    render(
      <TrainingDocRow
        sourcePath="file-a.pdf"
        count={20}
        onDelete={vi.fn()}
        isDeleting={false}
      />,
    );
    expect(screen.queryByText('file-a.pdf')).not.toBeNull();
    expect(screen.queryByText(/20 embeddings/i)).not.toBeNull();
  });

  it('requires opening the popover and confirming before delete fires', async () => {
    const onDelete = vi.fn();
    render(
      <TrainingDocRow
        sourcePath="file-a.pdf"
        count={20}
        onDelete={onDelete}
        isDeleting={false}
      />,
    );
    // Confirm is not in the DOM until the popover is opened.
    expect(
      screen.queryByRole('button', { name: /^confirm/i }),
    ).toBeNull();
    await userEvent.click(
      screen.getByRole('button', { name: /delete file-a.pdf/i }),
    );
    const confirm = await screen.findByRole('button', { name: /^confirm/i });
    expect(onDelete).not.toHaveBeenCalled();
    await userEvent.click(confirm);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
```

Create `src/components/admin/__tests__/training-docs-list.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TrainingDocsList } from '../training-docs-list';

const docs = [
  { sourcePath: 'file-alpha.pdf', count: 20 },
  { sourcePath: 'file-beta.docx', count: 15 },
];

const base = {
  docs,
  search: '',
  onSearchChange: vi.fn(),
  onDelete: vi.fn(),
  deletingSourcePath: null,
  isLoading: false,
};

describe('TrainingDocsList', () => {
  it('shows the count and all rows', () => {
    render(<TrainingDocsList {...base} />);
    expect(screen.queryByText(/2 documents/i)).not.toBeNull();
    expect(screen.queryByText('file-alpha.pdf')).not.toBeNull();
    expect(screen.queryByText('file-beta.docx')).not.toBeNull();
  });

  it('filters rows by search (case-insensitive)', () => {
    render(<TrainingDocsList {...base} search="BETA" />);
    expect(screen.queryByText('file-alpha.pdf')).toBeNull();
    expect(screen.queryByText('file-beta.docx')).not.toBeNull();
  });

  it('renders an empty state when there are no docs', () => {
    render(<TrainingDocsList {...base} docs={[]} />);
    expect(screen.queryByText(/no training documents yet/i)).not.toBeNull();
  });

  it('shows a loading state', () => {
    render(<TrainingDocsList {...base} docs={[]} isLoading />);
    expect(screen.queryByText(/loading/i)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/components/admin/__tests__/training-doc-row.test.tsx src/components/admin/__tests__/training-docs-list.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create the row**

`src/components/admin/training-doc-row.tsx`:

```tsx
import { Popover } from '@base-ui/react/popover';
import { FileText, Loader2, Trash2 } from 'lucide-react';

interface TrainingDocRowProps {
  sourcePath: string;
  count: number;
  onDelete: () => void;
  isDeleting: boolean;
}

/**
 * One training-document row. HOOKLESS — the confirm-before-delete uses a Base UI
 * `Popover` (its state lives inside the library), so this component calls no
 * React hook and is safe to render in a test. See the plan's hookless constraint.
 */
export const TrainingDocRow = ({
  sourcePath,
  count,
  onDelete,
  isDeleting,
}: TrainingDocRowProps) => (
  <div className="flex items-center gap-3 rounded-lg border border-gray-6 bg-gray-1 px-4 py-3">
    <FileText className="h-5 w-5 shrink-0 text-gray-10" aria-hidden="true" />
    <div className="min-w-0 flex-1">
      <p className="truncate font-medium text-gray-12">{sourcePath}</p>
      <p className="text-gray-10 text-sm">{count} embeddings</p>
    </div>

    <Popover.Root>
      <Popover.Trigger
        aria-label={`Delete ${sourcePath}`}
        className="rounded-md p-1.5 text-gray-10 transition-colors hover:bg-red-9/15 hover:text-red-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} className="z-50">
          <Popover.Popup className="w-64 rounded-lg border border-gray-6 bg-gray-2 p-3 shadow-lg">
            <p className="text-gray-11 text-sm">
              Delete this document and its {count} embeddings?
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <Popover.Close className="rounded-md px-2 py-1 text-gray-11 text-xs hover:text-gray-12">
                Cancel
              </Popover.Close>
              <button
                type="button"
                onClick={onDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-1 rounded-md bg-red-9 px-2 py-1 font-medium text-black text-xs disabled:opacity-60"
              >
                {isDeleting ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                ) : null}
                Confirm
              </button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  </div>
);
```

Note: hookless (Base UI `Popover` owns the open/close state). `red-9` solid uses `text-black` for WCAG AA — no red-contrast token exists. (memory: [[red-9-button-contrast]])

- [ ] **Step 4: Create the list**

`src/components/admin/training-docs-list.tsx`:

```tsx
import { Search } from 'lucide-react';
import { TrainingDocRow } from './training-doc-row';

interface TrainingDocsListProps {
  docs: { sourcePath: string; count: number }[];
  search: string;
  onSearchChange: (value: string) => void;
  onDelete: (sourcePath: string) => void;
  deletingSourcePath: string | null;
  isLoading: boolean;
}

/** "Training Documents" card: count, search, rows, empty/loading states. */
export const TrainingDocsList = ({
  docs,
  search,
  onSearchChange,
  onDelete,
  deletingSourcePath,
  isLoading,
}: TrainingDocsListProps) => {
  const filtered = docs.filter((d) =>
    d.sourcePath.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <section className="mt-6 rounded-xl border border-gray-6 bg-gray-2 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-semibold text-gray-12 text-lg">
          Training Documents{' '}
          <span className="font-normal text-gray-10 text-sm">
            {docs.length} documents
          </span>
        </h2>
        <div className="relative">
          <Search
            className="-translate-y-1/2 absolute inset-inline-start-3 top-1/2 h-4 w-4 text-gray-10"
            aria-hidden="true"
          />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search documents…"
            aria-label="Search documents"
            className="rounded-lg border border-gray-6 bg-gray-1 py-2 ps-9 pe-3 text-gray-12 placeholder:text-gray-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {isLoading ? (
          <p className="py-8 text-center text-gray-10 text-sm">Loading…</p>
        ) : docs.length === 0 ? (
          <p className="py-8 text-center text-gray-10 text-sm">
            No training documents yet.
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-gray-10 text-sm">
            No documents match “{search}”.
          </p>
        ) : (
          filtered.map((doc) => (
            <TrainingDocRow
              key={doc.sourcePath}
              sourcePath={doc.sourcePath}
              count={doc.count}
              onDelete={() => onDelete(doc.sourcePath)}
              isDeleting={deletingSourcePath === doc.sourcePath}
            />
          ))
        )}
      </div>
    </section>
  );
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test src/components/admin/__tests__/training-doc-row.test.tsx src/components/admin/__tests__/training-docs-list.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "training-doc-row|training-docs-list" || echo clean` → `clean`.

```bash
git add src/components/admin/training-doc-row.tsx src/components/admin/training-docs-list.tsx src/components/admin/__tests__/training-doc-row.test.tsx src/components/admin/__tests__/training-docs-list.test.tsx
git commit -m "feat(admin): training-documents list + row with confirm-delete"
```

---

### Task 5: Atom + container + toolbar button (integration)

Wire it together: the atom, the orchestrating container (RHF upload form + hooks), and the `BrainCircuit` button in the toolbar.

**Files:**
- Modify: `src/atoms/admin.ts`
- Create: `src/components/admin/training-upload-helpers.ts` (pure, testable)
- Create: `src/components/admin/course-embeddings-dialog-container.tsx` (hook-using container — NOT render-tested)
- Modify: `src/components/admin/course-actions-container.tsx`
- Test: `src/components/admin/__tests__/training-upload-helpers.test.ts`

**Interfaces:**
- Consumes: `trainCourseAtom`, `embeddingsSearchAtom`; `useCourseEmbeddings`, `useUploadTrainingDoc`, `useAddEmbeddings`, `useDeleteEmbedding`; `CourseEmbeddingsModal`, `TrainingDocUploadCard` (+ `UploadStatus`), `TrainingDocsList`.
- Produces:
  - `trainCourseAtom`, `embeddingsSearchAtom`
  - `resolveDocName(docName: string | undefined, fallback: string): string`
  - `deriveUploadStatus(uploadPending: boolean, addPending: boolean): UploadStatus`
  - `CourseEmbeddingsDialogContainer` (self-contained, no props); a new toolbar button.

The container calls React hooks, so per the hookless-component constraint it is **NOT render-tested**; its only non-trivial logic (doc-name fallback, two-phase status) is extracted into pure helpers and unit-tested instead.

- [ ] **Step 1: Add the atoms**

In `src/atoms/admin.ts`, add:

```ts
/** Course whose training-documents (AI embeddings) modal is open. */
export const trainCourseAtom = atom<{ id: number; name: string } | null>(null);

/** Client-side search filter for the training-documents list. Reset on close. */
export const embeddingsSearchAtom = atom('');
```

- [ ] **Step 2: Write the failing helper test**

Create `src/components/admin/__tests__/training-upload-helpers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  deriveUploadStatus,
  resolveDocName,
} from '#/components/admin/training-upload-helpers';

describe('resolveDocName', () => {
  it('uses the trimmed doc name when one is provided', () => {
    expect(resolveDocName('  My Doc  ', 'file.pdf')).toBe('My Doc');
  });
  it('falls back to the file name when blank or undefined', () => {
    expect(resolveDocName('', 'file.pdf')).toBe('file.pdf');
    expect(resolveDocName('   ', 'file.pdf')).toBe('file.pdf');
    expect(resolveDocName(undefined, 'file.pdf')).toBe('file.pdf');
  });
});

describe('deriveUploadStatus', () => {
  it('is uploading while the blob upload is pending', () => {
    expect(deriveUploadStatus(true, false)).toBe('uploading');
  });
  it('is processing while the embed request is pending', () => {
    expect(deriveUploadStatus(false, true)).toBe('processing');
  });
  it('is idle when nothing is pending', () => {
    expect(deriveUploadStatus(false, false)).toBe('idle');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test src/components/admin/__tests__/training-upload-helpers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Create the helpers**

`src/components/admin/training-upload-helpers.ts`:

```ts
import type { UploadStatus } from './training-doc-upload-card';

/** The document identifier: the typed name if non-blank, else the file's name. */
export function resolveDocName(
  docName: string | undefined,
  fallback: string,
): string {
  const trimmed = docName?.trim();
  return trimmed ? trimmed : fallback;
}

/** Two-phase upload status derived from the two mutations' pending flags. */
export function deriveUploadStatus(
  uploadPending: boolean,
  addPending: boolean,
): UploadStatus {
  if (uploadPending) return 'uploading';
  if (addPending) return 'processing';
  return 'idle';
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/components/admin/__tests__/training-upload-helpers.test.ts`
Expected: PASS (6 cases).

- [ ] **Step 6: Create the container (not render-tested)**

`src/components/admin/course-embeddings-dialog-container.tsx`:

```tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { useAtom, useSetAtom } from 'jotai';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { embeddingsSearchAtom, trainCourseAtom } from '#/atoms/admin';
import { useAddEmbeddings } from '#/data-hooks/use-add-embeddings';
import { useCourseEmbeddings } from '#/data-hooks/use-course-embeddings';
import { useDeleteEmbedding } from '#/data-hooks/use-delete-embedding';
import { useUploadTrainingDoc } from '#/data-hooks/use-upload-training-doc';
import { CourseEmbeddingsModal } from './course-embeddings-modal';
import { TrainingDocUploadCard } from './training-doc-upload-card';
import { TrainingDocsList } from './training-docs-list';
import { deriveUploadStatus, resolveDocName } from './training-upload-helpers';

const DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const uploadSchema = z.object({
  docName: z.string().optional(),
  file: z
    .instanceof(File, { message: 'Choose a PDF or Word document' })
    .refine(
      (f) =>
        f.type === 'application/pdf' ||
        f.type === DOCX ||
        /\.(pdf|docx)$/i.test(f.name),
      'Only PDF or Word (.docx) files are supported',
    ),
});
type UploadForm = z.infer<typeof uploadSchema>;

/** Container: AI-training modal for a course — upload docs + manage embeddings. */
export const CourseEmbeddingsDialogContainer = () => {
  const [course, setCourse] = useAtom(trainCourseAtom);
  const setSearch = useSetAtom(embeddingsSearchAtom);
  return (
    <CourseEmbeddingsModal
      open={course !== null}
      onOpenChange={(next) => {
        if (!next) {
          setCourse(null);
          setSearch('');
        }
      }}
      title="AI training"
    >
      {course ? <Body courseId={course.id} courseName={course.name} /> : null}
    </CourseEmbeddingsModal>
  );
};

/** Data-bound body; mounts only while the modal is open. */
const Body = ({
  courseId,
  courseName,
}: {
  courseId: number;
  courseName: string;
}) => {
  const [search, setSearch] = useAtom(embeddingsSearchAtom);
  const embeddings = useCourseEmbeddings(courseId);
  const uploadDoc = useUploadTrainingDoc();
  const addEmbeddings = useAddEmbeddings(courseId);
  const deleteEmbedding = useDeleteEmbedding(courseId);

  const form = useForm<UploadForm>({
    resolver: zodResolver(uploadSchema),
    mode: 'onSubmit',
    defaultValues: { docName: '' },
  });
  const file = form.watch('file') as File | undefined;
  const status = deriveUploadStatus(
    uploadDoc.isPending,
    addEmbeddings.isPending,
  );

  const submit = form.handleSubmit(async (values) => {
    try {
      const uploaded = await uploadDoc.mutateAsync(values.file);
      await addEmbeddings.mutateAsync({
        url: uploaded.url,
        fileName: resolveDocName(values.docName, uploaded.fileName),
        mimeType: uploaded.mimeType,
      });
      toast.success('Training document added');
      form.reset({ docName: '' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    }
  });

  const fileError =
    form.formState.errors.file?.message ??
    (uploadDoc.error || addEmbeddings.error
      ? 'Upload failed. Please try again.'
      : null);

  return (
    <>
      <p className="mb-4 text-gray-11 text-sm">
        Course: <span className="font-medium text-gray-12">{courseName}</span>
      </p>
      <TrainingDocUploadCard
        fileName={file?.name ?? null}
        onPickFile={(f) => form.setValue('file', f, { shouldValidate: true })}
        docName={form.watch('docName') ?? ''}
        onDocNameChange={(v) => form.setValue('docName', v)}
        onSubmit={submit}
        status={status}
        error={fileError}
      />
      <TrainingDocsList
        docs={embeddings.data ?? []}
        search={search}
        onSearchChange={setSearch}
        onDelete={(sourcePath) => deleteEmbedding.mutate({ sourcePath })}
        deletingSourcePath={
          deleteEmbedding.isPending
            ? (deleteEmbedding.variables?.sourcePath ?? null)
            : null
        }
        isLoading={embeddings.isLoading}
      />
    </>
  );
};
```

Note: this container is intentionally NOT render-tested (it calls hooks — see the hookless constraint). Its extractable logic lives in `training-upload-helpers.ts` (tested in Step 2). The search string is `embeddingsSearchAtom` (jotai), reset on close.

- [ ] **Step 7: Wire the toolbar button**

In `src/components/admin/course-actions-container.tsx`: add `BrainCircuit` to the lucide import, import `trainCourseAtom` and `CourseEmbeddingsDialogContainer`, add a `setTrainCourse` setter, insert the button, and render the container. The `<div>` becomes:

```tsx
import { useSetAtom } from 'jotai';
import { BrainCircuit, Pencil, Trash2 } from 'lucide-react';

import { deleteCourseAtom, editCourseAtom, trainCourseAtom } from '@/atoms/admin';
import type { BoardCourse } from '@/lib/admin-schemas';
import { CourseEmbeddingsDialogContainer } from './course-embeddings-dialog-container';
import { CreateModuleDialogContainer } from './create-module-dialog-container';
import { DeleteCourseDialogContainer } from './delete-course-dialog-container';
import { EditCourseDialogContainer } from './edit-course-dialog-container';
import { TooltipIconButton } from './tooltip-icon-button';

export const CourseActionsContainer = ({ course }: { course: BoardCourse }) => {
  const setEditCourse = useSetAtom(editCourseAtom);
  const setDeleteCourse = useSetAtom(deleteCourseAtom);
  const setTrainCourse = useSetAtom(trainCourseAtom);

  return (
    <div className="flex items-center gap-1">
      <CreateModuleDialogContainer courseId={course.id} />
      <TooltipIconButton
        label="AI training"
        onClick={() => setTrainCourse({ id: course.id, name: course.name })}
      >
        <BrainCircuit className="h-4 w-4" aria-hidden="true" />
      </TooltipIconButton>
      <TooltipIconButton
        label="Edit course"
        onClick={() =>
          setEditCourse({
            id: course.id,
            name: course.name,
            description: course.description,
            imageUrlAvif: course.imageUrlAvif,
            imageUrlWebp: course.imageUrlWebp,
          })
        }
      >
        <Pencil className="h-4 w-4" aria-hidden="true" />
      </TooltipIconButton>
      <TooltipIconButton
        label="Delete course"
        variant="danger"
        onClick={() => setDeleteCourse({ id: course.id, name: course.name })}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </TooltipIconButton>

      <CourseEmbeddingsDialogContainer />
      <EditCourseDialogContainer />
      <DeleteCourseDialogContainer />
    </div>
  );
};
```

- [ ] **Step 8: Typecheck + full suite + lint**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "course-embeddings|course-actions|atoms/admin|training-upload-helpers" || echo clean` → `clean`.
Run: `pnpm test` → all pass (including the presentational + helper tests; the container is not render-tested).
Run: `pnpm exec biome lint src/components/admin/course-embeddings-dialog-container.tsx src/components/admin/training-upload-helpers.ts src/components/admin/course-embeddings-modal.tsx src/components/admin/training-doc-upload-card.tsx src/components/admin/training-docs-list.tsx src/components/admin/training-doc-row.tsx src/components/admin/course-actions-container.tsx src/data-hooks/use-course-embeddings.ts src/data-hooks/use-upload-training-doc.ts src/data-hooks/use-add-embeddings.ts src/data-hooks/use-delete-embedding.ts` → 0 errors/warnings.

- [ ] **Step 9: Commit**

```bash
git add src/atoms/admin.ts src/components/admin/training-upload-helpers.ts src/components/admin/course-embeddings-dialog-container.tsx src/components/admin/course-actions-container.tsx src/components/admin/__tests__/training-upload-helpers.test.ts
git commit -m "feat(admin): AI-training button + course embeddings modal wiring"
```

---

## Notes for the implementer

- **Imports:** any source file a test imports (directly/transitively) uses `#/`; tests use `#/`; relative `./` always fine. See the Global Constraints alias note. (memory: [[vitest-alias-and-env]])
- **HOOKLESS presentational components** (hard infra constraint): no `useState`/`useRef`/etc. in `src/` components that get render-tested — use `<label>`-wrapped file inputs, controlled-via-props inputs, and Base UI `Popover`/`Dialog` for open/close state. Containers may use hooks but are not render-tested. See Global Constraints.
- **`red-9` solid buttons use `text-black`** for WCAG AA — there is no `red-contrast` token. (memory: [[red-9-button-contrast]])
- **Do not stage unrelated working-state** — `src/env.ts`, `styles.css`, `brand-colors.*`, `generate-theme-css.*` are the user's in-flight theme changes; commit only the exact feature files each task lists.
- **RHF file field:** the file lives in form state via `setValue('file', file, { shouldValidate: true })` and is read with `watch('file')`; validation is `z.instanceof(File)` + extension/mime refine.
- **`deleteEmbedding.variables`** gives the in-flight delete's `sourcePath` for the per-row pending indicator (TanStack Query exposes the last mutation variables).
- The `/api/ai-rag` endpoint, its `courseId` scoping, and the blob pipeline already exist from the prior feature; this plan only builds the UI + the uploads-policy extension.
```
