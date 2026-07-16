# Lesson Material from a Word Doc — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin upload a `.docx` lesson document and get back a structured, reviewable `CourseLessonMaterial` (text, key points, pro tips, quiz, links, assignments, job of the day, attachments) produced by the Vercel AI Gateway.

**Architecture:** A guarded TanStack Start API route converts the uploaded docx to HTML (mammoth), sends that HTML through `generateText` + `Output.object` on Haiku (routed via the AI Gateway), validates the result against a Zod schema, and returns it. A TanStack Query mutation hook posts the file; a new "Material" section in the lesson-config dialog drives upload → generate → read-only preview. Nothing is persisted in this pass.

**Tech Stack:** TanStack Start (`@tanstack/react-start`/`react-router`), `ai` v6 + Vercel AI Gateway, `mammoth`, Drizzle (untouched here), Zod, Jotai, TanStack Query, react-hook-form (not needed here — no editable form), Base UI + lucide, Tailwind (Radix color tokens), Vitest, Biome, pnpm.

## Global Constraints

- **Package manager:** pnpm. Install with `pnpm add mammoth@latest` (latest npm deps, per user).
- **Model:** `haiku` (`anthropic/claude-haiku-4.5`), imported from `src/ai/ai-provider.ts`. Never hard-code the model string.
- **AI Gateway:** implicit — pass the model id string to `generateText`; auth via `AI_GATEWAY_API_KEY` (already in `.env`). Do not add `@ai-sdk/gateway`.
- **Output format:** prose fields (`text`, `keyPoints`, `proTips`, `assignments`, `jobOfTheDay`) are **HTML**; quiz `question`/option `value` are **markdown**.
- **Admin guard:** every admin route calls `requireAdmin(request.headers)` from `@/lib/admin-functions.server`; `ForbiddenError` → 403.
- **Lint/format:** Biome. Run `pnpm exec biome check --write <files>` before each commit. Tests: `pnpm test` (vitest) or a scoped `pnpm exec vitest run <path>`. Typecheck: `pnpm exec tsc --noEmit`.
- **Uncommitted user files:** `package.json`, `src/db/schema.ts`, `CLAUDE.md` carry the user's unrelated uncommitted edits. NEVER `git add -A` / `git add .`. Stage only this feature's explicit paths. The mammoth install unavoidably edits `package.json` + `pnpm-lock.yaml` — see Task 2's dep-dance.
- **Presentational vs container:** presentational components are pure prop-driven functions (kebab-case files, PascalCase exports) built on Base UI where possible; containers own jotai + hooks. Logical CSS properties only (`ms-*`/`me-*`, `ps-*`/`pe-*`, `text-start`).
- **Import alias:** use `@/…` (maps to `./src/…`).

---

### Task 1: `LessonMaterialGenerationSchema` (returned/validated shape)

**Files:**
- Modify: `src/types.ts` (append after `CourseLessonMaterialSchema`, ~line 110)
- Test: `src/__tests__/lesson-material-generation-schema.test.ts` (create)

