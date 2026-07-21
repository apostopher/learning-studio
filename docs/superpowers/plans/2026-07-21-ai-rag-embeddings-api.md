# /ai-rag Embeddings API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only `/api/ai-rag` endpoint (POST/GET/DELETE) that ingests document text into course-scoped embeddings in the `docs` table, ports from the old `/viper7-rag` route.

**Architecture:** Thin TanStack route (`createFileRoute(...).server.handlers`) exporting named handler functions, delegating to reusable server modules under `@/ai/*` and `@/db/*`. Embeddings use Google `gemini-embedding-001` (3072-dim) to stay compatible with the 6248 already-migrated rows. Files are pre-uploaded to Vercel Blob by the client; file mode fetches the blob URL and converts DOCX (mammoth) / PDF (gateway LLM) to HTML before chunking.

**Tech Stack:** TypeScript (strict), TanStack React Router server routes, Drizzle ORM + Postgres (pgvector), Vercel AI SDK (`ai` v6) + `@ai-sdk/google`, `gpt-tokenizer`, `mammoth`, `@vercel/blob`, zod v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-21-ai-rag-embeddings-api-design.md`

## Global Constraints

- **Import alias:** new source and tests import via `#/…` (not `@/…`). Vitest cannot resolve `@/`; the route and its imports must use `#/` so `vi.mock('#/…')` matches. (memory: [[vitest-alias-and-env]])
- **Test file convention:** handler/server tests start with `// @vitest-environment node`, use `vi.hoisted(() => …)` for mocks, and `vi.mock('#/…', …)` — do NOT `importOriginal` on internal `#/`-using modules. Pure-module tests may use the default environment. (memory: [[vitest-alias-and-env]])
- **Embedding model is fixed:** `gemini-embedding-001`, 3072-dim. Do not set a different `outputDimensionality` or model — existing rows depend on it.
- **Auth:** every handler calls `requireAdmin(request.headers)` first; on `ForbiddenError` return `403`.
- **Run a single test file:** `pnpm test <path>` (script `test` = `vitest run`, accepts a path filter).
- **Commits — explicit paths only.** Never `git add -A`/`git add .`. The working tree has uncommitted user working-state in `src/db/schema.ts`, `package.json`, and drizzle files from this session. Each commit step lists exact NEW files. **Do NOT commit** `src/db/schema.ts`, `package.json`, `pnpm-lock.yaml`, `src/env.ts`, or `.env*` — leave those modified-but-unstaged for the user to fold into their own working-state commit. (memory: [[uncommitted-user-files]])

---

### Task 1: Add `courseId` to `doc_urls` (schema + DB)

Makes `doc_urls` course-scoped so the same `sourcePath` can exist per course. Table is empty, so applying is safe.

**Files:**
- Modify: `src/db/schema.ts` (the `docURLs` table, ~lines 758-772)

**Interfaces:**
- Produces: `docURLs` table gains nullable `courseId: integer("course_id") → courses.id`; unique index becomes `(course_id, source_path, url)` NULLS NOT DISTINCT. `DocURLsInsert`/`DocURLsSelect` types auto-update.

- [ ] **Step 1: Edit the `docURLs` table definition**

Replace the existing `docURLs` block in `src/db/schema.ts` with:

```ts
export const docURLs = pgTable(
  "doc_urls",
  {
    id: serial("id").primaryKey(),
    // Null = org-wide; set = course-specific. Matches docs.courseId scoping.
    courseId: integer("course_id").references(() => coursesTable.id, {
      onDelete: "cascade",
    }),
    sourcePath: text("source_path").notNull(),
    url: text("url"),
  },
  (t) => [
    unique("uniq_course_source_path_url")
      .on(t.courseId, t.sourcePath, t.url)
      .nullsNotDistinct(),
  ],
);
```

(`unique`, `integer`, `serial`, `text`, `coursesTable` are already imported/defined in this file from prior work.)

- [ ] **Step 2: Apply to the database**

Run: `pnpm db:push`
Expected: `[✓] Changes applied`. If it errors with an interactive rename prompt (non-TTY), apply the equivalent DDL directly:

```bash
DBURL=$(grep -h '^DATABASE_URL' .env.local .env | head -1 | sed 's/^DATABASE_URL=//; s/^"//; s/"$//')
psql "$DBURL" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
DROP INDEX IF EXISTS uniq_source_path_url;
ALTER TABLE doc_urls ADD COLUMN course_id integer;
ALTER TABLE doc_urls
  ADD CONSTRAINT doc_urls_course_id_courses_id_fk
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
ALTER TABLE doc_urls
  ADD CONSTRAINT uniq_course_source_path_url UNIQUE NULLS NOT DISTINCT (course_id, source_path, url);
COMMIT;
SQL
```

- [ ] **Step 3: Verify the live table**

Run: `psql "$DBURL" -c "\d doc_urls"`
Expected: a `course_id | integer` column, FK to `courses(id)`, and a `uniq_course_source_path_url UNIQUE CONSTRAINT ... NULLS NOT DISTINCT`.

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -i "schema.ts" || echo "schema clean"`
Expected: `schema clean`.

- [ ] **Step 5: (No commit — schema.ts is user working-state.)** Leave `src/db/schema.ts` modified-but-unstaged per Global Constraints.

---

### Task 2: Dependencies, env var, and Gemini embedding provider

**Files:**
- Modify: `package.json` (via `pnpm add`)
- Modify: `src/env.ts` (server schema, ~line 85)
- Create: `src/ai/gemini.ts`
- Modify: `.env` and/or `.env.local` (add the key locally)

**Interfaces:**
- Produces: `embeddingModel` (a `ai` SDK `EmbeddingModel`) exported from `#/ai/gemini`, used by Task 4.

