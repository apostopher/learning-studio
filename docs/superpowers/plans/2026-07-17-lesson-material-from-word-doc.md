# Lesson Material from a Word Doc — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin upload a `.docx` lesson document, have the Vercel AI Gateway extract structured `CourseLessonMaterial`, edit it in a form, and save it to `lessonMaterialTable` — inside the lesson-config dialog's new Material tab.

**Architecture:** A guarded parse route converts docx→HTML (mammoth) and runs it through `generateText` + `Output.object` on Haiku (via the AI Gateway). The Material tab loads any existing material into a react-hook-form; uploading a doc resets the form with the parsed result; saving POSTs to a guarded upsert route that delete+inserts the material row in a transaction. Presentational form fields are pure and prop-driven (arrays via `Controller`); the container owns `useForm` and the data hooks.

**Tech Stack:** TanStack Start, `ai` v6 + Vercel AI Gateway, `mammoth`, Drizzle + Postgres, Zod v4, Jotai, TanStack Query, react-hook-form 7.80 + `@hookform/resolvers` 5.4, Base UI + lucide, Tailwind (Radix tokens), Vitest, Biome, pnpm.

## Global Constraints

- **Package manager:** pnpm. Install with `pnpm add mammoth@latest`.
- **Model:** `haiku` from `src/ai/ai-provider.ts`. Never hard-code the string.
- **AI Gateway:** implicit via the model-id string; auth `AI_GATEWAY_API_KEY` (already in `.env`). No `@ai-sdk/gateway`.
- **Output format:** prose fields (`text`, `keyPoints`, `proTips`, `assignments`, `jobOfTheDay`) are **HTML**; quiz `question`/option `value` are **markdown**.
- **Admin guard:** every admin route calls `requireAdmin(request.headers)` → `ForbiddenError` → 403, via the sibling `guard(request)` helper.
- **Form-design:** visible label per field (no placeholder-as-label); Save always enabled; validate on submit (`zodResolver`); errors shown inline and kept visible; conventional controls (textareas, inputs, add/remove rows, radio group for the correct quiz option); server-error alert on save failure.
- **Presentational purity:** presentational components are pure prop-driven functions built on Base UI where possible. Array fields are driven from the container via RHF `Controller` (`value`/`onChange`) so the field components hold no RHF hooks. Logical CSS properties only (`ms-*`/`me-*`, `ps-*`/`pe-*`, `text-start`, `inset-inline-*`).
- **Lint/format:** Biome — `pnpm exec biome check --write <files>` before each commit. Tests: `pnpm exec vitest run <path>`. Typecheck: `pnpm exec tsc --noEmit`.
- **Uncommitted user files:** `package.json`, `src/db/schema.ts`, `CLAUDE.md` carry the user's unrelated edits. NEVER `git add -A`/`git add .`. Stage only this feature's explicit paths. Do NOT edit `schema.ts` (persistence uses delete+insert — no migration). The mammoth install touches `package.json` + `pnpm-lock.yaml` — see Task 2's dep-dance.
- **Import alias:** `@/…` (and `#/…`) both map to `./src/…`; match the file being edited (db files use `#/db`).

---

### Task 1: `LessonMaterialGenerationSchema`

**Files:**
- Modify: `src/types.ts` (after `CourseLessonMaterial` type, ~line 110)
- Test: `src/__tests__/lesson-material-generation-schema.test.ts` (create)

**Interfaces:**
- Consumes: `CourseLessonMaterialSchema` in `src/types.ts`.
- Produces: `LessonMaterialGenerationSchema` (Zod) and type `LessonMaterialGeneration` = the material minus `id`: `{ text: string; keyPoints: string[]; proTips: string; quiz: CourseLessonQuiz; links?: string[]; assignments?: string; jobOfTheDay?: string; attachments?: string[] }`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/lesson-material-generation-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LessonMaterialGenerationSchema } from "../types";