**Interfaces:**
- Consumes: existing `CourseLessonMaterialSchema` in `src/types.ts`.
- Produces: `LessonMaterialGenerationSchema` (Zod object) and type `LessonMaterialGeneration` = the material shape **minus** `id`: `{ text: string; keyPoints: string[]; proTips: string; quiz: CourseLessonQuiz; links?: string[]; assignments?: string; jobOfTheDay?: string; attachments?: string[] }`.

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

  it("rejects when an id field is present", () => {
    const parsed = LessonMaterialGenerationSchema.safeParse({
      id: 1,
      text: "<p>x</p>",
      keyPoints: [],
      proTips: "",
      quiz: [],
    });
    // .omit removes id from the shape; strict-less objects ignore extras, so
    // assert the parsed output has no id rather than a parse failure.
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
Expected: FAIL — `LessonMaterialGenerationSchema` is not exported from `../types`.

- [ ] **Step 3: Add the schema**

In `src/types.ts`, immediately after the `CourseLessonMaterial` type (line ~110), add:

```ts
/**
 * Shape the docx parser returns for admin review — the canonical lesson
 * material minus the DB `id` (the model can't produce it). Prose fields are
 * HTML; quiz question/option values are markdown (see the quiz schema).
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
git commit -m "feat(types): add LessonMaterialGenerationSchema for docx parsing"
```

---

### Task 2: `wordToHtml` docx→HTML converter (+ mammoth dependency)

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (via `pnpm add`)
- Create: `src/lib/word-to-html.server.ts`
- Test: `src/lib/__tests__/word-to-html.test.ts`

**Interfaces:**
- Produces: `wordToHtml(buffer: Buffer): Promise<string>` — throws `Error` on mammoth failure or empty/whitespace-only output.

- [ ] **Step 1: Install mammoth (dep-dance)**

The user has unrelated uncommitted edits in `package.json`. To avoid committing them:

```bash
# 1. Stash ONLY the user's package.json change so pnpm edits a clean file.
git stash push -- package.json
# 2. Install the latest mammoth.
pnpm add mammoth@latest
# 3. Restore the user's edits on top of the new dependency line.
git stash pop
```

If `git stash pop` reports a conflict in `package.json`, resolve it by keeping BOTH the user's original edits and the new `"mammoth": "…"` dependency line, then `git add` nothing yet (staging happens in Step 6 with explicit paths).

Verify: `node -e "console.log(require('mammoth/package.json').version)"` prints a version.

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
    await expect(wordToHtml(Buffer.from("fake-docx"))).rejects.toThrow(
      /no readable content/i,
    );
  });

  it("throws when mammoth itself fails", async () => {
    convertToHtml.mockRejectedValueOnce(new Error("corrupt zip"));
    await expect(wordToHtml(Buffer.from("fake-docx"))).rejects.toThrow(
      /corrupt zip/,
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/__tests__/word-to-html.test.ts`
Expected: FAIL — `../word-to-html.server` has no `wordToHtml` export.

- [ ] **Step 4: Implement**

Create `src/lib/word-to-html.server.ts`:

```ts
import mammoth from "mammoth";

/**
 * Convert a .docx buffer to HTML. Server-only (mammoth uses Node built-ins).
 * Throws on conversion failure or empty output so callers can surface a 5xx
 * instead of silently feeding empty HTML to the model.
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

- [ ] **Step 6: Format + commit (explicit paths only)**

```bash
pnpm exec biome check --write src/lib/word-to-html.server.ts src/lib/__tests__/word-to-html.test.ts
git add src/lib/word-to-html.server.ts src/lib/__tests__/word-to-html.test.ts package.json pnpm-lock.yaml
git commit -m "feat(lib): add wordToHtml docx converter (mammoth)"
```

If `git status` shows `package.json` still contains the user's unrelated edits, use `git add -p package.json` and stage ONLY the hunk adding `"mammoth"`.

---

### Task 3: Parser prompt builders

**Files:**
- Create: `src/ai/prompts/lesson-material.ts`
- Test: `src/ai/__tests__/lesson-material-prompt.test.ts`

**Interfaces:**
- Produces: `lessonMaterialSystemPrompt: string` and `lessonMaterialUserPrompt(html: string): string`.

- [ ] **Step 1: Write the failing test**

Create `src/ai/__tests__/lesson-material-prompt.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  lessonMaterialSystemPrompt,
  lessonMaterialUserPrompt,
} from "../prompts/lesson-material";

describe("lesson-material prompts", () => {
  it("system prompt states the HTML-prose / markdown-quiz rule and key sections", () => {
    expect(lessonMaterialSystemPrompt).toMatch(/HTML/);
    expect(lessonMaterialSystemPrompt).toMatch(/markdown/i);
    expect(lessonMaterialSystemPrompt).toMatch(/key teaching points/i);
    expect(lessonMaterialSystemPrompt).toMatch(/proTips/);
    expect(lessonMaterialSystemPrompt).toMatch(/quiz/);
  });

  it("user prompt embeds the provided html", () => {
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
- keyPoints: array of HTML strings, one per key teaching point extracted from
  the key-points section. [] if the document has none.
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
- Return only the structured object, no prose or markdown fences around it.
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

### Task 4: `generateLessonMaterial` AI module

**Files:**
- Create: `src/ai/generate-lesson-material.ts`
- Test: `src/ai/__tests__/generate-lesson-material.test.ts`

**Interfaces:**
- Consumes: `haiku` from `./ai-provider`; `LessonMaterialGenerationSchema`/`LessonMaterialGeneration` from `@/types`; `lessonMaterialSystemPrompt`/`lessonMaterialUserPrompt` from `./prompts/lesson-material`; `generateText`, `Output` from `ai`.
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

import { generateLessonMaterial } from "../generate-lesson-material";
import { haiku } from "../ai-provider";

const sampleOutput = {
  text: "<p>Intro</p>",
  keyPoints: ["<p>Point 1</p>"],
  proTips: "<p>Tip</p>",
  quiz: [],
};

describe("generateLessonMaterial", () => {
  it("calls generateText with the haiku model and returns its output", async () => {
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
 * Turn a lesson document's HTML into structured lesson material (for admin
 * review) using Haiku via the Vercel AI Gateway. Output is validated against
 * LessonMaterialGenerationSchema by the AI SDK's structured-output mode.
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

### Task 5: Guarded API route `/api/admin/lesson-material/parse`

**Files:**
- Create: `src/routes/api/admin/lesson-material.parse.ts`
- Test: `src/routes/api/admin/__tests__/lesson-material-parse.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `ForbiddenError` from `@/lib/admin-functions.server`; `wordToHtml` from `@/lib/word-to-html.server`; `generateLessonMaterial` from `@/ai/generate-lesson-material`.
- Produces: exported `parseLessonMaterialHandler(request: Request): Promise<Response>` (the Route wraps it, and tests call it directly), plus the `Route` for `/api/admin/lesson-material/parse`.

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
  it("returns 403 when the caller is not an admin", async () => {
    requireAdmin.mockRejectedValueOnce(new ForbiddenError());
    const res = await parseLessonMaterialHandler(requestWith(null));
    expect(res.status).toBe(403);
  });

  it("returns 400 for a non-docx file", async () => {
    requireAdmin.mockResolvedValueOnce({ userId: "u1", roles: ["admin"] });
    const file = new File(["hi"], "notes.txt", { type: "text/plain" });
    const res = await parseLessonMaterialHandler(requestWith(file));
    expect(res.status).toBe(400);
  });

  it("returns 400 when no file is provided", async () => {
    requireAdmin.mockResolvedValueOnce({ userId: "u1", roles: ["admin"] });
    const res = await parseLessonMaterialHandler(requestWith(null));
    expect(res.status).toBe(400);
  });

  it("converts, generates, and returns the parsed material", async () => {
    requireAdmin.mockResolvedValueOnce({ userId: "u1", roles: ["admin"] });
    wordToHtml.mockResolvedValueOnce("<p>Body</p>");
    const material = { text: "<p>Body</p>", keyPoints: [], proTips: "", quiz: [] };
    generateLessonMaterial.mockResolvedValueOnce(material);

    const file = new File(["docx-bytes"], "lesson.docx", { type: DOCX_MIME });
    const res = await parseLessonMaterialHandler(requestWith(file));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(material);
    expect(generateLessonMaterial).toHaveBeenCalledWith("<p>Body</p>");
  });

  it("returns 500 when generation throws", async () => {
    requireAdmin.mockResolvedValueOnce({ userId: "u1", roles: ["admin"] });
    wordToHtml.mockResolvedValueOnce("<p>Body</p>");
    generateLessonMaterial.mockRejectedValueOnce(new Error("model down"));

    const file = new File(["docx-bytes"], "lesson.docx", { type: DOCX_MIME });
    const res = await parseLessonMaterialHandler(requestWith(file));
    expect(res.status).toBe(500);
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
import {
  ForbiddenError,
  requireAdmin,
} from "@/lib/admin-functions.server";
import { wordToHtml } from "@/lib/word-to-html.server";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
/** Vercel serverless request bodies cap at ~4.5 MB; stay under it. */
const MAX_SIZE_BYTES = 4 * 1024 * 1024;

/**
 * Parse an uploaded .docx into structured lesson material for admin review.
 * Does NOT persist — the caller reviews the returned object. Exported for unit
 * tests; the Route below wraps it.
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
    const form = await request.formData();
    const value = form.get("file");
    file = value instanceof File ? value : null;
  } catch {
    return Response.json({ error: "Expected multipart form data." }, {
      status: 400,
    });
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
    handlers: {
      POST: ({ request }) => parseLessonMaterialHandler(request),
    },
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/routes/api/admin/__tests__/lesson-material-parse.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Regenerate the route tree**

The dev server / build regenerates `src/routeTree.gen.ts` from route files. Regenerate it so the new route is registered:

Run: `pnpm exec tsr generate` (TanStack Router CLI). If that command is unavailable, start `pnpm dev` briefly (the router plugin regenerates the tree on boot), then stop it.
Expected: `src/routeTree.gen.ts` now references `lesson-material/parse`.

- [ ] **Step 6: Typecheck, format + commit**

```bash
pnpm exec tsc --noEmit
pnpm exec biome check --write src/routes/api/admin/lesson-material.parse.ts src/routes/api/admin/__tests__/lesson-material-parse.test.ts
git add src/routes/api/admin/lesson-material.parse.ts src/routes/api/admin/__tests__/lesson-material-parse.test.ts src/routeTree.gen.ts
git commit -m "feat(api): add guarded /api/admin/lesson-material/parse route"
```

---

### Task 6: `useParseLessonMaterial` data-hook

**Files:**
- Create: `src/data-hooks/use-parse-lesson-material.ts`
- Test: `src/data-hooks/__tests__/use-parse-lesson-material.test.tsx`

**Interfaces:**
- Consumes: `LessonMaterialGenerationSchema`/`LessonMaterialGeneration` from `@/types`.
- Produces: `useParseLessonMaterial()` → TanStack Query mutation with `mutateAsync(file: File): Promise<LessonMaterialGeneration>`.

- [ ] **Step 1: Write the failing test**

Create `src/data-hooks/__tests__/use-parse-lesson-material.test.tsx`:

```tsx
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
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
      .mockResolvedValue(
        new Response(JSON.stringify(material), { status: 200 }),
      );

    const { result } = renderHook(() => useParseLessonMaterial(), { wrapper });
    const file = new File(["bytes"], "lesson.docx");

    let returned: unknown;
    await act(async () => {
      returned = await result.current.mutateAsync(file);
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
    await waitFor(() => expect(result.current.isError).toBe(true));
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

/**
 * Upload a .docx and get back structured lesson material for review. Nothing is
 * persisted server-side, so there is no cache to invalidate.
 */
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

### Task 7: Presentational upload + preview components

**Files:**
- Create: `src/components/admin/lesson-config/material-upload.tsx`
- Create: `src/components/admin/lesson-config/material-preview.tsx`
- Test: `src/components/admin/lesson-config/__tests__/material-preview.test.tsx`

**Interfaces:**
- Consumes: `LessonMaterialGeneration` from `@/types`.
- Produces:
  - `MaterialUpload({ onFileSelected, isPending, error }: { onFileSelected: (file: File) => void; isPending: boolean; error?: string })` — a `.docx` picker button with pending/error states.
  - `MaterialPreview({ material }: { material: LessonMaterialGeneration })` — read-only, XSS-safe (escaped-text) rendering of every parsed field.

- [ ] **Step 1: Write the failing test**

Create `src/components/admin/lesson-config/__tests__/material-preview.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LessonMaterialGeneration } from "@/types";
import { MaterialPreview } from "../material-preview";

const material: LessonMaterialGeneration = {
  text: "<p>Intro body</p>",
  keyPoints: ["<p>Watch airspeed</p>", "<p>Trim early</p>"],
  proTips: "<p>Stay ahead of the aircraft</p>",
  quiz: [
    {
      id: "q1",
      question: "What creates lift?",
      options: [
        { id: "a", value: "Airfoil shape" },
        { id: "b", value: "Gravity" },
      ],
      correctOptionId: "a",
    },
  ],
  links: ["https://example.com/reading"],
  assignments: "<p>Fly three circuits</p>",
  jobOfTheDay: "https://example.com/job",
  attachments: ["checklist.pdf"],
};

describe("MaterialPreview", () => {
  it("renders each parsed field as escaped text (no HTML injection)", () => {
    const { container } = render(<MaterialPreview material={material} />);

    // Prose shown as escaped text — the literal tag is visible, not parsed.
    expect(screen.getByText(/<p>Intro body<\/p>/)).toBeTruthy();
    // No <p> element was injected from the material string.
    expect(container.querySelector("p")).toBeNull();

    expect(screen.getByText(/Watch airspeed/)).toBeTruthy();
    expect(screen.getByText(/What creates lift\?/)).toBeTruthy();
    expect(screen.getByText(/Airfoil shape/)).toBeTruthy();
    expect(screen.getByText(/checklist\.pdf/)).toBeTruthy();
    expect(screen.getByText(/example\.com\/reading/)).toBeTruthy();
  });

  it("labels the correct quiz option", () => {
    render(<MaterialPreview material={material} />);
    expect(screen.getByText(/correct/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/admin/lesson-config/__tests__/material-preview.test.tsx`
Expected: FAIL — `../material-preview` not found.

- [ ] **Step 3: Implement the preview**

Create `src/components/admin/lesson-config/material-preview.tsx`:

```tsx
import type { LessonMaterialGeneration } from "@/types";

/**
 * Read-only view of parsed lesson material for admin verification. Prose is
 * rendered as escaped text (React text nodes) — never dangerouslySetInnerHTML —
 * because it's unsanitized model output. The future save path will render the
 * stored HTML via MaterialProse once sanitized.
 */
export const MaterialPreview = ({
  material,
}: {
  material: LessonMaterialGeneration;
}) => {
  return (
    <div className="flex flex-col gap-5 text-sm">
      <Field label="Text">
        <pre className="whitespace-pre-wrap break-words text-gray-12">
          {material.text}
        </pre>
      </Field>

      <Field label={`Key points (${material.keyPoints.length})`}>
        <ul className="flex list-disc flex-col gap-1 ps-5 text-gray-12">
          {material.keyPoints.map((point, i) => (
            <li key={i} className="whitespace-pre-wrap break-words">
              {point}
            </li>
          ))}
        </ul>
      </Field>

      <Field label="Pro tips">
        <pre className="whitespace-pre-wrap break-words text-gray-12">
          {material.proTips || "—"}
        </pre>
      </Field>

      <Field label={`Quiz (${material.quiz.length})`}>
        <ol className="flex flex-col gap-3 ps-5 text-gray-12">
          {material.quiz.map((q) => (
            <li key={q.id} className="flex flex-col gap-1">
              <span className="font-medium">{q.question}</span>
              <ul className="flex flex-col gap-0.5 ps-4">
                {q.options.map((opt) => (
                  <li key={opt.id}>
                    {opt.value}
                    {opt.id === q.correctOptionId && (
                      <span className="ms-2 text-green-11 text-xs">
                        (correct)
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </Field>

      {material.links && material.links.length > 0 && (
        <Field label="Links">
          <ul className="flex flex-col gap-1 text-gray-12">
            {material.links.map((link, i) => (
              <li key={i} className="break-words">
                {link}
              </li>
            ))}
          </ul>
        </Field>
      )}

      {material.assignments && (
        <Field label="Assignments">
          <pre className="whitespace-pre-wrap break-words text-gray-12">
            {material.assignments}
          </pre>
        </Field>
      )}

      {material.jobOfTheDay && (
        <Field label="Job of the day">
          <span className="break-words text-gray-12">{material.jobOfTheDay}</span>
        </Field>
      )}

      {material.attachments && material.attachments.length > 0 && (
        <Field label="Attachments">
          <ul className="flex flex-col gap-1 text-gray-12">
            {material.attachments.map((name, i) => (
              <li key={i} className="break-words">
                {name}
              </li>
            ))}
          </ul>
        </Field>
      )}
    </div>
  );
};

const Field = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1.5">
    <span className="font-medium text-gray-11 text-xs uppercase tracking-wide">
      {label}
    </span>
    {children}
  </div>
);
```

- [ ] **Step 4: Implement the upload control**

Create `src/components/admin/lesson-config/material-upload.tsx`:

```tsx
import { Loader2, Upload } from "lucide-react";
import { useRef } from "react";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * .docx picker for the Material section. Presentational: it forwards the chosen
 * file to `onFileSelected` and reflects pending/error state from the container.
 */
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
        {isPending ? "Generating…" : "Upload Word doc (.docx)"}
      </button>
      <p className="text-gray-10 text-xs">
        Extracts text, key points, pro tips, and quiz from the document for
        review. Nothing is saved yet.
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

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/admin/lesson-config/__tests__/material-preview.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck, format + commit**

```bash
pnpm exec tsc --noEmit
pnpm exec biome check --write src/components/admin/lesson-config/material-upload.tsx src/components/admin/lesson-config/material-preview.tsx src/components/admin/lesson-config/__tests__/material-preview.test.tsx
git add src/components/admin/lesson-config/material-upload.tsx src/components/admin/lesson-config/material-preview.tsx src/components/admin/lesson-config/__tests__/material-preview.test.tsx
git commit -m "feat(admin): add lesson-material upload + preview components"
```

---

### Task 8: Material section container + wire into the lesson-config dialog

**Files:**
- Modify: `src/atoms/admin.ts` (append an atom)
- Create: `src/components/admin/lesson-config/material-section-container.tsx`
- Modify: `src/components/admin/lesson-config-dialog-container.tsx`

**Interfaces:**
- Consumes: `useParseLessonMaterial` (Task 6); `MaterialUpload`, `MaterialPreview` (Task 7); `BoardLesson` from `@/lib/admin-schemas`; `parsedLessonMaterialAtom` (new).
- Produces: `MaterialSectionContainer({ lesson }: { lesson: BoardLesson })`; a new `material` section in the dialog.

- [ ] **Step 1: Add the jotai atom**

Append to `src/atoms/admin.ts`:

```ts
/**
 * Lesson material parsed from an uploaded Word doc, awaiting admin review in the
 * lesson-config dialog's Material tab. Null until a doc is parsed. Only one
 * config modal is open at a time, so a single atom is enough. Reset when the
 * modal switches lessons.
 */
export const parsedLessonMaterialAtom = atom<
  import("@/types").LessonMaterialGeneration | null
>(null);
```

(`atom` is already imported at the top of `src/atoms/admin.ts`.)

- [ ] **Step 2: Implement the container**

Create `src/components/admin/lesson-config/material-section-container.tsx`:

```tsx
import { useAtom } from "jotai";
import { useEffect } from "react";
import { parsedLessonMaterialAtom } from "@/atoms/admin";
import { useParseLessonMaterial } from "@/data-hooks/use-parse-lesson-material";
import type { BoardLesson } from "@/lib/admin-schemas";
import { MaterialPreview } from "./material-preview";
import { MaterialUpload } from "./material-upload";

/**
 * Material tab: upload a .docx → parse via the AI Gateway → show a read-only
 * preview for review. Persisting the reviewed material is a separate feature.
 */
export const MaterialSectionContainer = ({
  lesson,
}: {
  lesson: BoardLesson;
}) => {
  const [parsed, setParsed] = useAtom(parsedLessonMaterialAtom);
  const parse = useParseLessonMaterial();

  // Clear a previous lesson's parsed result when the modal switches lessons.
  // lesson.id is the trigger, not a value read in the body.
  // biome-ignore lint/correctness/useExhaustiveDependencies: lesson.id intentionally re-triggers the reset on lesson switch even though it isn't read in the body.
  useEffect(() => {
    setParsed(null);
    parse.reset();
  }, [lesson.id, setParsed]);

  return (
    <div className="flex flex-col gap-5">
      <MaterialUpload
        isPending={parse.isPending}
        error={parse.error?.message}
        onFileSelected={(file) =>
          parse.mutate(file, { onSuccess: (data) => setParsed(data) })
        }
      />
      {parsed && <MaterialPreview material={parsed} />}
    </div>
  );
};
```

- [ ] **Step 3: Wire the section into the dialog**

In `src/components/admin/lesson-config-dialog-container.tsx`:

1. Add the import near the `VideoSectionContainer` import:

```tsx
import { MaterialSectionContainer } from './lesson-config/material-section-container';
```

2. Remove the `debrief` entry is **not** required — instead insert a real `material` section into the `sections` array, right after the `video` section and before the spread of `PLACEHOLDER_SECTIONS`:

```tsx
  const sections: ConfigModalSection[] = [
    {
      value: 'video',
      title: 'Video',
      content: lesson && (
        <VideoSectionContainer courseId={courseId} lesson={lesson} />
      ),
    },
    {
      value: 'material',
      title: 'Material',
      content: lesson && <MaterialSectionContainer lesson={lesson} />,
    },
    ...PLACEHOLDER_SECTIONS.map((section) => ({
```

Leave `PLACEHOLDER_SECTIONS` (availability/access/debrief) as-is.

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

Run: `pnpm exec biome check src/atoms/admin.ts src/components/admin/lesson-config/material-section-container.tsx src/components/admin/lesson-config-dialog-container.tsx`
Expected: no errors (run with `--write` first if it reports fixable issues).

- [ ] **Step 5: Manual verification (real app)**

Run `pnpm dev`, sign in as an admin, open a course board, open a lesson's Configure dialog, switch to the **Material** tab, upload a `.docx`, and confirm the preview shows the extracted fields. Confirm a non-admin (or logged-out) request to `POST /api/admin/lesson-material/parse` returns 403, and a non-docx upload shows the 400 error message.

- [ ] **Step 6: Format + commit**

```bash
pnpm exec biome check --write src/atoms/admin.ts src/components/admin/lesson-config/material-section-container.tsx src/components/admin/lesson-config-dialog-container.tsx
git add src/atoms/admin.ts src/components/admin/lesson-config/material-section-container.tsx src/components/admin/lesson-config-dialog-container.tsx
git commit -m "feat(admin): add Material section to the lesson-config dialog"
```

---

### Task 9: Full-suite green + optional env validation

**Files:**
- (Optional) Modify: `src/env.ts` — add `AI_GATEWAY_API_KEY` to the server schema.

- [ ] **Step 1: Run the whole test suite**

Run: `pnpm test`
Expected: all tests pass, including the six new files.

- [ ] **Step 2: Typecheck + lint the whole project**

Run: `pnpm exec tsc --noEmit && pnpm exec biome check`
Expected: clean.

- [ ] **Step 3 (optional): Declare the env var for validation**

If the team wants `AI_GATEWAY_API_KEY` validated at boot, add it to the `server` block of `createEnv` in `src/env.ts`:

```ts
    AI_GATEWAY_API_KEY: z.string().min(1),
```

Then confirm `pnpm dev` boots without an env error (the key is already in `.env`). Commit `src/env.ts` alone (explicit path) if changed. Skip this step if the team prefers to keep relying on the SDK's implicit `process.env` read (matching `generate-test`).

---

## Self-Review

**Spec coverage:**
- docx→HTML (`wordToHtml`, mammoth) → Task 2 ✓
- Generation schema (`LessonMaterialGenerationSchema`) → Task 1 ✓
- AI module (`generateLessonMaterial`, Haiku, Output.object) → Task 4 (prompts in Task 3) ✓
- Guarded API route (`/api/admin/lesson-material/parse`, requireAdmin, MIME/size validation) → Task 5 ✓
- Data-hook (`useParseLessonMaterial`) → Task 6 ✓
- Admin UI (Material section: upload → generate → read-only preview) → Tasks 7–8 ✓
- Tests (AI module + route guard/validation + prompt + schema + hook + preview) → Tasks 1,2,3,4,5,6,7 ✓
- Out-of-scope items (persistence, editable form, attachment linking, PDF) correctly excluded.

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows complete code and exact commands.

**Type consistency:** `LessonMaterialGeneration`/`LessonMaterialGenerationSchema` (Task 1) are consumed unchanged in Tasks 4, 6, 7, 8. `wordToHtml(buffer: Buffer)` (Task 2) matches its call in Task 5. `generateLessonMaterial(html: string)` (Task 4) matches its call in Task 5. `parseLessonMaterialHandler(request)` (Task 5) matches its test. `useParseLessonMaterial()` (Task 6) is used in Task 8. `MaterialUpload`/`MaterialPreview` (Task 7) props match the container's usage (Task 8). `parsedLessonMaterialAtom` (Task 8) type matches `LessonMaterialGeneration`.