- [ ] **Step 1: Install dependencies**

Run: `pnpm add @ai-sdk/google gpt-tokenizer`
Expected: both added. Verify the `package.json` diff contains ONLY these two dependencies before moving on.

- [ ] **Step 2: Add the env var to the server schema**

In `src/env.ts`, inside `server: { … }` (after `CRON_SECRET`), add:

```ts
    // Google Generative AI key — powers gemini-embedding-001 (RAG embeddings)
    // and PDF→HTML conversion via the gateway.
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
```

- [ ] **Step 3: Add the key to your local env**

Add `GOOGLE_GENERATIVE_AI_API_KEY=…` to `.env.local` (use a real key). Without it, the server env validation throws at boot.

- [ ] **Step 4: Create the provider module**

Create `src/ai/gemini.ts`:

```ts
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { env } from '#/env';

/** Google Generative AI provider (Gemini). */
export const googleProvider = createGoogleGenerativeAI({
  apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
});

/**
 * gemini-embedding-001 → 3072-dim vectors. This MUST match the model that
 * produced the existing `docs` rows; embeddings from other models are not
 * comparable in the same vector space.
 */
export const embeddingModel = googleProvider.textEmbeddingModel(
  'gemini-embedding-001',
);
```

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "gemini.ts|env.ts" || echo "clean"`
Expected: `clean`.

- [ ] **Step 6: (No commit — package.json / env.ts / .env are user working-state.)** Leave modified-but-unstaged.

---

### Task 3: Port the token-aware chunker (`embeddings-helper.ts`)

Pure functions, no I/O — TDD directly.

**Files:**
- Create: `src/ai/embeddings-helper.ts`
- Test: `src/ai/__tests__/embeddings-helper.test.ts`

**Interfaces:**
- Produces:
  - `htmlToSections(html: string, name: string): { heading: string; text: string; name: string }[]`
  - `chunkSectionTokens(section: { heading: string; text: string; name: string }): { heading: string; text: string; name: string }[]`
  - `splitIntoSentences(text: string): string[]`
  - `trySnapToSentenceBoundary(s: string): string | null`

- [ ] **Step 1: Write the failing test**

Create `src/ai/__tests__/embeddings-helper.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  htmlToSections,
  chunkSectionTokens,
  splitIntoSentences,
  trySnapToSentenceBoundary,
} from '#/ai/embeddings-helper';

describe('htmlToSections', () => {
  it('strips tags and drops paragraphs shorter than 20 chars', () => {
    const html = '<p>short</p>\n\n<p>' + 'a'.repeat(30) + '</p>';
    const sections = htmlToSections(html, 'file-x');
    expect(sections).toHaveLength(1);
    expect(sections[0].name).toBe('file-x');
    expect(sections[0].text).not.toContain('<p>');
  });
});