describe("LessonMaterialGenerationSchema", () => {
  it("accepts a full material object without an id", () => {
    const parsed = LessonMaterialGenerationSchema.safeParse({
      text: "<p>Intro</p>",
      keyPoints: ["<p>Point 1</p>"],
      proTips: "<p>Tip</p>",
      quiz: [
        {
          id: "q1",
          question: "What is lift?",
          options: [
            { id: "a", value: "Up" },
            { id: "b", value: "Down" },
          ],
          correctOptionId: "a",
        },
      ],
      links: ["https://example.com"],
    });
    expect(parsed.success).toBe(true);
  });

  it("strips an id if present (omitted from the shape)", () => {
    const parsed = LessonMaterialGenerationSchema.safeParse({
      id: 1,
      text: "<p>x</p>",
      keyPoints: [],
      proTips: "",
      quiz: [],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && "id" in parsed.data).toBe(false);
  });

  it("rejects a missing required text field", () => {
    const parsed = LessonMaterialGenerationSchema.safeParse({
      keyPoints: [],
      proTips: "",
      quiz: [],
    });
    expect(parsed.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/__tests__/lesson-material-generation-schema.test.ts`
Expected: FAIL — `LessonMaterialGenerationSchema` not exported.

- [ ] **Step 3: Add the schema**

In `src/types.ts`, immediately after the `CourseLessonMaterial` type (~line 110):

```ts
/**
 * Shape the docx parser returns and the edit form uses — the canonical lesson
 * material minus the DB `id`. Prose fields are HTML; quiz question/option
 * values are markdown (see the quiz schema).
 */
export const LessonMaterialGenerationSchema = CourseLessonMaterialSchema.omit({
  id: true,
});
export type LessonMaterialGeneration = z.infer<
  typeof LessonMaterialGenerationSchema
>;
```

(`z` is already imported at the top of `src/types.ts`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/__tests__/lesson-material-generation-schema.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Format + commit**

```bash
pnpm exec biome check --write src/types.ts src/__tests__/lesson-material-generation-schema.test.ts
git add src/types.ts src/__tests__/lesson-material-generation-schema.test.ts
git commit -m "feat(types): add LessonMaterialGenerationSchema"
```

---

### Task 2: `wordToHtml` (+ mammoth)

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (via `pnpm add`)
- Create: `src/lib/word-to-html.server.ts`
- Test: `src/lib/__tests__/word-to-html.test.ts`

**Interfaces:**
- Produces: `wordToHtml(buffer: Buffer): Promise<string>` — throws on mammoth failure or empty output.

- [ ] **Step 1: Install mammoth (dep-dance)**

The user has unrelated uncommitted `package.json` edits. Protect them:

```bash
git stash push -- package.json
pnpm add mammoth@latest
git stash pop
```

If `git stash pop` conflicts in `package.json`, keep BOTH the user's edits and the new `"mammoth"` line. Verify: `node -e "console.log(require('mammoth/package.json').version)"`.

- [ ] **Step 2: Write the failing test**

Create `src/lib/__tests__/word-to-html.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const convertToHtml = vi.fn();
vi.mock("mammoth", () => ({ default: { convertToHtml } }));

import { wordToHtml } from "../word-to-html.server";

describe("wordToHtml", () => {
  it("returns mammoth's HTML value", async () => {
    convertToHtml.mockResolvedValueOnce({ value: "<p>Hello</p>", messages: [] });
    const html = await wordToHtml(Buffer.from("fake-docx"));
    expect(html).toBe("<p>Hello</p>");
    expect(convertToHtml).toHaveBeenCalledWith(
      { buffer: expect.any(Buffer) },
      { ignoreEmptyParagraphs: true },
    );
  });

  it("throws when mammoth returns empty output", async () => {
    convertToHtml.mockResolvedValueOnce({ value: "   ", messages: [] });
    await expect(wordToHtml(Buffer.from("x"))).rejects.toThrow(
      /no readable content/i,
    );
  });

  it("throws when mammoth itself fails", async () => {
    convertToHtml.mockRejectedValueOnce(new Error("corrupt zip"));
    await expect(wordToHtml(Buffer.from("x"))).rejects.toThrow(/corrupt zip/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/__tests__/word-to-html.test.ts`
Expected: FAIL — no `wordToHtml` export.

- [ ] **Step 4: Implement**

Create `src/lib/word-to-html.server.ts`:

```ts
import mammoth from "mammoth";

/**
 * Convert a .docx buffer to HTML. Server-only (mammoth uses Node built-ins).
 * Throws on failure or empty output so callers surface a 5xx instead of feeding
 * empty HTML to the model.
 */
export async function wordToHtml(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.convertToHtml(
    { buffer },
    { ignoreEmptyParagraphs: true },
  );
  if (!value || value.trim().length === 0) {
    throw new Error("Word document has no readable content.");
  }
  return value;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/__tests__/word-to-html.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Format + commit (explicit paths)**

```bash
pnpm exec biome check --write src/lib/word-to-html.server.ts src/lib/__tests__/word-to-html.test.ts
git add src/lib/word-to-html.server.ts src/lib/__tests__/word-to-html.test.ts package.json pnpm-lock.yaml
git commit -m "feat(lib): add wordToHtml docx converter (mammoth)"
```

If `git status` shows the user's unrelated `package.json` edits staged, `git restore --staged package.json` then `git add -p package.json` and stage ONLY the `"mammoth"` hunk.

---

### Task 3: Parser prompts

**Files:**
- Create: `src/ai/prompts/lesson-material.ts`
- Test: `src/ai/__tests__/lesson-material-prompt.test.ts`

**Interfaces:**
- Produces: `lessonMaterialSystemPrompt: string`, `lessonMaterialUserPrompt(html: string): string`.

- [ ] **Step 1: Write the failing test**

Create `src/ai/__tests__/lesson-material-prompt.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  lessonMaterialSystemPrompt,
  lessonMaterialUserPrompt,
} from "../prompts/lesson-material";

describe("lesson-material prompts", () => {
  it("states the HTML-prose / markdown-quiz rule and key sections", () => {
    expect(lessonMaterialSystemPrompt).toMatch(/HTML/);
    expect(lessonMaterialSystemPrompt).toMatch(/markdown/i);
    expect(lessonMaterialSystemPrompt).toMatch(/key teaching points/i);
    expect(lessonMaterialSystemPrompt).toMatch(/proTips/);
    expect(lessonMaterialSystemPrompt).toMatch(/quiz/);
  });

  it("embeds the provided html in the user prompt", () => {
    const html = "<h1>Lesson 1</h1><p>Body</p>";
    expect(lessonMaterialUserPrompt(html)).toContain(html);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/ai/__tests__/lesson-material-prompt.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/ai/prompts/lesson-material.ts`:

```ts
export const lessonMaterialSystemPrompt = `
You are a formatter that converts the HTML of a Word lesson document into a
structured JSON lesson-material object. Extract, don't invent — use only what
the document actually contains.

Fields:
- text: HTML string. Everything BEFORE the "10 Key Teaching Points" heading (or
  an equivalent key-points heading). Preserve semantic formatting (headings,
  paragraphs, bold, italic, lists, links).
- keyPoints: array of HTML strings, one per key teaching point. [] if none.
- proTips: HTML string for the Pro Tip section. "" if absent.
- quiz: array of questions. Each: { id: "q1", question: <markdown>, options:
  [{ id: "a", value: <markdown> }, ...], correctOptionId: "a" }. [] if none.
- links: array of URL strings mentioned in the document. Omit if none.
- assignments: HTML string for the assignment section. Omit if none.
- jobOfTheDay: the "Job of the Day" URL only. Omit if none.
- attachments: array of referenced attachment file names. Omit if none.

Rules:
- Prose fields (text, keyPoints, proTips, assignments, jobOfTheDay) are HTML.
  Quiz question and option "value" fields are Markdown.
- Values tagged <None> or empty: omit optional fields; use "" or [] for the
  required text / keyPoints / proTips / quiz fields.
- Format any bare URL inside prose as an <a href="...">...</a> link.
- Return only the structured object, no prose or markdown fences.
`.trim();

export function lessonMaterialUserPrompt(html: string): string {
  return `Here is the extracted HTML from a Word document:\n\n${html}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/ai/__tests__/lesson-material-prompt.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Format + commit**

```bash
pnpm exec biome check --write src/ai/prompts/lesson-material.ts src/ai/__tests__/lesson-material-prompt.test.ts
git add src/ai/prompts/lesson-material.ts src/ai/__tests__/lesson-material-prompt.test.ts
git commit -m "feat(ai): add lesson-material parser prompts"
```

---

### Task 4: `generateLessonMaterial`

**Files:**
- Create: `src/ai/generate-lesson-material.ts`
- Test: `src/ai/__tests__/generate-lesson-material.test.ts`

**Interfaces:**
- Consumes: `haiku` from `./ai-provider`; `LessonMaterialGenerationSchema`/`LessonMaterialGeneration` from `@/types`; prompts from `./prompts/lesson-material`; `generateText`, `Output` from `ai`.
- Produces: `generateLessonMaterial(html: string): Promise<LessonMaterialGeneration>`.

- [ ] **Step 1: Write the failing test**

Create `src/ai/__tests__/generate-lesson-material.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

const generateText = vi.fn();
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateText };
});

import { haiku } from "../ai-provider";
import { generateLessonMaterial } from "../generate-lesson-material";

const sampleOutput = {
  text: "<p>Intro</p>",
  keyPoints: ["<p>Point 1</p>"],
  proTips: "<p>Tip</p>",
  quiz: [],
};

describe("generateLessonMaterial", () => {
  it("calls generateText with haiku and returns its output", async () => {
    generateText.mockResolvedValueOnce({ output: sampleOutput });
    const result = await generateLessonMaterial("<h1>Lesson</h1>");

    expect(result).toEqual(sampleOutput);
    const call = generateText.mock.calls[0][0];
    expect(call.model).toBe(haiku);
    expect(call.system).toMatch(/formatter/i);
    expect(call.prompt).toContain("<h1>Lesson</h1>");
    expect(call.output).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/ai/__tests__/generate-lesson-material.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/ai/generate-lesson-material.ts`:

```ts
import { generateText, Output } from "ai";
import type { LessonMaterialGeneration } from "@/types";
import { LessonMaterialGenerationSchema } from "@/types";
import { haiku } from "./ai-provider";
import {
  lessonMaterialSystemPrompt,
  lessonMaterialUserPrompt,
} from "./prompts/lesson-material";

/**
 * Turn a lesson document's HTML into structured lesson material using Haiku via
 * the Vercel AI Gateway. Output is validated against the schema by the AI SDK's
 * structured-output mode.
 */
export async function generateLessonMaterial(
  html: string,
): Promise<LessonMaterialGeneration> {
  const { output } = await generateText({
    model: haiku,
    output: Output.object({ schema: LessonMaterialGenerationSchema }),
    system: lessonMaterialSystemPrompt,
    prompt: lessonMaterialUserPrompt(html),
  });
  return output;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/ai/__tests__/generate-lesson-material.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Format + commit**

```bash
pnpm exec biome check --write src/ai/generate-lesson-material.ts src/ai/__tests__/generate-lesson-material.test.ts
git add src/ai/generate-lesson-material.ts src/ai/__tests__/generate-lesson-material.test.ts
git commit -m "feat(ai): add generateLessonMaterial via AI Gateway (Haiku)"
```

---

### Task 5: Parse route `/api/admin/lesson-material/parse`

**Files:**
- Create: `src/routes/api/admin/lesson-material.parse.ts`
- Test: `src/routes/api/admin/__tests__/lesson-material-parse.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `ForbiddenError` from `@/lib/admin-functions.server`; `wordToHtml` from `@/lib/word-to-html.server`; `generateLessonMaterial` from `@/ai/generate-lesson-material`.
- Produces: exported `parseLessonMaterialHandler(request: Request): Promise<Response>` + the `Route`.

- [ ] **Step 1: Write the failing test**

Create `src/routes/api/admin/__tests__/lesson-material-parse.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/lib/admin-functions.server";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin-functions.server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/admin-functions.server")>();
  return { ...actual, requireAdmin };
});
const wordToHtml = vi.fn();
vi.mock("@/lib/word-to-html.server", () => ({ wordToHtml }));
const generateLessonMaterial = vi.fn();
vi.mock("@/ai/generate-lesson-material", () => ({ generateLessonMaterial }));

import { parseLessonMaterialHandler } from "../lesson-material.parse";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function requestWith(file: File | null): Request {
  const form = new FormData();
  if (file) form.append("file", file);
  return new Request("http://test/api/admin/lesson-material/parse", {
    method: "POST",
    body: form,
  });
}

describe("parseLessonMaterialHandler", () => {
  it("returns 403 for a non-admin", async () => {
    requireAdmin.mockRejectedValueOnce(new ForbiddenError());
    expect((await parseLessonMaterialHandler(requestWith(null))).status).toBe(
      403,
    );
  });

  it("returns 400 for a non-docx file", async () => {
    requireAdmin.mockResolvedValueOnce({ userId: "u1", roles: ["admin"] });
    const file = new File(["hi"], "notes.txt", { type: "text/plain" });
    expect((await parseLessonMaterialHandler(requestWith(file))).status).toBe(
      400,
    );
  });

  it("returns 400 when no file is provided", async () => {
    requireAdmin.mockResolvedValueOnce({ userId: "u1", roles: ["admin"] });
    expect((await parseLessonMaterialHandler(requestWith(null))).status).toBe(
      400,
    );
  });

  it("converts, generates, and returns parsed material", async () => {
    requireAdmin.mockResolvedValueOnce({ userId: "u1", roles: ["admin"] });
    wordToHtml.mockResolvedValueOnce("<p>Body</p>");
    const material = { text: "<p>Body</p>", keyPoints: [], proTips: "", quiz: [] };
    generateLessonMaterial.mockResolvedValueOnce(material);
    const file = new File(["bytes"], "lesson.docx", { type: DOCX_MIME });

    const res = await parseLessonMaterialHandler(requestWith(file));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(material);
    expect(generateLessonMaterial).toHaveBeenCalledWith("<p>Body</p>");
  });

  it("returns 500 when generation throws", async () => {
    requireAdmin.mockResolvedValueOnce({ userId: "u1", roles: ["admin"] });
    wordToHtml.mockResolvedValueOnce("<p>Body</p>");
    generateLessonMaterial.mockRejectedValueOnce(new Error("model down"));
    const file = new File(["bytes"], "lesson.docx", { type: DOCX_MIME });
    expect((await parseLessonMaterialHandler(requestWith(file))).status).toBe(
      500,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/routes/api/admin/__tests__/lesson-material-parse.test.ts`
Expected: FAIL — no `parseLessonMaterialHandler` export.

- [ ] **Step 3: Implement**

Create `src/routes/api/admin/lesson-material.parse.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";
import { generateLessonMaterial } from "@/ai/generate-lesson-material";
import { ForbiddenError, requireAdmin } from "@/lib/admin-functions.server";
import { wordToHtml } from "@/lib/word-to-html.server";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
/** Vercel serverless request bodies cap at ~4.5 MB; stay under it. */
const MAX_SIZE_BYTES = 4 * 1024 * 1024;

/**
 * Parse an uploaded .docx into structured lesson material for admin review.
 * Does NOT persist. Exported for unit tests; the Route below wraps it.
 */
export async function parseLessonMaterialHandler(
  request: Request,
): Promise<Response> {
  try {
    await requireAdmin(request.headers);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response("Forbidden", { status: 403 });
    }
    throw error;
  }

  let file: File | null;
  try {
    const value = (await request.formData()).get("file");
    file = value instanceof File ? value : null;
  } catch {
    return Response.json(
      { error: "Expected multipart form data." },
      { status: 400 },
    );
  }

  if (!file || file.type !== DOCX_MIME) {
    return Response.json(
      { error: "Please upload a .docx Word document." },
      { status: 400 },
    );
  }
  if (file.size > MAX_SIZE_BYTES) {
    return Response.json(
      { error: "File too large. Maximum size is 4 MB." },
      { status: 400 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const html = await wordToHtml(buffer);
    const material = await generateLessonMaterial(html);
    return Response.json(material);
  } catch (error) {
    console.error("Failed to parse lesson material:", error);
    return Response.json(
      { error: "Failed to parse the document. Please try again." },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute("/api/admin/lesson-material/parse")({
  server: {
    handlers: { POST: ({ request }) => parseLessonMaterialHandler(request) },
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/routes/api/admin/__tests__/lesson-material-parse.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Regenerate the route tree + typecheck**

Run: `pnpm exec tsr generate` (or start `pnpm dev` briefly to let the router plugin regenerate `src/routeTree.gen.ts`, then stop it).
Run: `pnpm exec tsc --noEmit`
Expected: `src/routeTree.gen.ts` references `lesson-material/parse`; no type errors.

- [ ] **Step 6: Format + commit**

```bash
pnpm exec biome check --write src/routes/api/admin/lesson-material.parse.ts src/routes/api/admin/__tests__/lesson-material-parse.test.ts
git add src/routes/api/admin/lesson-material.parse.ts src/routes/api/admin/__tests__/lesson-material-parse.test.ts src/routeTree.gen.ts
git commit -m "feat(api): add guarded /api/admin/lesson-material/parse route"
```

---

### Task 6: `useParseLessonMaterial` hook

**Files:**
- Create: `src/data-hooks/use-parse-lesson-material.ts`
- Test: `src/data-hooks/__tests__/use-parse-lesson-material.test.tsx`

**Interfaces:**
- Consumes: `LessonMaterialGenerationSchema`/`LessonMaterialGeneration` from `@/types`.
- Produces: `useParseLessonMaterial()` → mutation with `mutateAsync(file: File): Promise<LessonMaterialGeneration>`.

- [ ] **Step 1: Write the failing test**

Create `src/data-hooks/__tests__/use-parse-lesson-material.test.tsx`:

```tsx
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useParseLessonMaterial } from "../use-parse-lesson-material";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
afterEach(() => vi.restoreAllMocks());

const material = { text: "<p>x</p>", keyPoints: [], proTips: "", quiz: [] };

describe("useParseLessonMaterial", () => {
  it("posts the file as multipart and returns parsed material", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(material), { status: 200 }));
    const { result } = renderHook(() => useParseLessonMaterial(), { wrapper });

    let returned: unknown;
    await act(async () => {
      returned = await result.current.mutateAsync(new File(["b"], "l.docx"));
    });

    expect(returned).toEqual(material);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/lesson-material/parse");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeInstanceOf(FormData);
  });

  it("throws on a non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 400 }),
    );
    const { result } = renderHook(() => useParseLessonMaterial(), { wrapper });
    await expect(
      result.current.mutateAsync(new File(["x"], "a.docx")),
    ).rejects.toThrow(/400/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/data-hooks/__tests__/use-parse-lesson-material.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/data-hooks/use-parse-lesson-material.ts`:

```ts
import { useMutation } from "@tanstack/react-query";
import type { LessonMaterialGeneration } from "@/types";
import { LessonMaterialGenerationSchema } from "@/types";

/** Upload a .docx and get back structured lesson material for review. */
export function useParseLessonMaterial() {
  return useMutation<LessonMaterialGeneration, Error, File>({
    mutationFn: async (file) => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/lesson-material/parse", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        throw new Error(`Failed to parse lesson material (${res.status})`);
      }
      return LessonMaterialGenerationSchema.parse(await res.json());
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/data-hooks/__tests__/use-parse-lesson-material.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Format + commit**

```bash
pnpm exec biome check --write src/data-hooks/use-parse-lesson-material.ts src/data-hooks/__tests__/use-parse-lesson-material.test.tsx
git add src/data-hooks/use-parse-lesson-material.ts src/data-hooks/__tests__/use-parse-lesson-material.test.tsx
git commit -m "feat(data-hooks): add useParseLessonMaterial mutation"
```

---

### Task 7: DB — read + upsert material by lesson id

**Files:**
- Modify: `src/db/lesson.ts`

**Interfaces:**
- Consumes: `db` from `#/db`; `lessonMaterialTable`, `lessonsTable` from `./schema`; `LessonMaterialGeneration` from `@/types`.
- Produces:
  - `getLessonMaterialByLessonId(lessonId: number): Promise<LessonMaterialRow | null>`
  - `upsertLessonMaterial(lessonId: number, material: LessonMaterialGeneration): Promise<LessonMaterialRow | null>` (null when the lesson id doesn't exist).
  - (`LessonMaterialRow` = the inferred select row type of `lessonMaterialTable`.)

- [ ] **Step 1: Implement** (DB functions are verified by typecheck + the route tests in Task 8 + manual run, matching the repo's untested `db/*` convention.)

Replace the contents of `src/db/lesson.ts` with:

```ts
import { eq } from "drizzle-orm";
import { db } from "#/db";
import type { LessonMaterialGeneration } from "@/types";
import { lessonMaterialTable, lessonsTable } from "./schema";

export async function getLessonMaterial(lessonSlug: string) {
  try {
    const rows = await db
      .select()
      .from(lessonMaterialTable)
      .where(eq(lessonMaterialTable.lessonSlug, lessonSlug))
      .limit(1);
    return rows.length === 0 ? null : rows[0];
  } catch (error) {
    console.error(error);
    return null;
  }
}

export type LessonMaterial = Awaited<ReturnType<typeof getLessonMaterial>>;

/** Resolve a lesson's slug from its id (null if the lesson doesn't exist). */
async function getLessonSlug(lessonId: number): Promise<string | null> {
  const rows = await db
    .select({ slug: lessonsTable.slug })
    .from(lessonsTable)
    .where(eq(lessonsTable.id, lessonId))
    .limit(1);
  return rows[0]?.slug ?? null;
}

/** Read the material row for a lesson by id, or null if none / lesson missing. */
export async function getLessonMaterialByLessonId(lessonId: number) {
  const slug = await getLessonSlug(lessonId);
  if (!slug) return null;
  return getLessonMaterial(slug);
}

/**
 * Replace a lesson's material with `material`. No unique constraint exists on
 * lesson_slug, so upsert = delete existing rows for the slug then insert, in a
 * transaction (effective one-material-per-lesson). `attachments` is dropped —
 * lessonMaterialTable has no such column. Returns the saved row, or null when
 * the lesson id doesn't exist.
 */
export async function upsertLessonMaterial(
  lessonId: number,
  material: LessonMaterialGeneration,
) {
  const slug = await getLessonSlug(lessonId);
  if (!slug) return null;

  return db.transaction(async (tx) => {
    await tx
      .delete(lessonMaterialTable)
      .where(eq(lessonMaterialTable.lessonSlug, slug));
    const [inserted] = await tx
      .insert(lessonMaterialTable)
      .values({
        lessonSlug: slug,
        text: material.text,
        keyPoints: material.keyPoints,
        quiz: material.quiz,
        proTips: material.proTips,
        links: material.links ?? null,
        assignments: material.assignments ?? null,
        jobOfTheDay: material.jobOfTheDay ?? null,
      })
      .returning();
    return inserted;
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors (confirms the insert value shape matches `lessonMaterialTable`).

- [ ] **Step 3: Format + commit**

```bash
pnpm exec biome check --write src/db/lesson.ts
git add src/db/lesson.ts
git commit -m "feat(db): read + upsert lesson material by lesson id"
```

---

### Task 8: Save/read route `/api/admin/lessons/$lessonId/material`

**Files:**
- Create: `src/routes/api/admin/lessons.$lessonId.material.ts`
- Test: `src/routes/api/admin/__tests__/lessons-material.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `ForbiddenError` from `@/lib/admin-functions.server`; `getLessonMaterialByLessonId`, `upsertLessonMaterial` from `@/db/lesson`; `LessonMaterialGenerationSchema` from `@/types`.
- Produces: exported `getMaterialHandler(request, lessonIdRaw)` and `saveMaterialHandler(request, lessonIdRaw)` + the `Route` (GET + POST).

- [ ] **Step 1: Write the failing test**

Create `src/routes/api/admin/__tests__/lessons-material.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/lib/admin-functions.server";

const requireAdmin = vi.fn();
vi.mock("@/lib/admin-functions.server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/admin-functions.server")>();
  return { ...actual, requireAdmin };
});
const getLessonMaterialByLessonId = vi.fn();
const upsertLessonMaterial = vi.fn();
vi.mock("@/db/lesson", () => ({
  getLessonMaterialByLessonId,
  upsertLessonMaterial,
}));

import {
  getMaterialHandler,
  saveMaterialHandler,
} from "../lessons.$lessonId.material";

const material = { text: "<p>x</p>", keyPoints: [], proTips: "", quiz: [] };
function postReq(body: unknown): Request {
  return new Request("http://test/api/admin/lessons/1/material", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function getReq(): Request {
  return new Request("http://test/api/admin/lessons/1/material");
}

describe("lessons material route", () => {
  it("GET returns 403 for a non-admin", async () => {
    requireAdmin.mockRejectedValueOnce(new ForbiddenError());
    expect((await getMaterialHandler(getReq(), "1")).status).toBe(403);
  });

  it("GET 400 on a bad lesson id", async () => {
    requireAdmin.mockResolvedValueOnce({ userId: "u", roles: ["admin"] });
    expect((await getMaterialHandler(getReq(), "abc")).status).toBe(400);
  });

  it("GET returns the material row (or null)", async () => {
    requireAdmin.mockResolvedValueOnce({ userId: "u", roles: ["admin"] });
    getLessonMaterialByLessonId.mockResolvedValueOnce(null);
    const res = await getMaterialHandler(getReq(), "1");
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it("POST 400 on an invalid body", async () => {
    requireAdmin.mockResolvedValueOnce({ userId: "u", roles: ["admin"] });
    expect((await saveMaterialHandler(postReq({ text: 5 }), "1")).status).toBe(
      400,
    );
  });

  it("POST 404 when the lesson doesn't exist", async () => {
    requireAdmin.mockResolvedValueOnce({ userId: "u", roles: ["admin"] });
    upsertLessonMaterial.mockResolvedValueOnce(null);
    expect((await saveMaterialHandler(postReq(material), "1")).status).toBe(404);
  });

  it("POST upserts and returns the saved row", async () => {
    requireAdmin.mockResolvedValueOnce({ userId: "u", roles: ["admin"] });
    const saved = { id: 7, lessonSlug: "l", ...material };
    upsertLessonMaterial.mockResolvedValueOnce(saved);
    const res = await saveMaterialHandler(postReq(material), "1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(saved);
    expect(upsertLessonMaterial).toHaveBeenCalledWith(1, material);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/routes/api/admin/__tests__/lessons-material.test.ts`
Expected: FAIL — handlers not exported.

- [ ] **Step 3: Implement**

Create `src/routes/api/admin/lessons.$lessonId.material.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";
import {
  getLessonMaterialByLessonId,
  upsertLessonMaterial,
} from "@/db/lesson";
import { ForbiddenError, requireAdmin } from "@/lib/admin-functions.server";
import { LessonMaterialGenerationSchema } from "@/types";

async function guard(request: Request): Promise<Response | null> {
  try {
    await requireAdmin(request.headers);
    return null;
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response("Forbidden", { status: 403 });
    }
    throw error;
  }
}

function parseLessonId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function getMaterialHandler(
  request: Request,
  lessonIdRaw: string,
): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;
  const lessonId = parseLessonId(lessonIdRaw);
  if (lessonId === null) {
    return Response.json({ error: "Invalid lesson id" }, { status: 400 });
  }
  const material = await getLessonMaterialByLessonId(lessonId);
  return Response.json(material ?? null);
}

export async function saveMaterialHandler(
  request: Request,
  lessonIdRaw: string,
): Promise<Response> {
  const denied = await guard(request);
  if (denied) return denied;
  const lessonId = parseLessonId(lessonIdRaw);
  if (lessonId === null) {
    return Response.json({ error: "Invalid lesson id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = LessonMaterialGenerationSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid material" }, { status: 400 });
  }

  const saved = await upsertLessonMaterial(lessonId, parsed.data);
  if (!saved) return new Response("Not found", { status: 404 });
  return Response.json(saved);
}

export const Route = createFileRoute("/api/admin/lessons/$lessonId/material")({
  server: {
    handlers: {
      GET: ({ request, params }) => getMaterialHandler(request, params.lessonId),
      POST: ({ request, params }) =>
        saveMaterialHandler(request, params.lessonId),
    },
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/routes/api/admin/__tests__/lessons-material.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Regenerate route tree + typecheck**

Run: `pnpm exec tsr generate` (or `pnpm dev` briefly).
Run: `pnpm exec tsc --noEmit`
Expected: `routeTree.gen.ts` references `lessons/$lessonId/material`; no type errors.

- [ ] **Step 6: Format + commit**

```bash
pnpm exec biome check --write src/routes/api/admin/lessons.\$lessonId.material.ts src/routes/api/admin/__tests__/lessons-material.test.ts
git add "src/routes/api/admin/lessons.\$lessonId.material.ts" src/routes/api/admin/__tests__/lessons-material.test.ts src/routeTree.gen.ts
git commit -m "feat(api): add guarded GET/POST lesson material route"
```

---

### Task 9: Query key + `useLessonMaterial` + `useSaveLessonMaterial`

**Files:**
- Modify: `src/data-hooks/keys.ts`
- Create: `src/data-hooks/use-lesson-material.ts`
- Create: `src/data-hooks/use-save-lesson-material.ts`
- Test: `src/data-hooks/__tests__/use-save-lesson-material.test.tsx`

**Interfaces:**
- Consumes: `dataKeys` from `./keys`; `LessonMaterialGenerationSchema`/`LessonMaterialGeneration` from `@/types`.
- Produces:
  - `dataKeys.lessonMaterial(lessonId)`
  - `useLessonMaterial(lessonId: number)` → query returning `LessonMaterialGeneration | null` (mapped from the DB row).
  - `useSaveLessonMaterial(lessonId: number)` → mutation `mutateAsync(values: LessonMaterialGeneration)` that invalidates the material key.

- [ ] **Step 1: Add the query key**

In `src/data-hooks/keys.ts`, add inside `dataKeys` (before the closing `} as const;`):

```ts
  lessonMaterial: (lessonId: number) =>
    ['admin', 'lesson-material', lessonId] as const,
```

- [ ] **Step 2: Write the failing test (save hook)**

Create `src/data-hooks/__tests__/use-save-lesson-material.test.tsx`:

```tsx
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSaveLessonMaterial } from "../use-save-lesson-material";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
afterEach(() => vi.restoreAllMocks());

const values = { text: "<p>x</p>", keyPoints: [], proTips: "", quiz: [] };

describe("useSaveLessonMaterial", () => {
  it("POSTs the values as JSON to the lesson material route", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: 1 }), { status: 200 }));
    const { result } = renderHook(() => useSaveLessonMaterial(42), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(values);
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/lessons/42/material");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual(values);
  });

  it("throws on a non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("bad", { status: 400 }),
    );
    const { result } = renderHook(() => useSaveLessonMaterial(42), { wrapper });
    await expect(result.current.mutateAsync(values)).rejects.toThrow(/400/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run src/data-hooks/__tests__/use-save-lesson-material.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the query hook**

Create `src/data-hooks/use-lesson-material.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import type { LessonMaterialGeneration } from "@/types";
import { LessonMaterialGenerationSchema } from "@/types";
import { dataKeys } from "./keys";

/**
 * Load a lesson's saved material as form values, or null if none. Maps the DB
 * row (nullable columns) into the LessonMaterialGeneration shape.
 */
export function useLessonMaterial(lessonId: number) {
  return useQuery<LessonMaterialGeneration | null>({
    queryKey: dataKeys.lessonMaterial(lessonId),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`/api/admin/lessons/${lessonId}/material`);
      if (!res.ok) {
        throw new Error(`Failed to load lesson material (${res.status})`);
      }
      const row = (await res.json()) as Record<string, unknown> | null;
      if (!row) return null;
      return LessonMaterialGenerationSchema.parse({
        text: row.text ?? "",
        keyPoints: row.keyPoints ?? [],
        proTips: row.proTips ?? "",
        quiz: row.quiz ?? [],
        links: row.links ?? [],
        assignments: row.assignments ?? "",
        jobOfTheDay: row.jobOfTheDay ?? "",
      });
    },
  });
}
```

- [ ] **Step 5: Implement the save hook**

Create `src/data-hooks/use-save-lesson-material.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LessonMaterialGeneration } from "@/types";
import { dataKeys } from "./keys";

/** Persist edited lesson material, then refetch the material query. */
export function useSaveLessonMaterial(lessonId: number) {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, LessonMaterialGeneration>({
    mutationFn: async (values) => {
      const res = await fetch(`/api/admin/lessons/${lessonId}/material`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        throw new Error(`Failed to save lesson material (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: dataKeys.lessonMaterial(lessonId),
      });
    },
  });
}
```

- [ ] **Step 6: Run test + typecheck**

Run: `pnpm exec vitest run src/data-hooks/__tests__/use-save-lesson-material.test.tsx`
Expected: PASS (2 tests).
Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Format + commit**

```bash
pnpm exec biome check --write src/data-hooks/keys.ts src/data-hooks/use-lesson-material.ts src/data-hooks/use-save-lesson-material.ts src/data-hooks/__tests__/use-save-lesson-material.test.tsx
git add src/data-hooks/keys.ts src/data-hooks/use-lesson-material.ts src/data-hooks/use-save-lesson-material.ts src/data-hooks/__tests__/use-save-lesson-material.test.tsx
git commit -m "feat(data-hooks): add useLessonMaterial + useSaveLessonMaterial"
```

---

### Task 10: Upload control + attachments list (presentational)

**Files:**
- Create: `src/components/admin/lesson-config/material-upload.tsx`
- Create: `src/components/admin/lesson-config/attachments-list.tsx`

**Interfaces:**
- Produces:
  - `MaterialUpload({ onFileSelected, isPending, error }: { onFileSelected: (file: File) => void; isPending: boolean; error?: string })`
  - `AttachmentsList({ attachments }: { attachments: string[] })` (renders nothing when empty).

- [ ] **Step 1: Implement the upload control**

Create `src/components/admin/lesson-config/material-upload.tsx`:

```tsx
import { Loader2, Upload } from "lucide-react";
import { useRef } from "react";

/** .docx picker for the Material tab. Forwards the chosen file; reflects state. */
export const MaterialUpload = ({
  onFileSelected,
  isPending,
  error,
}: {
  onFileSelected: (file: File) => void;
  isPending: boolean;
  error?: string;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".docx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFileSelected(file);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={isPending}
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-6 px-3.5 py-2 font-medium text-gray-12 text-sm transition-colors hover:bg-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:opacity-60"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Upload className="h-4 w-4" aria-hidden="true" />
        )}
        {isPending ? "Generating…" : "Fill form from Word doc (.docx)"}
      </button>
      <p className="text-gray-10 text-xs">
        Extracts text, key points, pro tips, and quiz into the form below for
        review. Overwrites the current form values.
      </p>
      {error && (
        <p role="alert" className="text-red-11 text-sm">
          {error}
        </p>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Implement the attachments list**

Create `src/components/admin/lesson-config/attachments-list.tsx`:

```tsx
/** Read-only list of attachment names detected in the doc (not persisted). */
export const AttachmentsList = ({
  attachments,
}: {
  attachments: string[];
}) => {
  if (attachments.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-medium text-gray-11 text-xs uppercase tracking-wide">
        Detected attachments (not saved)
      </span>
      <ul className="flex flex-col gap-1 text-gray-12 text-sm">
        {attachments.map((name, i) => (
          <li key={i} className="break-words">
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
};
```

- [ ] **Step 3: Typecheck, format + commit**

```bash
pnpm exec tsc --noEmit
pnpm exec biome check --write src/components/admin/lesson-config/material-upload.tsx src/components/admin/lesson-config/attachments-list.tsx
git add src/components/admin/lesson-config/material-upload.tsx src/components/admin/lesson-config/attachments-list.tsx
git commit -m "feat(admin): add material upload + attachments list components"
```

---

### Task 11: Text fields + string-list field (presentational)

**Files:**
- Create: `src/components/admin/lesson-config/material-text-fields.tsx`
- Create: `src/components/admin/lesson-config/string-list-field.tsx`
- Test: `src/components/admin/lesson-config/__tests__/string-list-field.test.tsx`

**Interfaces:**
- Produces:
  - `MaterialTextFields({ register, errors })` where `register: UseFormRegister<LessonMaterialGeneration>`, `errors: FieldErrors<LessonMaterialGeneration>` — labelled textareas/inputs for `text`, `proTips`, `assignments`, `jobOfTheDay`.
  - `StringListField({ label, itemNoun, value, onChange })` where `value: string[]`, `onChange: (next: string[]) => void` — pure, controlled add/remove list of labelled inputs.

- [ ] **Step 1: Write the failing test (string-list-field)**

Create `src/components/admin/lesson-config/__tests__/string-list-field.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StringListField } from "../string-list-field";

describe("StringListField", () => {
  it("renders one input per value with the item label", () => {
    render(
      <StringListField
        label="Key points"
        itemNoun="key point"
        value={["Alpha", "Bravo"]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue("Alpha")).toBeTruthy();
    expect(screen.getByDisplayValue("Bravo")).toBeTruthy();
  });

  it("appends an empty item when Add is clicked", async () => {
    const onChange = vi.fn();
    render(
      <StringListField
        label="Links"
        itemNoun="link"
        value={["one"]}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /add link/i }));
    expect(onChange).toHaveBeenCalledWith(["one", ""]);
  });

  it("removes the item at the clicked index", async () => {
    const onChange = vi.fn();
    render(
      <StringListField
        label="Links"
        itemNoun="link"
        value={["one", "two"]}
        onChange={onChange}
      />,
    );
    const removes = screen.getAllByRole("button", { name: /remove/i });
    await userEvent.click(removes[0]);
    expect(onChange).toHaveBeenCalledWith(["two"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/admin/lesson-config/__tests__/string-list-field.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `StringListField`**

Create `src/components/admin/lesson-config/string-list-field.tsx`:

```tsx
import { Plus, X } from "lucide-react";

/**
 * Controlled add/remove editor for a string[] (key points, links). Pure — the
 * container owns the value via an RHF Controller and passes value/onChange.
 */
export const StringListField = ({
  label,
  itemNoun,
  value,
  onChange,
}: {
  label: string;
  itemNoun: string;
  value: string[];
  onChange: (next: string[]) => void;
}) => {
  const update = (index: number, next: string) =>
    onChange(value.map((v, i) => (i === index ? next : v)));
  const remove = (index: number) =>
    onChange(value.filter((_, i) => i !== index));

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="font-medium text-gray-11 text-xs uppercase tracking-wide">
        {label}
      </legend>
      {value.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`${label}-${i}`}>
            {itemNoun} {i + 1}
          </label>
          <input
            id={`${label}-${i}`}
            value={item}
            onChange={(e) => update(i, e.target.value)}
            className="flex-1 rounded-md border border-gray-6 bg-gray-1 px-3 py-2 text-gray-12 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            aria-label={`Remove ${itemNoun} ${i + 1}`}
            className="rounded-md p-2 text-gray-10 transition-colors hover:bg-gray-4 hover:text-gray-12"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, ""])}
        className="inline-flex w-fit items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium text-gray-11 text-sm transition-colors hover:bg-gray-4 hover:text-gray-12"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        Add {itemNoun}
      </button>
    </fieldset>
  );
};
```

- [ ] **Step 4: Implement `MaterialTextFields`**

Create `src/components/admin/lesson-config/material-text-fields.tsx`:

```tsx
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import type { LessonMaterialGeneration } from "@/types";

const labelCls =
  "font-medium text-gray-11 text-xs uppercase tracking-wide";
const controlCls =
  "rounded-md border border-gray-6 bg-gray-1 px-3 py-2 text-gray-12 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9";

/** Scalar HTML/text fields of the material form, registered with RHF. */
export const MaterialTextFields = ({
  register,
  errors,
}: {
  register: UseFormRegister<LessonMaterialGeneration>;
  errors: FieldErrors<LessonMaterialGeneration>;
}) => {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="material-text" className={labelCls}>
          Text (HTML)
        </label>
        <textarea
          id="material-text"
          rows={8}
          {...register("text")}
          className={controlCls}
        />
        {errors.text && (
          <p role="alert" className="text-red-11 text-sm">
            {errors.text.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="material-protips" className={labelCls}>
          Pro tips (HTML)
        </label>
        <textarea
          id="material-protips"
          rows={4}
          {...register("proTips")}
          className={controlCls}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="material-assignments" className={labelCls}>
          Assignments (HTML)
        </label>
        <textarea
          id="material-assignments"
          rows={4}
          {...register("assignments")}
          className={controlCls}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="material-job" className={labelCls}>
          Job of the day (URL)
        </label>
        <input
          id="material-job"
          type="text"
          {...register("jobOfTheDay")}
          className={controlCls}
        />
      </div>
    </div>
  );
};
```

- [ ] **Step 5: Run test + typecheck**

Run: `pnpm exec vitest run src/components/admin/lesson-config/__tests__/string-list-field.test.tsx`
Expected: PASS (3 tests).
Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Format + commit**

```bash
pnpm exec biome check --write src/components/admin/lesson-config/material-text-fields.tsx src/components/admin/lesson-config/string-list-field.tsx src/components/admin/lesson-config/__tests__/string-list-field.test.tsx
git add src/components/admin/lesson-config/material-text-fields.tsx src/components/admin/lesson-config/string-list-field.tsx src/components/admin/lesson-config/__tests__/string-list-field.test.tsx
git commit -m "feat(admin): add material text fields + string-list field"
```

---

### Task 12: Quiz field editor (presentational)

**Files:**
- Create: `src/components/admin/lesson-config/quiz-field.tsx`
- Test: `src/components/admin/lesson-config/__tests__/quiz-field.test.tsx`

**Interfaces:**
- Consumes: `CourseLessonQuiz` from `@/types`.
- Produces: `QuizField({ value, onChange })` where `value: CourseLessonQuiz`, `onChange: (next: CourseLessonQuiz) => void` — pure, controlled editor: per-question card with a question textarea, an option list (input + remove per option, add option), a radio group to pick the correct option, and add/remove question.

- [ ] **Step 1: Write the failing test**

Create `src/components/admin/lesson-config/__tests__/quiz-field.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CourseLessonQuiz } from "@/types";
import { QuizField } from "../quiz-field";

const quiz: CourseLessonQuiz = [
  {
    id: "q1",
    question: "What creates lift?",
    options: [
      { id: "a", value: "Airfoil" },
      { id: "b", value: "Gravity" },
    ],
    correctOptionId: "a",
  },
];

describe("QuizField", () => {
  it("renders the question and its options", () => {
    render(<QuizField value={quiz} onChange={vi.fn()} />);
    expect(screen.getByDisplayValue("What creates lift?")).toBeTruthy();
    expect(screen.getByDisplayValue("Airfoil")).toBeTruthy();
    expect(screen.getByDisplayValue("Gravity")).toBeTruthy();
  });

  it("marks the correct option as checked", () => {
    render(<QuizField value={quiz} onChange={vi.fn()} />);
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios[0].checked).toBe(true);
    expect(radios[1].checked).toBe(false);
  });

  it("adds a question when 'Add question' is clicked", async () => {
    const onChange = vi.fn();
    render(<QuizField value={quiz} onChange={onChange} />);
    await userEvent.click(
      screen.getByRole("button", { name: /add question/i }),
    );
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as CourseLessonQuiz;
    expect(next).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/admin/lesson-config/__tests__/quiz-field.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/components/admin/lesson-config/quiz-field.tsx`:

```tsx
import { Plus, X } from "lucide-react";
import type { CourseLessonQuiz } from "@/types";

const labelCls = "font-medium text-gray-11 text-xs uppercase tracking-wide";
const controlCls =
  "rounded-md border border-gray-6 bg-gray-1 px-3 py-2 text-gray-12 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9";

/** New id from an existing set, avoiding Math.random for stable behavior. */
function nextId(prefix: string, existing: string[]): string {
  let n = existing.length + 1;
  while (existing.includes(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

/**
 * Controlled quiz editor. Pure — the container owns the value via an RHF
 * Controller. Prose is markdown (per the quiz schema); rendered as plain
 * text inputs so tags/markdown are visible and editable.
 */
export const QuizField = ({
  value,
  onChange,
}: {
  value: CourseLessonQuiz;
  onChange: (next: CourseLessonQuiz) => void;
}) => {
  const patchQuestion = (qi: number, patch: Partial<CourseLessonQuiz[number]>) =>
    onChange(value.map((q, i) => (i === qi ? { ...q, ...patch } : q)));

  const addQuestion = () =>
    onChange([
      ...value,
      {
        id: nextId(
          "q",
          value.map((q) => q.id),
        ),
        question: "",
        options: [
          { id: "a", value: "" },
          { id: "b", value: "" },
        ],
        correctOptionId: "a",
      },
    ]);

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className={labelCls}>Quiz</legend>

      {value.map((q, qi) => (
        <div
          key={q.id}
          className="flex flex-col gap-3 rounded-lg border border-gray-6 p-4"
        >
          <div className="flex items-start justify-between gap-2">
            <label htmlFor={`quiz-q-${q.id}`} className="sr-only">
              Question {qi + 1}
            </label>
            <textarea
              id={`quiz-q-${q.id}`}
              rows={2}
              value={q.question}
              onChange={(e) => patchQuestion(qi, { question: e.target.value })}
              placeholder=""
              className={`flex-1 ${controlCls}`}
            />
            <button
              type="button"
              aria-label={`Remove question ${qi + 1}`}
              onClick={() => onChange(value.filter((_, i) => i !== qi))}
              className="rounded-md p-2 text-gray-10 transition-colors hover:bg-gray-4 hover:text-gray-12"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {q.options.map((opt, oi) => (
              <div key={opt.id} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`correct-${q.id}`}
                  aria-label={`Mark option ${oi + 1} correct`}
                  checked={q.correctOptionId === opt.id}
                  onChange={() => patchQuestion(qi, { correctOptionId: opt.id })}
                  className="h-4 w-4"
                />
                <label htmlFor={`quiz-opt-${q.id}-${opt.id}`} className="sr-only">
                  Option {oi + 1}
                </label>
                <input
                  id={`quiz-opt-${q.id}-${opt.id}`}
                  value={opt.value}
                  onChange={(e) =>
                    patchQuestion(qi, {
                      options: q.options.map((o, i) =>
                        i === oi ? { ...o, value: e.target.value } : o,
                      ),
                    })
                  }
                  className={`flex-1 ${controlCls}`}
                />
                <button
                  type="button"
                  aria-label={`Remove option ${oi + 1}`}
                  onClick={() =>
                    patchQuestion(qi, {
                      options: q.options.filter((_, i) => i !== oi),
                    })
                  }
                  className="rounded-md p-2 text-gray-10 transition-colors hover:bg-gray-4 hover:text-gray-12"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                patchQuestion(qi, {
                  options: [
                    ...q.options,
                    {
                      id: nextId(
                        "o",
                        q.options.map((o) => o.id),
                      ),
                      value: "",
                    },
                  ],
                })
              }
              className="inline-flex w-fit items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium text-gray-11 text-sm transition-colors hover:bg-gray-4 hover:text-gray-12"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add option
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addQuestion}
        className="inline-flex w-fit items-center gap-1.5 rounded-md border border-gray-6 px-3 py-2 font-medium text-gray-11 text-sm transition-colors hover:bg-gray-4 hover:text-gray-12"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add question
      </button>
    </fieldset>
  );
};
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm exec vitest run src/components/admin/lesson-config/__tests__/quiz-field.test.tsx`
Expected: PASS (3 tests).
Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Format + commit**

```bash
pnpm exec biome check --write src/components/admin/lesson-config/quiz-field.tsx src/components/admin/lesson-config/__tests__/quiz-field.test.tsx
git add src/components/admin/lesson-config/quiz-field.tsx src/components/admin/lesson-config/__tests__/quiz-field.test.tsx
git commit -m "feat(admin): add quiz field editor"
```

---

### Task 13: `MaterialForm` (compose the fields)

**Files:**
- Create: `src/components/admin/lesson-config/material-form.tsx`

**Interfaces:**
- Consumes: `MaterialTextFields`, `StringListField`, `QuizField` (Tasks 11–12); `LessonMaterialGeneration` from `@/types`; RHF `Control`/`UseFormRegister`/`FieldErrors` + `Controller`.
- Produces: `MaterialForm({ register, control, errors, onSubmit, isSaving, saveError })` — a pure form body wiring array fields through `Controller` and rendering a "Save material" button + server-error alert.

- [ ] **Step 1: Implement**

Create `src/components/admin/lesson-config/material-form.tsx`:

```tsx
import { Loader2 } from "lucide-react";
import type { FormEventHandler } from "react";
import {
  type Control,
  Controller,
  type FieldErrors,
  type UseFormRegister,
} from "react-hook-form";
import type { LessonMaterialGeneration } from "@/types";
import { MaterialTextFields } from "./material-text-fields";
import { QuizField } from "./quiz-field";
import { StringListField } from "./string-list-field";

/**
 * Presentational body of the material edit form. Array fields (keyPoints,
 * links, quiz) go through Controller so the field components stay pure; scalar
 * fields use `register`. The container owns useForm and submission.
 */
export const MaterialForm = ({
  register,
  control,
  errors,
  onSubmit,
  isSaving,
  saveError,
}: {
  register: UseFormRegister<LessonMaterialGeneration>;
  control: Control<LessonMaterialGeneration>;
  errors: FieldErrors<LessonMaterialGeneration>;
  onSubmit: FormEventHandler<HTMLFormElement>;
  isSaving: boolean;
  saveError?: string;
}) => {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <MaterialTextFields register={register} errors={errors} />

      <Controller
        control={control}
        name="keyPoints"
        render={({ field }) => (
          <StringListField
            label="Key points"
            itemNoun="key point"
            value={field.value ?? []}
            onChange={field.onChange}
          />
        )}
      />

      <Controller
        control={control}
        name="quiz"
        render={({ field }) => (
          <QuizField value={field.value ?? []} onChange={field.onChange} />
        )}
      />

      <Controller
        control={control}
        name="links"
        render={({ field }) => (
          <StringListField
            label="Links"
            itemNoun="link"
            value={field.value ?? []}
            onChange={field.onChange}
          />
        )}
      />

      {saveError && (
        <p role="alert" className="text-red-11 text-sm">
          {saveError}
        </p>
      )}

      <button
        type="submit"
        disabled={isSaving}
        className="inline-flex w-fit items-center gap-2 rounded-md bg-apple-9 px-4 py-2 font-medium text-apple-contrast text-sm transition-colors hover:bg-apple-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 disabled:opacity-60"
      >
        {isSaving && (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        )}
        Save material
      </button>
    </form>
  );
};
```

Note: `bg-apple-9`/`text-apple-contrast`/`focus-visible:ring-apple-9` are the repo's accent tokens (as used in `video-section-container.tsx`). If the accent scale differs, match whatever token the existing Save/primary buttons in `src/components/admin/` use — grep `bg-apple-9` / primary button styles and reuse the same class.

- [ ] **Step 2: Typecheck, format + commit**

```bash
pnpm exec tsc --noEmit
pnpm exec biome check --write src/components/admin/lesson-config/material-form.tsx
git add src/components/admin/lesson-config/material-form.tsx
git commit -m "feat(admin): compose material edit form"
```

---

### Task 14: `MaterialSectionContainer` + wire into the dialog

**Files:**
- Create: `src/components/admin/lesson-config/material-section-container.tsx`
- Modify: `src/components/admin/lesson-config-dialog-container.tsx`

**Interfaces:**
- Consumes: `useLessonMaterial`, `useSaveLessonMaterial`, `useParseLessonMaterial` (Tasks 6, 9); `MaterialUpload`, `AttachmentsList`, `MaterialForm` (Tasks 10, 13); `LessonMaterialGenerationSchema`/`LessonMaterialGeneration` from `@/types`; `BoardLesson` from `@/lib/admin-schemas`; `zodResolver` from `@hookform/resolvers/zod`; `useForm` from `react-hook-form`.
- Produces: `MaterialSectionContainer({ lesson }: { lesson: BoardLesson })`; a `material` section in the dialog.

- [ ] **Step 1: Implement the container**

Create `src/components/admin/lesson-config/material-section-container.tsx`:

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useLessonMaterial } from "@/data-hooks/use-lesson-material";
import { useParseLessonMaterial } from "@/data-hooks/use-parse-lesson-material";
import { useSaveLessonMaterial } from "@/data-hooks/use-save-lesson-material";
import type { BoardLesson } from "@/lib/admin-schemas";
import type { LessonMaterialGeneration } from "@/types";
import { LessonMaterialGenerationSchema } from "@/types";
import { AttachmentsList } from "./attachments-list";
import { MaterialForm } from "./material-form";
import { MaterialUpload } from "./material-upload";

const EMPTY: LessonMaterialGeneration = {
  text: "",
  keyPoints: [],
  proTips: "",
  quiz: [],
  links: [],
  assignments: "",
  jobOfTheDay: "",
  attachments: [],
};

/**
 * Material tab: load existing material into an editable form, optionally refill
 * it from a parsed .docx, and save. The container owns useForm and the hooks;
 * the field components are pure.
 */
export const MaterialSectionContainer = ({
  lesson,
}: {
  lesson: BoardLesson;
}) => {
  const existing = useLessonMaterial(lesson.id);
  const parse = useParseLessonMaterial();
  const save = useSaveLessonMaterial(lesson.id);

  const form = useForm<LessonMaterialGeneration>({
    resolver: zodResolver(LessonMaterialGenerationSchema),
    defaultValues: EMPTY,
  });

  // Load saved material (or reset to empty) whenever the lesson changes and its
  // material query resolves.
  const existingData = existing.data;
  // biome-ignore lint/correctness/useExhaustiveDependencies: form is stable; reset on lesson switch or when saved data arrives.
  useEffect(() => {
    form.reset(existingData ?? EMPTY);
  }, [lesson.id, existingData]);

  const attachments = form.watch("attachments") ?? [];

  const onSubmit = form.handleSubmit((values) => save.mutate(values));

  return (
    <div className="flex flex-col gap-6">
      <MaterialUpload
        isPending={parse.isPending}
        error={parse.error?.message}
        onFileSelected={(file) =>
          parse.mutate(file, {
            onSuccess: (parsed) => form.reset({ ...EMPTY, ...parsed }),
          })
        }
      />
      <AttachmentsList attachments={attachments} />
      <MaterialForm
        register={form.register}
        control={form.control}
        errors={form.formState.errors}
        onSubmit={onSubmit}
        isSaving={save.isPending}
        saveError={save.error?.message}
      />
    </div>
  );
};
```

- [ ] **Step 2: Wire the section into the dialog**

In `src/components/admin/lesson-config-dialog-container.tsx`:

Add the import next to the `VideoSectionContainer` import:

```tsx
import { MaterialSectionContainer } from './lesson-config/material-section-container';
```

Insert a `material` section right after the `video` section, before the `PLACEHOLDER_SECTIONS` spread:

```tsx
    {
      value: 'material',
      title: 'Material',
      content: lesson && <MaterialSectionContainer lesson={lesson} />,
    },
```

Leave `PLACEHOLDER_SECTIONS` (availability/access/debrief) unchanged.

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.
Run: `pnpm exec biome check --write src/components/admin/lesson-config/material-section-container.tsx src/components/admin/lesson-config-dialog-container.tsx`
Expected: clean.

- [ ] **Step 4: Manual verification (real app)**

Run `pnpm dev`, sign in as admin, open a course board → a lesson's Configure dialog → **Material** tab. Verify:
1. Existing material (if any) loads into the form.
2. Uploading a `.docx` fills the form; detected attachments show as read-only.
3. Editing a field and clicking **Save material** persists (reopen the tab → values reload from the DB).
4. A non-docx upload shows the 400 message; a logged-out `POST /api/admin/lessons/1/material` returns 403.

- [ ] **Step 5: Format + commit**

```bash
pnpm exec biome check --write src/components/admin/lesson-config/material-section-container.tsx src/components/admin/lesson-config-dialog-container.tsx
git add src/components/admin/lesson-config/material-section-container.tsx src/components/admin/lesson-config-dialog-container.tsx
git commit -m "feat(admin): add Material tab to the lesson-config dialog"
```

---

### Task 15: Full-suite green + optional env validation

**Files:**
- (Optional) Modify: `src/env.ts`

- [ ] **Step 1: Run the whole suite**

Run: `pnpm test`
Expected: all pass, including the new files.

- [ ] **Step 2: Whole-project typecheck + lint**

Run: `pnpm exec tsc --noEmit && pnpm exec biome check`
Expected: clean.

- [ ] **Step 3 (optional): Declare `AI_GATEWAY_API_KEY`**

If the team wants boot-time validation, add to the `server` block of `createEnv` in `src/env.ts`:

```ts
    AI_GATEWAY_API_KEY: z.string().min(1),
```

Confirm `pnpm dev` boots without an env error (the key is already in `.env`); commit `src/env.ts` alone. Skip to keep relying on the SDK's implicit `process.env` read (matching `generate-test`).

---

## Self-Review

**Spec coverage:**
- docx→HTML (`wordToHtml`, mammoth) → Task 2 ✓
- Generation schema → Task 1 ✓
- AI module + prompts → Tasks 3–4 ✓
- Parse route → Task 5 ✓
- Parse hook → Task 6 ✓
- DB read + upsert (delete+insert txn, no migration, attachments dropped) → Task 7 ✓
- Save/read route (GET+POST, guard, validation) → Task 8 ✓
- Query key + load hook + save hook → Task 9 ✓
- Upload + attachments components → Task 10 ✓
- Text fields + string-list field → Task 11 ✓
- Quiz editor → Task 12 ✓
- Compose form → Task 13 ✓
- Container + dialog wiring + manual verification → Task 14 ✓
- Full green + optional env → Task 15 ✓
- Out-of-scope (attachment linking, unique-index migration, PDF, WYSIWYG) excluded ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step is complete; the one styling caveat (Task 13 accent token) has a concrete fallback instruction.

**Type consistency:** `LessonMaterialGeneration`/`LessonMaterialGenerationSchema` (Task 1) flow unchanged into Tasks 4, 6, 7, 8, 9, 11, 13, 14. `wordToHtml(buffer: Buffer)` (Task 2) matches its call in Task 5. `generateLessonMaterial(html)` (Task 4) matches Task 5. `getLessonMaterialByLessonId`/`upsertLessonMaterial(lessonId, material)` (Task 7) match the mocks + calls in Task 8. `getMaterialHandler`/`saveMaterialHandler(request, lessonIdRaw)` (Task 8) match their tests. `dataKeys.lessonMaterial(lessonId)` (Task 9) is used by both hooks. `useLessonMaterial`/`useSaveLessonMaterial`/`useParseLessonMaterial` (Tasks 6, 9) are consumed in Task 14. Component prop contracts (`MaterialUpload`, `AttachmentsList`, `StringListField`, `MaterialTextFields`, `QuizField`, `MaterialForm`) declared in Tasks 10–13 match their usage in Tasks 13–14. `CourseLessonQuiz` (existing) used by `QuizField` and `MaterialForm`.
