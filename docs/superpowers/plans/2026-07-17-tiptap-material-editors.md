# Themed TipTap Lesson-Material Editors — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the lesson-material editor's HTML `<textarea>`s (`text`, `proTips`, `assignments`, and each key point) with themed TipTap rich-text editors whose editing surface reuses the existing `.material-prose` styles, so admins edit in the exact look of the published lesson.

**Architecture:** A reusable controlled `RichTextEditor` (TipTap v3 `useEditor`, value-in/HTML-out) with an essentials toolbar (fixed for prose fields, bubble menu for key points) and a Base UI link popover. The editable ProseMirror node carries the `.material-prose` class (via `editorProps.attributes.class`) for content styling; chrome uses Tailwind theme-token utilities. The RHF form drives the editors through `Controller`s; `StringListField` gains a `renderItem` prop so key points render editors while links keep plain inputs.

**Tech Stack:** TipTap v3 (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extensions`, `@tiptap/pm`), Base UI (`@base-ui/react/popover`), react-hook-form, Tailwind v4 theme tokens, Vitest + jsdom, Biome, pnpm.

## Global Constraints

- **Package manager:** pnpm. Install with `pnpm add <pkg>@latest` (latest deps).
- **Imports:** use `#/…` (maps to `./src/*`) for cross-dir and relative (`./…`) for siblings. NEVER `@/…` — vitest can't resolve it.
- **Vitest mocking:** any fn/class referenced inside a `vi.mock` factory must come from `vi.hoisted(() => ({...}))`. Component tests use `// @vitest-environment jsdom` + `@testing-library/react`.
- **Theme tokens only — no hardcoded hex.** Reuse the existing `.material-prose` class for editor content. Chrome uses Tailwind utilities matching sibling admin components: `border-gray-6`, `bg-gray-1`/`bg-gray-2`, `text-gray-10/11/12`, `hover:bg-gray-4`, `focus-visible:ring-apple-9` / `focus-within:ring-apple-9`. Accent link color in content is already `var(--color-accent-11)` via `.material-prose`.
- **Logical CSS only** (`padding-inline`, `min-block-size`, `border-inline-start`, `float: inline-start`, Tailwind `ps-*`/`ms-*`).
- **Presentational purity exception:** `RichTextEditor` uses the `useEditor` hook, so it is NOT a pure presentational component. This is an allowed, documented exception (third-party editor integration, like the repo's RHF field-array components). Add a justification comment. `RichTextToolbar`, `LinkPopover` stay pure (driven by a passed `editor`).
- **Lint/format:** Biome — `pnpm exec biome check --write <files>` before each commit. Tests: `pnpm exec vitest run <path>`. Typecheck: `pnpm exec tsc --noEmit` — expect ONLY the 3 pre-existing unrelated `src/routes/api/lesson/ai-test/*.ts` errors; none in feature files.
- **Uncommitted user files:** `package.json`, `src/db/schema.ts`, `CLAUDE.md` carry the user's unrelated edits. NEVER `git add -A`/`git add .`. Stage only this feature's explicit paths. The TipTap install touches `package.json` + `pnpm-lock.yaml` — dep-dance (Task 1).
- **CRITICAL — test-rendered components must be hookless (or use only library hooks).** PRE-EXISTING, documented repo issue (top-of-file note in `src/components/video-player/hooks.ts`): this repo's Vite/Vitest pipeline (react-compiler + TanStack Start) throws "Invalid hook call" when a test RENDERS a component that calls a **direct React hook** (`import { useState/useEffect/useRef } from 'react'`) — the dispatcher is null. **Library** hooks (jotai, TanStack Query, Base UI internals, motion) work fine; a plain `useState` component does NOT. Not fixable via `vi.mock`, `resolve.dedupe`, or the dep-optimizer (all verified failing). Consequences: `LinkPopover` is written **hookless** (uncontrolled `<form>` + `defaultValue` read via FormData on submit — no `useState`); `RichTextToolbar` is pure; both are render-tested. They also avoid `@tiptap` entirely (typing `editor` with the local `RichTextEditorApi`) — decoupling; the real editor is confined to `RichTextEditor`. `RichTextEditor` (Task 3) legitimately uses `useEditor` + `useEffect` — works in the app (bug is Vitest-only) but CANNOT be render-tested, so its test covers the pure `normalizeEditorHtml` helper and marks the mount smoke `it.skip` (real editing = manual, Task 6). `material-form.tsx` (Task 5) is presentational with no direct hooks and no dedicated test — fine.
- **TipTap v3 API notes** (verify against installed types with `tsc`): `useEditor`/`EditorContent` from `@tiptap/react`; `BubbleMenu` from `@tiptap/react/menus` (no extension needed); `StarterKit` from `@tiptap/starter-kit` (bundles Link, Underline, ListKeymap — configure Link via `StarterKit.configure({ link: {...} })`); `Placeholder` from `@tiptap/extensions`; `type Editor` from `@tiptap/react`. `editor.commands.setContent(html, { emitUpdate: false })` is the v3 signature. If `tsc` rejects the options object on the installed version, fall back to a ref-guard around `onUpdate` (see Task 3 note) — do not loop.

---

### Task 1: Install TipTap v3 dependencies

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (via `pnpm add`)

**Interfaces:**
- Produces: `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extensions`, `@tiptap/pm` available for import in later tasks.

- [ ] **Step 1: Install (dep-dance to protect the user's uncommitted package.json)**

```bash
git stash push -- package.json
pnpm add @tiptap/react@latest @tiptap/starter-kit@latest @tiptap/extensions@latest @tiptap/pm@latest
git stash pop
```

If `git stash pop` conflicts in `package.json`, keep BOTH the user's edits and the four new dependency lines.

- [ ] **Step 2: Verify the packages resolve and expose the expected API**

Run:
```bash
node -e "const r=require('@tiptap/react'); console.log('react', typeof r.useEditor, typeof r.EditorContent); const m=require('@tiptap/react/menus'); console.log('menus', typeof m.BubbleMenu); const sk=require('@tiptap/starter-kit'); console.log('starterkit', typeof (sk.default||sk)); const ex=require('@tiptap/extensions'); console.log('placeholder', typeof ex.Placeholder);"
```
Expected: all print `function` (or `object` for EditorContent). If `@tiptap/react/menus` or `@tiptap/extensions.Placeholder` is missing, STOP and report — the installed major may differ from v3; do not improvise import paths.

- [ ] **Step 3: Typecheck unaffected**

Run: `pnpm exec tsc --noEmit`
Expected: only the 3 pre-existing `ai-test` errors.

- [ ] **Step 4: Commit (explicit paths only)**

```bash
pnpm exec biome check --write package.json
git add package.json pnpm-lock.yaml
git commit -m "build: add TipTap v3 (react, starter-kit, extensions, pm)"
```

If `git status` shows the user's unrelated `package.json` edits staged, `git restore --staged package.json` then `git add -p package.json` and stage ONLY the four TipTap dependency hunks.

---

### Task 2: `RichTextToolbar` + `LinkPopover`

**Files:**
- Create: `src/components/admin/lesson-config/rich-text-editor-api.ts`
- Create: `src/components/admin/lesson-config/link-popover.tsx`
- Create: `src/components/admin/lesson-config/rich-text-toolbar.tsx`
- Test: `src/components/admin/lesson-config/__tests__/rich-text-toolbar.test.tsx`

**Interfaces:**
- Consumes: nothing from `@tiptap` (see the CRITICAL constraint). Uses the LOCAL `RichTextEditorApi`.
- Produces:
  - `rich-text-editor-api.ts` — a local structural type `RichTextEditorApi` (+ `RichTextChain`) covering only what the toolbar/popover call, so these files never import `@tiptap`. `RichTextEditor` (Task 3) casts its real TipTap editor to this when passing it down.
  - `LinkPopover({ editor })` — Base UI popover with a URL input; Apply sets the link on the current selection, Remove unsets it.
  - `RichTextToolbar({ editor, compact? })` — button row (bold, italic, H1–H3, bullet list, ordered list, blockquote, inline code, link). `compact` drops the headings (used by the bubble menu on key points).

- [ ] **Step 1: Write the failing test**

Create `src/components/admin/lesson-config/__tests__/rich-text-toolbar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RichTextToolbar } from '../rich-text-toolbar';

/** Minimal chainable mock of a TipTap editor for wiring assertions. */
function makeEditor(overrides: Record<string, unknown> = {}) {
  const run = vi.fn();
  const chain: Record<string, () => unknown> = {};
  const chainable = new Proxy(chain, {
    get(_t, prop) {
      if (prop === 'run') return run;
      return () => chainable;
    },
  });
  return {
    _run: run,
    chain: () => chainable,
    isActive: vi.fn(() => false),
    getAttributes: vi.fn(() => ({})),
    ...overrides,
  } as never;
}

describe('RichTextToolbar', () => {
  it('renders the essential controls', () => {
    render(<RichTextToolbar editor={makeEditor()} />);
    expect(screen.getByRole('button', { name: /bold/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /italic/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /heading 1/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /bullet list/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /link/i })).toBeTruthy();
  });

  it('runs the bold command on click', async () => {
    const editor = makeEditor();
    render(<RichTextToolbar editor={editor} />);
    await userEvent.click(screen.getByRole('button', { name: /bold/i }));
    expect((editor as { _run: ReturnType<typeof vi.fn> })._run).toHaveBeenCalled();
  });

  it('reflects active state via aria-pressed', () => {
    const editor = makeEditor({ isActive: vi.fn((n: string) => n === 'bold') });
    render(<RichTextToolbar editor={editor} />);
    expect(
      screen.getByRole('button', { name: /bold/i }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: /italic/i }).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('compact mode omits headings', () => {
    render(<RichTextToolbar editor={makeEditor()} compact />);
    expect(screen.queryByRole('button', { name: /heading 1/i })).toBeNull();
    expect(screen.getByRole('button', { name: /bold/i })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/admin/lesson-config/__tests__/rich-text-toolbar.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3a: Create the local editor-API type** (no `@tiptap` import)

Create `src/components/admin/lesson-config/rich-text-editor-api.ts`:

```ts
/**
 * Minimal structural slice of TipTap's Editor used by the toolbar + link
 * popover. Defined locally (NOT imported from @tiptap) so these components —
 * and their render-tests — never pull @tiptap into the module graph, which in
 * this repo's Vite/react-compiler pipeline duplicates React and breaks hooks.
 * RichTextEditor (which owns the real @tiptap editor) casts to this when passing
 * the editor down.
 */
export interface RichTextChain {
  focus: () => RichTextChain;
  toggleBold: () => RichTextChain;
  toggleItalic: () => RichTextChain;
  toggleHeading: (attrs: { level: 1 | 2 | 3 }) => RichTextChain;
  toggleBulletList: () => RichTextChain;
  toggleOrderedList: () => RichTextChain;
  toggleBlockquote: () => RichTextChain;
  toggleCode: () => RichTextChain;
  extendMarkRange: (name: string) => RichTextChain;
  setLink: (attrs: { href: string }) => RichTextChain;
  unsetLink: () => RichTextChain;
  run: () => boolean;
}

export interface RichTextEditorApi {
  isActive: (name: string, attrs?: Record<string, unknown>) => boolean;
  getAttributes: (name: string) => Record<string, unknown>;
  chain: () => RichTextChain;
}
```

- [ ] **Step 3b: Implement `LinkPopover`**

Create `src/components/admin/lesson-config/link-popover.tsx`:

```tsx
import { Popover } from '@base-ui/react/popover';
import { Link2, Link2Off } from 'lucide-react';
import { useState } from 'react';
import type { RichTextEditorApi } from './rich-text-editor-api';

/**
 * Link add/edit popover for the rich-text toolbar. Prefills from the current
 * selection's link; Apply sets it on the extended mark range, Remove unsets it.
 */
export const LinkPopover = ({ editor }: { editor: RichTextEditorApi }) => {
  const [href, setHref] = useState('');

  const apply = () => {
    const url = href.trim();
    if (!url) return;
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };
  const remove = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
  };

  return (
    <Popover.Root
      onOpenChange={(open) => {
        if (open) setHref((editor.getAttributes('link').href as string) ?? '');
      }}
    >
      <Popover.Trigger
        aria-label="Link"
        aria-pressed={editor.isActive('link')}
        className="rounded p-1.5 text-gray-11 transition-colors hover:bg-gray-4 hover:text-gray-12 aria-pressed:bg-gray-4 aria-pressed:text-gray-12"
      >
        <Link2 className="h-4 w-4" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6}>
          <Popover.Popup className="flex items-center gap-1.5 rounded-lg border border-gray-6 bg-gray-2 p-1.5 shadow-lg">
            <input
              type="url"
              value={href}
              onChange={(e) => setHref(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  apply();
                }
              }}
              placeholder="https://…"
              aria-label="Link URL"
              className="w-56 rounded-md border border-gray-6 bg-gray-1 px-2 py-1 text-gray-12 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
            />
            <Popover.Close
              onClick={apply}
              className="rounded-md bg-apple-9 px-2.5 py-1 font-medium text-apple-contrast text-sm hover:bg-apple-10"
            >
              Apply
            </Popover.Close>
            <Popover.Close
              onClick={remove}
              aria-label="Remove link"
              className="rounded-md p-1.5 text-gray-11 hover:bg-gray-4 hover:text-gray-12"
            >
              <Link2Off className="h-4 w-4" aria-hidden="true" />
            </Popover.Close>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
};
```

Note: verify the Base UI Popover subcomponent names against the installed `@base-ui/react` (Root/Trigger/Portal/Positioner/Popup/Close) — mirror an existing usage such as `src/components/video-player/parts/playback-rate-menu.tsx` (Menu) or any Popover already in the repo. If `Popover.Close` doesn't accept `onClick`+close, wrap the actions in plain buttons and close via `Popover.Root`'s controlled `open` state.

- [ ] **Step 4: Implement `RichTextToolbar`**

Create `src/components/admin/lesson-config/rich-text-toolbar.tsx`:

```tsx
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Quote,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { LinkPopover } from './link-popover';
import type { RichTextEditorApi } from './rich-text-editor-api';

interface ToolbarButtonProps {
  label: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  active: boolean;
  onClick: () => void;
}

const ToolbarButton = ({ label, icon: Icon, active, onClick }: ToolbarButtonProps) => (
  <button
    type="button"
    aria-label={label}
    aria-pressed={active}
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
    className="rounded p-1.5 text-gray-11 transition-colors hover:bg-gray-4 hover:text-gray-12 aria-pressed:bg-gray-4 aria-pressed:text-gray-12"
  >
    <Icon className="h-4 w-4" aria-hidden />
  </button>
);

/**
 * Essentials toolbar for RichTextEditor, driven by a passed TipTap editor.
 * `compact` (bubble menu on key points) omits the block-level headings.
 */
export const RichTextToolbar = ({
  editor,
  compact = false,
}: {
  editor: RichTextEditorApi;
  compact?: boolean;
}) => {
  return (
    <div className="flex flex-wrap items-center gap-0.5">
      <ToolbarButton
        label="Bold"
        icon={Bold}
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        label="Italic"
        icon={Italic}
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      {!compact && (
        <>
          <span className="mx-1 h-5 w-px bg-gray-6" aria-hidden />
          <ToolbarButton
            label="Heading 1"
            icon={Heading1}
            active={editor.isActive('heading', { level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          />
          <ToolbarButton
            label="Heading 2"
            icon={Heading2}
            active={editor.isActive('heading', { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          />
          <ToolbarButton
            label="Heading 3"
            icon={Heading3}
            active={editor.isActive('heading', { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          />
        </>
      )}
      <span className="mx-1 h-5 w-px bg-gray-6" aria-hidden />
      <ToolbarButton
        label="Bullet list"
        icon={List}
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        label="Ordered list"
        icon={ListOrdered}
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarButton
        label="Blockquote"
        icon={Quote}
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />
      <ToolbarButton
        label="Inline code"
        icon={Code}
        active={editor.isActive('code')}
        onClick={() => editor.chain().focus().toggleCode().run()}
      />
      <span className="mx-1 h-5 w-px bg-gray-6" aria-hidden />
      <LinkPopover editor={editor} />
    </div>
  );
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/admin/lesson-config/__tests__/rich-text-toolbar.test.tsx`
Expected: PASS (4 tests). (`LinkPopover`'s trigger provides the "Link" button the toolbar test asserts.)

- [ ] **Step 6: Typecheck, format + commit**

```bash
pnpm exec tsc --noEmit
pnpm exec biome check --write src/components/admin/lesson-config/rich-text-editor-api.ts src/components/admin/lesson-config/link-popover.tsx src/components/admin/lesson-config/rich-text-toolbar.tsx src/components/admin/lesson-config/__tests__/rich-text-toolbar.test.tsx
git add src/components/admin/lesson-config/rich-text-editor-api.ts src/components/admin/lesson-config/link-popover.tsx src/components/admin/lesson-config/rich-text-toolbar.tsx src/components/admin/lesson-config/__tests__/rich-text-toolbar.test.tsx
git commit -m "feat(admin): add rich-text toolbar + link popover"
```

---

### Task 3: `RichTextEditor` + themed editor CSS

**Files:**
- Create: `src/components/admin/lesson-config/rich-text-editor.tsx`
- Modify: `src/styles.css` (append a `.rich-editor` block)
- Test: `src/components/admin/lesson-config/__tests__/rich-text-editor.test.tsx`

**Interfaces:**
- Consumes: `useEditor`, `EditorContent`, `type Editor` from `@tiptap/react`; `BubbleMenu` from `@tiptap/react/menus`; `StarterKit` from `@tiptap/starter-kit`; `Placeholder` from `@tiptap/extensions`; `RichTextToolbar` (Task 2).
- Produces: `RichTextEditor({ value, onChange, placeholder?, ariaLabel?, toolbar? })` and an exported pure helper `normalizeEditorHtml(html: string): string` (maps empty TipTap doc → `''`).

- [ ] **Step 1: Write the failing test** (targets only the pure helper + a mount smoke — contenteditable behavior is manual)

Create `src/components/admin/lesson-config/__tests__/rich-text-editor.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { normalizeEditorHtml, RichTextEditor } from '../rich-text-editor';

describe('normalizeEditorHtml', () => {
  it('maps an empty TipTap document to an empty string', () => {
    expect(normalizeEditorHtml('<p></p>')).toBe('');
    expect(normalizeEditorHtml('<p><br></p>')).toBe('');
    expect(normalizeEditorHtml('   ')).toBe('');
  });
  it('passes real content through unchanged', () => {
    expect(normalizeEditorHtml('<p>Hi</p>')).toBe('<p>Hi</p>');
  });
});

describe('RichTextEditor', () => {
  // Skipped: importing this module pulls @tiptap, which in this repo's Vite
  // pipeline duplicates React under Vitest — rendering a hook-using component
  // then throws "Invalid hook call". The non-render `normalizeEditorHtml` tests
  // above still pass (no hooks run). Real editor behavior is verified manually
  // (Task 6). Importing the module here is fine — the dup only bites on render.
  it.skip('mounts and renders a labelled region (manual-only — see comment)', () => {
    const { container } = render(
      <RichTextEditor value="<p>Hello</p>" onChange={vi.fn()} ariaLabel="Text" />,
    );
    expect(container.querySelector('.rich-editor')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/admin/lesson-config/__tests__/rich-text-editor.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/components/admin/lesson-config/rich-text-editor.tsx`:

```tsx
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { useEffect } from 'react';
import type { RichTextEditorApi } from './rich-text-editor-api';
import { RichTextToolbar } from './rich-text-toolbar';

/** TipTap's empty document serializes to `<p></p>`; treat that as empty. */
export function normalizeEditorHtml(html: string): string {
  const stripped = html
    .replace(/<p>\s*(<br\s*\/?>)?\s*<\/p>/gi, '')
    .trim();
  return stripped;
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  toolbar?: 'fixed' | 'bubble';
}

/**
 * Why this component holds a hook (not a pure presentational component):
 * - Checked: no base/design-system rich-text editor exists.
 * - Checked: TipTap's editing state can only be created via the `useEditor`
 *   hook; it cannot be lifted to a parent as props.
 * - Reason: third-party editor integration — the same accepted exception the
 *   repo makes for RHF field-array components. The editor is controlled
 *   (value in, HTML out) so the container still owns the data.
 *
 * Content is styled by the shared `.material-prose` class (applied to the
 * ProseMirror node) so editing matches the published lesson exactly.
 */
export const RichTextEditor = ({
  value,
  onChange,
  placeholder = 'Start writing…',
  ariaLabel,
  toolbar = 'fixed',
}: RichTextEditorProps) => {
  const compact = toolbar === 'bubble';
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: 'https',
          HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
        },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: `material-prose rich-editor__content${compact ? ' rich-editor__content--compact' : ''}`,
        ...(ariaLabel ? { 'aria-label': ariaLabel, role: 'textbox' } : {}),
      },
    },
    onUpdate: ({ editor }) => onChange(normalizeEditorHtml(editor.getHTML())),
  });

  // Sync external value changes (form.reset after load / docx parse) into the
  // editor without re-emitting onChange. `emitUpdate: false` prevents the loop;
  // the equality guard prevents clobbering the caret mid-edit.
  useEffect(() => {
    if (!editor) return;
    if (normalizeEditorHtml(value) === normalizeEditorHtml(editor.getHTML())) {
      return;
    }
    editor.commands.setContent(value || '', { emitUpdate: false });
  }, [value, editor]);

  return (
    <div className="rich-editor rounded-lg border border-gray-6 bg-gray-1 focus-within:ring-2 focus-within:ring-apple-9">
      {toolbar === 'fixed' && editor && (
        <div className="flex flex-wrap items-center gap-0.5 border-gray-6 border-b p-1">
          <RichTextToolbar editor={editor as unknown as RichTextEditorApi} />
        </div>
      )}
      {toolbar === 'bubble' && editor && (
        <BubbleMenu
          editor={editor}
          className="flex items-center gap-0.5 rounded-lg border border-gray-6 bg-gray-2 p-1 shadow-lg"
        >
          <RichTextToolbar
            editor={editor as unknown as RichTextEditorApi}
            compact
          />
        </BubbleMenu>
      )}
      <EditorContent editor={editor} />
    </div>
  );
};
```

Version-robustness note: if `tsc` rejects `setContent(value, { emitUpdate: false })` on the installed `@tiptap` version, replace the sync with a ref guard: a `useRef(false)` set true immediately before `editor.commands.setContent(value)` and checked at the top of `onUpdate` (early-return + reset). Do not remove the equality guard.

- [ ] **Step 4: Add themed editor chrome CSS**

Append to the END of `src/styles.css`:

```css
@layer components {
  /* Rich-text editor chrome. Content itself is styled by .material-prose,
     applied to the ProseMirror node via editorProps. */
  .rich-editor__content {
    min-block-size: 8rem;
    padding: 0.75rem;
    outline: none;
  }
  .rich-editor__content.rich-editor__content--compact {
    min-block-size: 2.25rem;
    padding: 0.5rem 0.625rem;
  }
  /* Placeholder (from @tiptap/extensions Placeholder). */
  .rich-editor__content p.is-editor-empty:first-child::before {
    content: attr(data-placeholder);
    color: var(--color-gray-9);
    float: inline-start;
    block-size: 0;
    pointer-events: none;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/admin/lesson-config/__tests__/rich-text-editor.test.tsx`
Expected: the 2 `normalizeEditorHtml` tests PASS; the mount test reports as skipped (1 skipped). Do NOT un-skip it — see the CRITICAL constraint (rendering a @tiptap component under Vitest throws "Invalid hook call").

- [ ] **Step 6: Typecheck, format + commit**

```bash
pnpm exec tsc --noEmit
pnpm exec biome check --write src/components/admin/lesson-config/rich-text-editor.tsx src/components/admin/lesson-config/__tests__/rich-text-editor.test.tsx src/styles.css
git add src/components/admin/lesson-config/rich-text-editor.tsx src/components/admin/lesson-config/__tests__/rich-text-editor.test.tsx src/styles.css
git commit -m "feat(admin): add themed TipTap RichTextEditor"
```

---

### Task 4: `StringListField` `renderItem` prop

**Files:**
- Modify: `src/components/admin/lesson-config/string-list-field.tsx`
- Test: `src/components/admin/lesson-config/__tests__/string-list-field.test.tsx` (extend existing)

**Interfaces:**
- Produces: `StringListField` gains optional `renderItem?: (args: { value: string; onChange: (v: string) => void; index: number }) => React.ReactNode`. When provided, each row renders `renderItem(...)` instead of the default `<input>` (row wrapper, remove button, legend, and add button unchanged). When absent, behavior is identical to today.

- [ ] **Step 1: Add the failing test cases**

Append to `src/components/admin/lesson-config/__tests__/string-list-field.test.tsx` (inside the existing `describe`):

```tsx
  it('renders a custom item via renderItem instead of the default input', () => {
    render(
      <StringListField
        label="Key points"
        itemNoun="key point"
        value={['Alpha']}
        onChange={vi.fn()}
        renderItem={({ value }) => <div data-testid="custom">{value}</div>}
      />,
    );
    expect(screen.getByTestId('custom').textContent).toBe('Alpha');
    // The default text input is not used when renderItem is provided.
    expect(screen.queryByDisplayValue('Alpha')).toBeNull();
  });

  it('renderItem rows still support remove', async () => {
    const onChange = vi.fn();
    render(
      <StringListField
        label="Key points"
        itemNoun="key point"
        value={['Alpha', 'Bravo']}
        onChange={onChange}
        renderItem={({ value }) => <div>{value}</div>}
      />,
    );
    const removes = screen.getAllByRole('button', { name: /remove/i });
    await userEvent.click(removes[0]);
    expect(onChange).toHaveBeenCalledWith(['Bravo']);
  });
```

(Ensure `userEvent` is imported at the top of the existing test file; it already imports `render`/`screen`/`vi`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/admin/lesson-config/__tests__/string-list-field.test.tsx`
Expected: FAIL — `renderItem` not supported (custom node not rendered).

- [ ] **Step 3: Implement**

Edit `src/components/admin/lesson-config/string-list-field.tsx`. Update the props type and the row rendering:

```tsx
import type { ReactNode } from 'react';
import { Plus, X } from 'lucide-react';

export const StringListField = ({
  label,
  itemNoun,
  value,
  onChange,
  renderItem,
}: {
  label: string;
  itemNoun: string;
  value: string[];
  onChange: (next: string[]) => void;
  renderItem?: (args: {
    value: string;
    onChange: (v: string) => void;
    index: number;
  }) => ReactNode;
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
        // biome-ignore lint/suspicious/noArrayIndexKey: this list is controlled — value always comes from props, so index is a stable enough key for this render.
        <div key={i} className="flex items-start gap-2">
          {renderItem ? (
            <div className="flex-1">
              {renderItem({ value: item, onChange: (next) => update(i, next), index: i })}
            </div>
          ) : (
            <>
              <label className="sr-only" htmlFor={`${label}-${i}`}>
                {itemNoun} {i + 1}
              </label>
              <input
                id={`${label}-${i}`}
                value={item}
                onChange={(e) => update(i, e.target.value)}
                className="flex-1 rounded-md border border-gray-6 bg-gray-1 px-3 py-2 text-gray-12 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
              />
            </>
          )}
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
        onClick={() => onChange([...value, ''])}
        className="inline-flex w-fit items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium text-gray-11 text-sm transition-colors hover:bg-gray-4 hover:text-gray-12"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        Add {itemNoun}
      </button>
    </fieldset>
  );
};
```

(The row wrapper changes from `items-center` to `items-start` so the remove button aligns to the top of a multi-line editor.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/admin/lesson-config/__tests__/string-list-field.test.tsx`
Expected: PASS (existing 3 + 2 new = 5).

- [ ] **Step 5: Typecheck, format + commit**

```bash
pnpm exec tsc --noEmit
pnpm exec biome check --write src/components/admin/lesson-config/string-list-field.tsx src/components/admin/lesson-config/__tests__/string-list-field.test.tsx
git add src/components/admin/lesson-config/string-list-field.tsx src/components/admin/lesson-config/__tests__/string-list-field.test.tsx
git commit -m "feat(admin): add renderItem prop to StringListField"
```

---

### Task 5: Wire the editors into the material form

**Files:**
- Modify: `src/components/admin/lesson-config/material-form.tsx`
- Delete: `src/components/admin/lesson-config/material-text-fields.tsx`

**Interfaces:**
- Consumes: `RichTextEditor` (Task 3), `StringListField` with `renderItem` (Task 4).
- Produces: `MaterialForm` renders `text`/`proTips`/`assignments` as `Controller` → `RichTextEditor` (fixed toolbar), `jobOfTheDay` as an inline `register` input, and key points as `StringListField` with a `RichTextEditor` (bubble) `renderItem`. Props unchanged (`register`, `control`, `errors`, `onSubmit`, `isSaving`, `saveError`). The container is untouched.

- [ ] **Step 1: Replace `material-form.tsx`**

Overwrite `src/components/admin/lesson-config/material-form.tsx` with:

```tsx
import { Loader2 } from 'lucide-react';
import type { FormEventHandler } from 'react';
import {
  type Control,
  Controller,
  type FieldErrors,
  type UseFormRegister,
} from 'react-hook-form';
import type { LessonMaterialGeneration } from '#/types';
import { RichTextEditor } from './rich-text-editor';
import { StringListField } from './string-list-field';
import { QuizField } from './quiz-field';

const labelCls = 'font-medium text-gray-11 text-xs uppercase tracking-wide';

/**
 * Presentational body of the material edit form. Prose fields (text, proTips,
 * assignments) and key points use RichTextEditor via Controller; jobOfTheDay is
 * a plain URL input; quiz + links keep their controls. The container owns
 * useForm and submission.
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
      <div className="flex flex-col gap-1.5">
        <span className={labelCls}>Text</span>
        <Controller
          control={control}
          name="text"
          render={({ field }) => (
            <RichTextEditor
              value={field.value ?? ''}
              onChange={field.onChange}
              ariaLabel="Text"
              placeholder="Lesson text…"
            />
          )}
        />
        {errors.text && (
          <p role="alert" className="text-red-11 text-sm">
            {errors.text.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={labelCls}>Pro tips</span>
        <Controller
          control={control}
          name="proTips"
          render={({ field }) => (
            <RichTextEditor
              value={field.value ?? ''}
              onChange={field.onChange}
              ariaLabel="Pro tips"
              placeholder="Pro tips…"
            />
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={labelCls}>Assignments</span>
        <Controller
          control={control}
          name="assignments"
          render={({ field }) => (
            <RichTextEditor
              value={field.value ?? ''}
              onChange={field.onChange}
              ariaLabel="Assignments"
              placeholder="Assignments…"
            />
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="material-job" className={labelCls}>
          Job of the day (URL)
        </label>
        <input
          id="material-job"
          type="text"
          {...register('jobOfTheDay')}
          className="rounded-md border border-gray-6 bg-gray-1 px-3 py-2 text-gray-12 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
        />
      </div>

      <Controller
        control={control}
        name="keyPoints"
        render={({ field }) => (
          <StringListField
            label="Key points"
            itemNoun="key point"
            value={field.value ?? []}
            onChange={field.onChange}
            renderItem={({ value, onChange, index }) => (
              <RichTextEditor
                value={value}
                onChange={onChange}
                toolbar="bubble"
                ariaLabel={`Key point ${index + 1}`}
                placeholder="Key point…"
              />
            )}
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

- [ ] **Step 2: Delete the now-unused component**

```bash
git rm src/components/admin/lesson-config/material-text-fields.tsx
```

Confirm nothing else imports it:
```bash
grep -rn "material-text-fields\|MaterialTextFields" src
```
Expected: no matches (only the deleted file / this command). If anything references it, STOP and report.

- [ ] **Step 3: Typecheck + full suite (no test regressions)**

Run: `pnpm exec tsc --noEmit`
Expected: only the 3 pre-existing `ai-test` errors.
Run: `pnpm test`
Expected: all pass (the removed `MaterialTextFields` had no dedicated test; `material-form` has no dedicated test).

- [ ] **Step 4: Dev-boot smoke**

Run `pnpm dev` briefly; confirm it boots with no compile/runtime error referencing the changed files; stop it. (Interactive admin editing is verified in Task 6.)

- [ ] **Step 5: Format + commit**

```bash
pnpm exec biome check --write src/components/admin/lesson-config/material-form.tsx
git add src/components/admin/lesson-config/material-form.tsx src/components/admin/lesson-config/material-text-fields.tsx
git commit -m "feat(admin): use TipTap editors for material prose fields + key points"
```

(The `git add` of the deleted path stages the deletion.)

---

### Task 6: Full green + manual verification

**Files:** none (verification only; `src/env.ts` untouched).

- [ ] **Step 1: Whole suite + typecheck + lint**

Run: `pnpm test` → all pass.
Run: `pnpm exec tsc --noEmit` → only the 3 pre-existing `ai-test` errors.
Run: `pnpm exec biome check src/components/admin/lesson-config/ src/styles.css` → clean (run with `--write` first if fixable).

- [ ] **Step 2: Manual verification (real app, admin session)**

Run `pnpm dev`, sign in as admin, open a course board → a lesson's Configure dialog → **Material** tab. Verify:
1. Existing material loads into the editors (formatted, not raw HTML).
2. Toolbar works on `text`/`proTips`/`assignments`: bold, italic, H1–H3, bullet/ordered list, blockquote, inline code, and the link popover (Apply + Remove).
3. Key points show the bubble menu on text selection; editing works; add/remove key point works.
4. Upload a `.docx` → the parsed HTML fills the editors (rich, editable).
5. Save → reopen the tab → content persists and renders identically to the published lesson (same look as `.material-prose`).
6. Check both light and dark themes — colors come from tokens (no stray hardcoded colors); placeholder text is visible; focus ring shows.

---

## Self-Review

**Spec coverage:**
- TipTap v3 deps (react, starter-kit, extensions, pm) → Task 1 ✓
- Essentials toolbar + link popover → Task 2 ✓
- RichTextEditor (controlled sync, fixed/bubble, `.material-prose` content, SSR) + themed chrome CSS → Task 3 ✓
- StringListField `renderItem` (key points rich; links plain) → Task 4 ✓
- Integration: text/proTips/assignments Controllers, jobOfTheDay input, keyPoints renderItem, delete material-text-fields → Task 5 ✓
- Manual + full green → Task 6 ✓
- Out-of-scope (quiz markdown, colors/highlight/code-block, tables/images) correctly excluded.

**Placeholder scan:** No TBD/TODO. Version-sensitive TipTap APIs (`setContent` options, `@tiptap/react/menus`, StarterKit `link` config) carry explicit verify-against-tsc / fallback instructions rather than being left vague.

**Type consistency:** `RichTextToolbar({ editor, compact })` (Task 2) is consumed by `RichTextEditor` (Task 3) with `compact` for bubble mode. `LinkPopover({ editor })` (Task 2) is used inside `RichTextToolbar`. `normalizeEditorHtml` (Task 3) is used in `RichTextEditor`'s `onUpdate` + sync effect and tested directly. `RichTextEditor({ value, onChange, placeholder?, ariaLabel?, toolbar? })` (Task 3) matches every call site in `material-form` (Task 5) and the `StringListField` `renderItem` (Task 4→5). `StringListField`'s new `renderItem` signature (Task 4) matches its use in Task 5. `MaterialForm` props are unchanged, so `material-section-container` needs no edit.