describe('chunkSectionTokens', () => {
  it('prefixes each chunk with name + section and keeps single-chunk short text intact', () => {
    const chunks = chunkSectionTokens({
      heading: 'Section 1',
      text: 'The quick brown fox jumps over the lazy dog. Again it jumps.',
      name: 'file-x',
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text.startsWith('Name: file-x > Section: Section 1')).toBe(
      true,
    );
    expect(chunks[0].name).toBe('file-x');
  });

  it('splits long text into multiple overlapping chunks', () => {
    const long = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ') + '.';
    const chunks = chunkSectionTokens({
      heading: 'Section 1',
      text: long,
      name: 'file-x',
    });
    expect(chunks.length).toBeGreaterThan(1);
  });
});

describe('splitIntoSentences', () => {
  it('splits on sentence boundaries', () => {
    expect(splitIntoSentences('One. Two. Three.')).toEqual([
      'One.',
      'Two.',
      'Three.',
    ]);
  });
  it('returns the whole text when there is no boundary', () => {
    expect(splitIntoSentences('no boundary here')).toEqual(['no boundary here']);
  });
});

describe('trySnapToSentenceBoundary', () => {
  it('snaps to the last terminator within 40 chars', () => {
    expect(trySnapToSentenceBoundary('Hello world. tail')).toBe('Hello world.');
  });
  it('returns null when no terminator is near the end', () => {
    expect(trySnapToSentenceBoundary('no terminator ' + 'x'.repeat(60))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/ai/__tests__/embeddings-helper.test.ts`
Expected: FAIL — cannot resolve `#/ai/embeddings-helper`.

- [ ] **Step 3: Create the implementation (verbatim port)**

Create `src/ai/embeddings-helper.ts`:

```ts
import { encode, decode } from 'gpt-tokenizer';

// -------- precision knobs --------
const CHUNK_TOKENS = 300;
const OVERLAP_TOKENS = 70;
const MIN_PARAGRAPH_CHARS = 20;

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

type Section = {
  heading: string;
  text: string;
  name: string;
};

/** Extract text content from HTML and split into logical sections. */
export function htmlToSections(html: string, name: string): Section[] {
  const textContent = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return textContent
    .split(/(?:\n\s*\n|\r\n\s*\r\n)/)
    .map((section) => section.trim())
    .filter((section) => section.length >= MIN_PARAGRAPH_CHARS)
    .map((section, index) => ({
      heading: `Section ${index + 1}`,
      text: section,
      name,
    }));
}

/** Token-aware chunker: 300 tokens with 70 overlap. */
export function chunkSectionTokens(section: Section) {
  const sentences = splitIntoSentences(section.text);
  const joined = sentences.join(' ');
  const tokens = encode(joined);

  const chunks: { heading: string; text: string; name: string }[] = [];
  const prefix = `Name: ${section.name} > Section: ${section.heading}\n\n`;

  let i = 0;
  while (i < tokens.length) {
    const j = Math.min(i + CHUNK_TOKENS, tokens.length);
    let body = decode(tokens.slice(i, j)).trim();

    if (j < tokens.length) {
      const soft = trySnapToSentenceBoundary(body);
      if (soft) body = soft;
    }

    chunks.push({
      heading: section.heading,
      text: `${prefix}${body}`,
      name: section.name,
    });

    if (j === tokens.length) break;
    i = Math.max(0, j - OVERLAP_TOKENS);
  }
  return chunks;
}

export function splitIntoSentences(text: string): string[] {
  const parts = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [text.trim()];
}

export function trySnapToSentenceBoundary(s: string): string | null {
  const idx = Math.max(s.lastIndexOf('.'), s.lastIndexOf('!'), s.lastIndexOf('?'));
  if (idx > -1 && s.length - idx <= 40) return s.slice(0, idx + 1).trim();
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/ai/__tests__/embeddings-helper.test.ts`
Expected: PASS (all 7 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/ai/embeddings-helper.ts src/ai/__tests__/embeddings-helper.test.ts
git commit -m "feat(ai): port token-aware embeddings chunker"
```

---

### Task 4: Embeddings generator (`embeddings.ts`)

Course-scoped delete-before-insert + batched `embedMany` + `onConflictDoNothing`.

**Files:**
- Create: `src/ai/embeddings.ts`
- Test: `src/ai/__tests__/embeddings.test.ts`

**Interfaces:**
- Consumes: `embeddingModel` from `#/ai/gemini`; `htmlToSections`, `chunkSectionTokens` from `#/ai/embeddings-helper`; `db` from `#/db`; `docs` from `#/db/schema`; `embedMany` from `ai`.
- Produces: `generateHTMLEmbeddings(args: { courseId: number | null; sourcePath: string; html: string }): Promise<{ chunks: number }>`

- [ ] **Step 1: Write the failing test**

Create `src/ai/__tests__/embeddings.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { embedMany, htmlToSections, chunkSectionTokens, dbMock } = vi.hoisted(
  () => {
    const insert = vi.fn(() => ({
      values: vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue(undefined) })),
    }));
    const del = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
    return {
      embedMany: vi.fn(),
      htmlToSections: vi.fn(),
      chunkSectionTokens: vi.fn(),
      dbMock: { insert, delete: del },
    };
  },
);

vi.mock('ai', () => ({ embedMany }));
vi.mock('#/ai/gemini', () => ({ embeddingModel: { id: 'gemini-embedding-001' } }));
vi.mock('#/ai/embeddings-helper', () => ({ htmlToSections, chunkSectionTokens }));
vi.mock('#/db', () => ({ db: dbMock }));
vi.mock('#/db/schema', () => ({ docs: { sourcePath: 'source_path', courseId: 'course_id' } }));
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ and: a }),
  eq: (c: unknown, v: unknown) => ({ eq: [c, v] }),
  isNull: (c: unknown) => ({ isNull: c }),
}));

import { generateHTMLEmbeddings } from '#/ai/embeddings';

function chunk(i: number) {
  return { heading: 'Section 1', text: `chunk-${i}`, name: 'file-x' };
}

beforeEach(() => {
  vi.clearAllMocks();
  htmlToSections.mockReturnValue([{ heading: 'Section 1', text: 't', name: 'file-x' }]);
});

describe('generateHTMLEmbeddings', () => {
  it('returns { chunks: 0 } and never calls embedMany when there is nothing to embed', async () => {
    chunkSectionTokens.mockReturnValue([]);
    const result = await generateHTMLEmbeddings({
      courseId: 1,
      sourcePath: 'file-x',
      html: '<p>x</p>',
    });
    expect(result).toEqual({ chunks: 0 });
    expect(embedMany).not.toHaveBeenCalled();
    expect(dbMock.delete).toHaveBeenCalledTimes(1);
  });

  it('batches embedMany in groups of 100', async () => {
    chunkSectionTokens.mockReturnValue(
      Array.from({ length: 150 }, (_, i) => chunk(i)),
    );
    embedMany.mockImplementation(async ({ values }: { values: string[] }) => ({
      embeddings: values.map(() => [0.1, 0.2, 0.3]),
    }));
    const result = await generateHTMLEmbeddings({
      courseId: null,
      sourcePath: 'file-x',
      html: '<p>x</p>',
    });
    expect(result).toEqual({ chunks: 150 });
    expect(embedMany).toHaveBeenCalledTimes(2); // 100 + 50
    expect(dbMock.insert).toHaveBeenCalledTimes(150);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/ai/__tests__/embeddings.test.ts`
Expected: FAIL — cannot resolve `#/ai/embeddings`.

- [ ] **Step 3: Create the implementation**

Create `src/ai/embeddings.ts`:

```ts
import { embedMany } from 'ai';
import { and, eq, isNull } from 'drizzle-orm';
import { embeddingModel } from '#/ai/gemini';
import { db } from '#/db';
import { docs } from '#/db/schema';
import { htmlToSections, chunkSectionTokens } from '#/ai/embeddings-helper';

export type GenerateEmbeddingsArgs = {
  courseId: number | null;
  sourcePath: string;
  html: string;
};

const BATCH_SIZE = 100;

/**
 * Chunk HTML and write course-scoped embeddings into `docs`, replacing any
 * existing rows for this (courseId, sourcePath) first.
 */
export async function generateHTMLEmbeddings({
  courseId,
  sourcePath,
  html,
}: GenerateEmbeddingsArgs): Promise<{ chunks: number }> {
  const courseFilter =
    courseId === null ? isNull(docs.courseId) : eq(docs.courseId, courseId);

  await db
    .delete(docs)
    .where(and(eq(docs.sourcePath, sourcePath), courseFilter));

  const sections = htmlToSections(html, sourcePath);
  const toEmbed = sections.flatMap(chunkSectionTokens);
  if (!toEmbed.length) return { chunks: 0 };

  const allEmbeddings: number[][] = [];
  for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
    const batch = toEmbed.slice(i, i + BATCH_SIZE);
    const { embeddings } = await embedMany({
      model: embeddingModel,
      values: batch.map((c) => c.text),
    });
    allEmbeddings.push(...embeddings);
  }

  await Promise.all(
    toEmbed.map((c, i) =>
      db
        .insert(docs)
        .values({
          courseId,
          sourcePath: c.name,
          heading: c.heading,
          chunk: c.text,
          embedding: allEmbeddings[i],
        })
        .onConflictDoNothing(),
    ),
  );

  return { chunks: toEmbed.length };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/ai/__tests__/embeddings.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add src/ai/embeddings.ts src/ai/__tests__/embeddings.test.ts src/ai/gemini.ts
git commit -m "feat(ai): course-scoped embeddings generator"
```

(`src/ai/gemini.ts` is a new file created in Task 2 and safe to commit here; do NOT add `package.json`/`env.ts`.)

---

### Task 5: HTML converters (`html-converters.ts`)

DOCX via mammoth; PDF via gateway LLM (`google/gemini-2.5-flash`). Both fail soft to `''`.

**Files:**
- Create: `src/common/html-converters.ts`
- Test: `src/common/__tests__/html-converters.test.ts`

**Interfaces:**
- Consumes: `mammoth` default import; `generateText` from `ai`.
- Produces:
  - `convertWordToHtml(buffer: Buffer): Promise<string>`
  - `convertPdfToHtml(fileName: string, arrayBuffer: ArrayBuffer): Promise<string>`

- [ ] **Step 1: Write the failing test**

Create `src/common/__tests__/html-converters.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { convertToHtml, generateText } = vi.hoisted(() => ({
  convertToHtml: vi.fn(),
  generateText: vi.fn(),
}));

vi.mock('mammoth', () => ({ default: { convertToHtml } }));
vi.mock('ai', () => ({ generateText }));

import { convertWordToHtml, convertPdfToHtml } from '#/common/html-converters';

beforeEach(() => vi.clearAllMocks());

describe('convertWordToHtml', () => {
  it('returns mammoth html', async () => {
    convertToHtml.mockResolvedValue({ value: '<p>hi</p>' });
    expect(await convertWordToHtml(Buffer.from('x'))).toBe('<p>hi</p>');
  });
  it('returns empty string on error', async () => {
    convertToHtml.mockRejectedValue(new Error('bad'));
    expect(await convertWordToHtml(Buffer.from('x'))).toBe('');
  });
});

describe('convertPdfToHtml', () => {
  it('returns trimmed model text', async () => {
    generateText.mockResolvedValue({ text: '  <h1>t</h1>  ' });
    const html = await convertPdfToHtml('file.pdf', new ArrayBuffer(4));
    expect(html).toBe('<h1>t</h1>');
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'google/gemini-2.5-flash' }),
    );
  });
  it('returns empty string on error', async () => {
    generateText.mockRejectedValue(new Error('bad'));
    expect(await convertPdfToHtml('file.pdf', new ArrayBuffer(4))).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/common/__tests__/html-converters.test.ts`
Expected: FAIL — cannot resolve `#/common/html-converters`.

- [ ] **Step 3: Create the implementation**

Create `src/common/html-converters.ts`:

```ts
import mammoth from 'mammoth';
import { generateText } from 'ai';

/** Convert a .docx buffer to HTML. Fails soft to ''. */
export async function convertWordToHtml(buffer: Buffer): Promise<string> {
  try {
    const { value } = await mammoth.convertToHtml({ buffer });
    return value;
  } catch (error) {
    console.error('Error converting Word to HTML:', error);
    return '';
  }
}

/**
 * Convert a PDF (as ArrayBuffer) to semantic HTML using the gateway LLM.
 * Model string form routes through the Vercel AI Gateway (same as the rest of
 * this repo's AI calls). Fails soft to ''.
 */
export async function convertPdfToHtml(
  fileName: string,
  arrayBuffer: ArrayBuffer,
): Promise<string> {
  try {
    const { text = '' } = await generateText({
      model: 'google/gemini-2.5-flash',
      system: `You are a helpful assistant that converts PDF to HTML.
Ignore all images and color/style formatting. Keep semantic formatting.
Headings as <h1>..<h6>, paragraphs as <p>, lists as <ul>/<li>, code as <code>,
blockquotes as <blockquote>, links as <a>, tables as <table>/<tr>/<td>/<th>.
Omit images. Include all text. Remove extra spaces and new lines.
Use '${fileName}' as the title of the html.`,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'file', data: arrayBuffer, mediaType: 'application/pdf' },
          ],
        },
      ],
    });
    return text.trim();
  } catch (error) {
    console.error('Error converting PDF to HTML:', error);
    return '';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/common/__tests__/html-converters.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
git add src/common/html-converters.ts src/common/__tests__/html-converters.test.ts
git commit -m "feat: docx/pdf to html converters for rag ingestion"
```

---

### Task 6: Request schemas (`ai-rag-schemas.ts`)

zod v4 schemas for the POST discriminated union, GET query, DELETE body.

**Files:**
- Create: `src/lib/ai-rag-schemas.ts`
- Test: `src/lib/__tests__/ai-rag-schemas.test.ts`

**Interfaces:**
- Produces:
  - `aiRagPostSchema` → union of `{ mode: 'text', courseId?: number, sourcePath: string, html: string }` and `{ mode: 'file', courseId?: number, url: string, fileName: string, mimeType: string }`
  - `aiRagDeleteSchema` → `{ courseId?: number, sourcePath: string }`
  - `parseCourseIdParam(raw: string | null): number | null | undefined` — `undefined` = invalid, `null` = omitted (org-wide), number = valid id. (Used by GET.)
  - Exported types `AiRagPostInput`, `AiRagDeleteInput`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/ai-rag-schemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  aiRagPostSchema,
  aiRagDeleteSchema,
  parseCourseIdParam,
} from '#/lib/ai-rag-schemas';

describe('aiRagPostSchema', () => {
  it('accepts text mode without courseId', () => {
    const r = aiRagPostSchema.safeParse({
      mode: 'text',
      sourcePath: 'doc-1',
      html: '<p>hello world this is long enough</p>',
    });
    expect(r.success).toBe(true);
  });
  it('accepts file mode with courseId', () => {
    const r = aiRagPostSchema.safeParse({
      mode: 'file',
      courseId: 3,
      url: 'https://blob.vercel-storage.com/x.pdf',
      fileName: 'x.pdf',
      mimeType: 'application/pdf',
    });
    expect(r.success).toBe(true);
  });
  it('rejects text mode missing html', () => {
    const r = aiRagPostSchema.safeParse({ mode: 'text', sourcePath: 'd' });
    expect(r.success).toBe(false);
  });
  it('rejects unknown mode', () => {
    const r = aiRagPostSchema.safeParse({ mode: 'nope' });
    expect(r.success).toBe(false);
  });
  it('rejects non-positive courseId', () => {
    const r = aiRagPostSchema.safeParse({
      mode: 'text',
      courseId: 0,
      sourcePath: 'd',
      html: 'x'.repeat(30),
    });
    expect(r.success).toBe(false);
  });
});

describe('aiRagDeleteSchema', () => {
  it('requires sourcePath', () => {
    expect(aiRagDeleteSchema.safeParse({ courseId: 1 }).success).toBe(false);
    expect(aiRagDeleteSchema.safeParse({ sourcePath: 'd' }).success).toBe(true);
  });
});

describe('parseCourseIdParam', () => {
  it('returns null when omitted', () => {
    expect(parseCourseIdParam(null)).toBeNull();
  });
  it('returns the number when valid', () => {
    expect(parseCourseIdParam('4')).toBe(4);
  });
  it('returns undefined when invalid', () => {
    expect(parseCourseIdParam('abc')).toBeUndefined();
    expect(parseCourseIdParam('0')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/__tests__/ai-rag-schemas.test.ts`
Expected: FAIL — cannot resolve `#/lib/ai-rag-schemas`.

- [ ] **Step 3: Create the implementation**

Create `src/lib/ai-rag-schemas.ts`:

```ts
import { z } from 'zod';

const courseId = z.number().int().positive().optional();

const textMode = z.object({
  mode: z.literal('text'),
  courseId,
  sourcePath: z.string().min(1),
  html: z.string().min(1),
});

const fileMode = z.object({
  mode: z.literal('file'),
  courseId,
  url: z.string().url(),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
});

export const aiRagPostSchema = z.discriminatedUnion('mode', [textMode, fileMode]);
export type AiRagPostInput = z.infer<typeof aiRagPostSchema>;

export const aiRagDeleteSchema = z.object({
  courseId,
  sourcePath: z.string().min(1),
});
export type AiRagDeleteInput = z.infer<typeof aiRagDeleteSchema>;

/**
 * Parse the `?courseId=` query param.
 * - `null`  → omitted → org-wide (course_id IS NULL)
 * - number  → a valid positive id
 * - `undefined` → present but invalid (caller should 400)
 */
export function parseCourseIdParam(
  raw: string | null,
): number | null | undefined {
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/__tests__/ai-rag-schemas.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai-rag-schemas.ts src/lib/__tests__/ai-rag-schemas.test.ts
git commit -m "feat: request schemas for /ai-rag"
```

---

### Task 7: DB helpers (`db/docs.ts`) + the route (`ai-rag.ts`)

The route ties everything together: admin gate, validation, course validation, dispatch to text/file pipelines, GET listing, DELETE with blob cleanup. `db/docs.ts` holds the course-scoped queries used by GET/DELETE (the route tests mock it).

**Files:**
- Create: `src/db/docs.ts`
- Create: `src/routes/api/ai-rag.ts`
- Test: `src/routes/api/__tests__/ai-rag.test.ts`

**Interfaces:**
- `db/docs.ts` consumes: `db` from `#/db`; `docs`, `docURLs`, `coursesTable` from `#/db/schema`; `and`, `eq`, `isNull`, `count` from `drizzle-orm`.
- `db/docs.ts` produces:
  - `courseExists(courseId: number): Promise<boolean>`
  - `listDocsBySource(courseId: number | null): Promise<{ sourcePath: string; count: number }[]>`
  - `deleteDocsBySource(courseId: number | null, sourcePath: string): Promise<void>`
  - `getDocUrls(courseId: number | null, sourcePath: string): Promise<{ url: string | null }[]>`
  - `deleteDocUrls(courseId: number | null, sourcePath: string): Promise<void>`
  - `upsertDocUrl(courseId: number | null, sourcePath: string, url: string): Promise<void>`
- Route consumes: everything above + `generateHTMLEmbeddings` (`#/ai/embeddings`), `convertWordToHtml`/`convertPdfToHtml` (`#/common/html-converters`), `requireAdmin`/`ForbiddenError` (`#/lib/admin-functions.server`), `aiRagPostSchema`/`aiRagDeleteSchema`/`parseCourseIdParam` (`#/lib/ai-rag-schemas`), `del` (`@vercel/blob`).
- Route produces (exported for tests): `addEmbeddingsHandler(request)`, `listEmbeddingsHandler(request)`, `deleteEmbeddingsHandler(request)`, and `Route`.

- [ ] **Step 1: Write the failing test**

Create `src/routes/api/__tests__/ai-rag.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  class ForbiddenError extends Error {
    constructor() {
      super('Forbidden');
      this.name = 'ForbiddenError';
    }
  }
  return {
    ForbiddenError,
    requireAdmin: vi.fn(),
    generateHTMLEmbeddings: vi.fn(),
    convertWordToHtml: vi.fn(),
    convertPdfToHtml: vi.fn(),
    courseExists: vi.fn(),
    listDocsBySource: vi.fn(),
    deleteDocsBySource: vi.fn(),
    getDocUrls: vi.fn(),
    deleteDocUrls: vi.fn(),
    upsertDocUrl: vi.fn(),
    del: vi.fn(),
    fetchMock: vi.fn(),
  };
});

vi.mock('#/lib/admin-functions.server', () => ({
  requireAdmin: mocks.requireAdmin,
  ForbiddenError: mocks.ForbiddenError,
}));
vi.mock('#/ai/embeddings', () => ({ generateHTMLEmbeddings: mocks.generateHTMLEmbeddings }));
vi.mock('#/common/html-converters', () => ({
  convertWordToHtml: mocks.convertWordToHtml,
  convertPdfToHtml: mocks.convertPdfToHtml,
}));
vi.mock('#/db/docs', () => ({
  courseExists: mocks.courseExists,
  listDocsBySource: mocks.listDocsBySource,
  deleteDocsBySource: mocks.deleteDocsBySource,
  getDocUrls: mocks.getDocUrls,
  deleteDocUrls: mocks.deleteDocUrls,
  upsertDocUrl: mocks.upsertDocUrl,
}));
vi.mock('@vercel/blob', () => ({ del: mocks.del }));

import {
  addEmbeddingsHandler,
  listEmbeddingsHandler,
  deleteEmbeddingsHandler,
} from '../ai-rag';

const LONG = 'x'.repeat(40);
function post(body: unknown): Request {
  return new Request('http://test/api/ai-rag', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ userId: 'u1', roles: ['admin'] });
  mocks.generateHTMLEmbeddings.mockResolvedValue({ chunks: 3 });
  mocks.courseExists.mockResolvedValue(true);
  vi.stubGlobal('fetch', mocks.fetchMock);
});

describe('addEmbeddingsHandler (POST)', () => {
  it('403 when not admin', async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new mocks.ForbiddenError());
    const res = await addEmbeddingsHandler(post({ mode: 'text', sourcePath: 'd', html: LONG }));
    expect(res.status).toBe(403);
    expect(mocks.generateHTMLEmbeddings).not.toHaveBeenCalled();
  });

  it('400 on invalid JSON', async () => {
    const bad = new Request('http://test/api/ai-rag', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect((await addEmbeddingsHandler(bad)).status).toBe(400);
  });

  it('400 on schema failure', async () => {
    expect((await addEmbeddingsHandler(post({ mode: 'text' }))).status).toBe(400);
  });

  it('400 when courseId does not exist', async () => {
    mocks.courseExists.mockResolvedValueOnce(false);
    const res = await addEmbeddingsHandler(
      post({ mode: 'text', courseId: 99, sourcePath: 'd', html: LONG }),
    );
    expect(res.status).toBe(400);
    expect(mocks.generateHTMLEmbeddings).not.toHaveBeenCalled();
  });

  it('text mode → embeds and returns chunks', async () => {
    const res = await addEmbeddingsHandler(
      post({ mode: 'text', courseId: 2, sourcePath: 'doc-1', html: LONG }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, sourcePath: 'doc-1', chunks: 3 });
    expect(mocks.generateHTMLEmbeddings).toHaveBeenCalledWith({
      courseId: 2,
      sourcePath: 'doc-1',
      html: LONG,
    });
  });

  it('file mode (docx) → fetches, converts, embeds, records url', async () => {
    mocks.fetchMock.mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(8) });
    mocks.convertWordToHtml.mockResolvedValue(LONG);
    const res = await addEmbeddingsHandler(
      post({
        mode: 'file',
        courseId: 2,
        url: 'https://blob.vercel-storage.com/x.docx',
        fileName: 'x.docx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    );
    expect(res.status).toBe(200);
    expect(mocks.convertWordToHtml).toHaveBeenCalled();
    expect(mocks.generateHTMLEmbeddings).toHaveBeenCalledWith({
      courseId: 2,
      sourcePath: 'file-x.docx',
      html: LONG,
    });
    expect(mocks.upsertDocUrl).toHaveBeenCalledWith(
      2,
      'file-x.docx',
      'https://blob.vercel-storage.com/x.docx',
    );
  });

  it('file mode invalid mimeType → 400', async () => {
    mocks.fetchMock.mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(8) });
    const res = await addEmbeddingsHandler(
      post({
        mode: 'file',
        url: 'https://x/y.txt',
        fileName: 'y.txt',
        mimeType: 'text/plain',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('empty extracted text → 400', async () => {
    mocks.generateHTMLEmbeddings.mockResolvedValueOnce({ chunks: 0 });
    const res = await addEmbeddingsHandler(
      post({ mode: 'text', sourcePath: 'd', html: LONG }),
    );
    expect(res.status).toBe(400);
  });
});

describe('listEmbeddingsHandler (GET)', () => {
  it('403 when not admin', async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new mocks.ForbiddenError());
    const res = await listEmbeddingsHandler(new Request('http://test/api/ai-rag'));
    expect(res.status).toBe(403);
  });

  it('400 on invalid courseId param', async () => {
    const res = await listEmbeddingsHandler(
      new Request('http://test/api/ai-rag?courseId=abc'),
    );
    expect(res.status).toBe(400);
  });

  it('returns docs grouped by source (org-wide when omitted)', async () => {
    mocks.listDocsBySource.mockResolvedValue([{ sourcePath: 'd', count: 5 }]);
    const res = await listEmbeddingsHandler(new Request('http://test/api/ai-rag'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ docsBySource: [{ sourcePath: 'd', count: 5 }] });
    expect(mocks.listDocsBySource).toHaveBeenCalledWith(null);
  });
});

describe('deleteEmbeddingsHandler (DELETE)', () => {
  it('403 when not admin', async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new mocks.ForbiddenError());
    const res = await deleteEmbeddingsHandler(
      new Request('http://test/api/ai-rag', { method: 'DELETE', body: '{}' }),
    );
    expect(res.status).toBe(403);
  });

  it('400 when sourcePath missing', async () => {
    const res = await deleteEmbeddingsHandler(
      new Request('http://test/api/ai-rag', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ courseId: 1 }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('deletes docs, blob, and doc_urls', async () => {
    mocks.getDocUrls.mockResolvedValue([
      { url: 'https://blob.vercel-storage.com/x.pdf' },
      { url: 'https://example.com/not-blob' },
    ]);
    const res = await deleteEmbeddingsHandler(
      new Request('http://test/api/ai-rag', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ courseId: 2, sourcePath: 'file-x.pdf' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(mocks.deleteDocsBySource).toHaveBeenCalledWith(2, 'file-x.pdf');
    expect(mocks.del).toHaveBeenCalledTimes(1); // only the vercel blob url
    expect(mocks.del).toHaveBeenCalledWith('https://blob.vercel-storage.com/x.pdf');
    expect(mocks.deleteDocUrls).toHaveBeenCalledWith(2, 'file-x.pdf');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/routes/api/__tests__/ai-rag.test.ts`
Expected: FAIL — cannot resolve `../ai-rag`.

- [ ] **Step 3: Create the DB helpers**

Create `src/db/docs.ts`:

```ts
import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from '#/db';
import { docs, docURLs, coursesTable } from '#/db/schema';

function courseFilter(col: typeof docs.courseId, courseId: number | null) {
  return courseId === null ? isNull(col) : eq(col, courseId);
}

export async function courseExists(courseId: number): Promise<boolean> {
  const rows = await db
    .select({ id: coursesTable.id })
    .from(coursesTable)
    .where(eq(coursesTable.id, courseId))
    .limit(1);
  return rows.length > 0;
}

export async function listDocsBySource(
  courseId: number | null,
): Promise<{ sourcePath: string; count: number }[]> {
  return db
    .select({ sourcePath: docs.sourcePath, count: count() })
    .from(docs)
    .where(courseFilter(docs.courseId, courseId))
    .groupBy(docs.sourcePath)
    .orderBy(docs.sourcePath);
}

export async function deleteDocsBySource(
  courseId: number | null,
  sourcePath: string,
): Promise<void> {
  await db
    .delete(docs)
    .where(and(eq(docs.sourcePath, sourcePath), courseFilter(docs.courseId, courseId)));
}

export async function getDocUrls(
  courseId: number | null,
  sourcePath: string,
): Promise<{ url: string | null }[]> {
  return db
    .select({ url: docURLs.url })
    .from(docURLs)
    .where(
      and(eq(docURLs.sourcePath, sourcePath), courseFilter(docURLs.courseId, courseId)),
    );
}

export async function deleteDocUrls(
  courseId: number | null,
  sourcePath: string,
): Promise<void> {
  await db
    .delete(docURLs)
    .where(
      and(eq(docURLs.sourcePath, sourcePath), courseFilter(docURLs.courseId, courseId)),
    );
}

export async function upsertDocUrl(
  courseId: number | null,
  sourcePath: string,
  url: string,
): Promise<void> {
  await db
    .insert(docURLs)
    .values({ courseId, sourcePath, url })
    .onConflictDoNothing();
}
```

- [ ] **Step 4: Create the route**

Create `src/routes/api/ai-rag.ts`:

```ts
import { createFileRoute } from '@tanstack/react-router';
import { del } from '@vercel/blob';
import { ForbiddenError, requireAdmin } from '#/lib/admin-functions.server';
import {
  aiRagPostSchema,
  aiRagDeleteSchema,
  parseCourseIdParam,
} from '#/lib/ai-rag-schemas';
import { generateHTMLEmbeddings } from '#/ai/embeddings';
import { convertWordToHtml, convertPdfToHtml } from '#/common/html-converters';
import {
  courseExists,
  listDocsBySource,
  deleteDocsBySource,
  getDocUrls,
  deleteDocUrls,
  upsertDocUrl,
} from '#/db/docs';

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function guard(request: Request): Promise<Response | null> {
  try {
    await requireAdmin(request.headers);
    return null;
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }
}

export async function addEmbeddingsHandler(request: Request): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = aiRagPostSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  const courseId = input.courseId ?? null;

  if (courseId !== null && !(await courseExists(courseId))) {
    return Response.json({ error: 'Course not found' }, { status: 400 });
  }

  let sourcePath: string;
  let html: string;

  if (input.mode === 'text') {
    sourcePath = input.sourcePath;
    html = input.html;
  } else {
    const file = await fetch(input.url);
    const arrayBuffer = await file.arrayBuffer();
    if (input.mimeType === 'application/pdf') {
      html = await convertPdfToHtml(input.fileName, arrayBuffer);
    } else if (input.mimeType === DOCX_MIME) {
      html = await convertWordToHtml(Buffer.from(arrayBuffer));
    } else {
      return Response.json(
        { error: 'Invalid file type. Upload a .pdf or .docx file.' },
        { status: 400 },
      );
    }
    sourcePath = `file-${input.fileName}`;
  }

  const { chunks } = await generateHTMLEmbeddings({ courseId, sourcePath, html });

  if (chunks === 0) {
    return Response.json(
      { error: 'No text was extracted from the document.' },
      { status: 400 },
    );
  }

  if (input.mode === 'file') {
    await upsertDocUrl(courseId, sourcePath, input.url);
  }

  return Response.json({ success: true, sourcePath, chunks });
}

export async function listEmbeddingsHandler(request: Request): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;

  const raw = new URL(request.url).searchParams.get('courseId');
  const courseId = parseCourseIdParam(raw);
  if (courseId === undefined) {
    return Response.json({ error: 'Invalid course id' }, { status: 400 });
  }

  const docsBySource = await listDocsBySource(courseId);
  return Response.json({ docsBySource });
}

export async function deleteEmbeddingsHandler(
  request: Request,
): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = aiRagDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const courseId = parsed.data.courseId ?? null;
  const { sourcePath } = parsed.data;

  await deleteDocsBySource(courseId, sourcePath);

  const urls = await getDocUrls(courseId, sourcePath);
  for (const row of urls) {
    if (row.url && row.url.includes('vercel')) {
      await del(row.url);
    }
  }
  await deleteDocUrls(courseId, sourcePath);

  return Response.json({
    success: true,
    message: `Deleted embeddings for ${sourcePath}`,
  });
}

export const Route = createFileRoute('/api/ai-rag')({
  server: {
    handlers: {
      POST: ({ request }) => addEmbeddingsHandler(request),
      GET: ({ request }) => listEmbeddingsHandler(request),
      DELETE: ({ request }) => deleteEmbeddingsHandler(request),
    },
  },
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/routes/api/__tests__/ai-rag.test.ts`
Expected: PASS (all cases). If TanStack complains that `createFileRoute('/api/ai-rag')` isn't in the generated route tree, run `pnpm exec tsr generate` (or start the dev server once) to regenerate `routeTree.gen.ts`; the handler tests import the handlers directly and don't need the tree, but typecheck does.

- [ ] **Step 6: Typecheck the whole feature**

Run: `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "ai-rag|db/docs|embeddings|html-converters|gemini" || echo "clean"`
Expected: `clean`.

- [ ] **Step 7: Commit**

```bash
git add src/db/docs.ts src/routes/api/ai-rag.ts src/routes/api/__tests__/ai-rag.test.ts
git commit -m "feat(api): /ai-rag course-scoped embeddings ingest/list/delete"
```

(If `routeTree.gen.ts` was regenerated and you want it tracked, add it explicitly in its own commit — it is generated, not user working-state.)

---

### Task 8: Full suite green + lint

- [ ] **Step 1: Run the whole test suite**

Run: `pnpm test`
Expected: all tests pass, including the new files. Fix any regressions before continuing.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no new errors in the created files.

- [ ] **Step 3: Manual smoke (optional, requires real `GOOGLE_GENERATIVE_AI_API_KEY`)**

Start the dev server, then POST text mode:

```bash
curl -sS -X POST http://localhost:3000/api/ai-rag \
  -H 'content-type: application/json' \
  --cookie "<admin session cookie>" \
  -d '{"mode":"text","courseId":<id>,"sourcePath":"smoke-1","html":"<p>'"$(printf 'word %.0s' {1..80})"'</p>"}'
```

Expected: `{"success":true,"sourcePath":"smoke-1","chunks":N}`. Then `DELETE` the same `sourcePath` to clean up.

---

## Notes for the implementer

- **`db:push` rename prompt:** Task 1 changes `doc_urls`. If a non-TTY `db:push` errors on a rename prompt, use the direct DDL in Task 1 Step 2 (the table is empty).
- **Model string routing:** `convertPdfToHtml` passes `model: 'google/gemini-2.5-flash'` as a bare string — this repo routes model strings through the Vercel AI Gateway (see `src/ai/generate-lesson-material.ts`). No `@ai-sdk/gateway` import needed.
- **Embeddings via `@ai-sdk/google` directly** (not the gateway) to guarantee the exact `gemini-embedding-001` 3072-dim output that matches the 6248 migrated rows.
- **Do not commit** `package.json`, `pnpm-lock.yaml`, `src/env.ts`, `src/db/schema.ts`, or `.env*` — they carry the user's in-flight working-state. Commit only the new feature files listed per task.
