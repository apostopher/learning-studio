# Themed TipTap editors for lesson material — design

**Date:** 2026-07-17
**Status:** Approved (design), pending implementation plan

## Summary

Replace the plain HTML `<textarea>`s in the lesson-material editor (the Material
tab of the lesson-config dialog) with a TipTap rich-text editor, styled entirely
with the project's CSS theme tokens (not TipTap's stock styles). The editable
surface reuses the existing `.material-prose` styles so what an admin types looks
exactly like the published lesson.

Ported from the old `airmanship-web/src/components/tiptap-text-editor.tsx` — its
*feature inventory* only. The old code is Next.js `styled-jsx` with hardcoded
light/dark hex, debug `console.log`s, `prompt()` link dialogs, and duplicated
`!important` CSS; none of that carries over.

## Decisions

- **Fields converted:** `text`, `proTips`, `assignments` (multi-line HTML prose)
  become full TipTap editors; each **key point** (also HTML) becomes a compact
  editor with a bubble (selection) menu. `jobOfTheDay` (URL) and `links` (URLs)
  stay plain inputs; `quiz` stays markdown (out of scope — TipTap emits HTML).
- **Toolbar (essentials only):** bold, italic, H1–H3, bullet list, ordered list,
  blockquote, inline code, link. Every one renders identically on the student
  side via `.material-prose`. Dropped from the old impl: highlight, text colors,
  code block, horizontal rule (not in `.material-prose`, would render wrong).
- **Link UX:** an inline Base UI `Popover` (URL input + Apply/Remove) anchored to
  the toolbar's link button. No native `prompt()`.
- **Styling:** the editable `EditorContent` gets the existing `.material-prose`
  class (zero duplicated color rules). Editor chrome (border, focus ring,
  toolbar, buttons, bubble menu) uses Tailwind utilities matching sibling admin
  components (`border-gray-6`, `bg-gray-2`, `focus-visible:ring-apple-9`,
  `text-gray-11/12`), plus a small `.rich-editor` block in `src/styles.css` for
  the ProseMirror-only bits (placeholder `::before`, min-height, focus-within) —
  all via `--color-*` tokens.
- **StringListField gets a `renderItem` render-prop** rather than being forked:
  key points pass a `RichTextEditor` (bubble); links keep the default input.
- **Deps: TipTap v3.** `@tiptap/react`, `@tiptap/starter-kit`,
  `@tiptap/extensions` (Placeholder), `@tiptap/pm` (ProseMirror peer). Link is
  bundled in StarterKit v3 — configured via `StarterKit.configure({ link })`, not
  a separate package. `BubbleMenu` from `@tiptap/react/menus`.

## Components (all in `src/components/admin/lesson-config/`)

### `RichTextEditor` — `rich-text-editor.tsx`
- Props: `{ value: string /* HTML */, onChange: (html: string) => void,
  placeholder?: string, ariaLabel?: string, toolbar?: 'fixed' | 'bubble' }`.
- Controlled: value in (HTML), `onChange` out (HTML).
- Uses TipTap `useEditor` — **not a pure presentational component**; documented
  exception (third-party editor integration, like the RHF field-array exception
  in the repo). Include the required justification comment.
- `immediatelyRender: false` (TanStack Start SSR).
- Extensions: `StarterKit.configure({ link: { openOnClick: false, autolink: true,
  defaultProtocol: 'https', HTMLAttributes: { rel: 'noopener noreferrer',
  target: '_blank' } } })` + `Placeholder.configure({ placeholder })`.
- `toolbar: 'fixed'` → renders `RichTextToolbar` above the content.
  `toolbar: 'bubble'` → renders a `BubbleMenu` (from `@tiptap/react/menus`)
  wrapping the same toolbar controls; no persistent bar.
- `EditorContent` carries `class="material-prose"` (+ a `rich-editor__content`
  hook for placeholder/min-height CSS).

### `RichTextToolbar` — `rich-text-toolbar.tsx`
- Presentational button row driven by a passed `editor`. lucide icons
  (Bold, Italic, Heading1/2/3, List, ListOrdered, Quote, Code, Link).
- Each button: `onClick` runs the editor command; `data-active` / aria-pressed
  from `editor.isActive(...)`; themed via Tailwind (active = `bg-gray-4
  text-gray-12`, idle = `text-gray-11 hover:bg-gray-4`).
- The link button opens `LinkPopover`.

### `LinkPopover` — `link-popover.tsx`
- Base UI `Popover` (`@base-ui/react/popover`) anchored to the link trigger.
- A URL `<input>` (prefilled from `editor.getAttributes('link').href`), Apply →
  `editor.chain().focus().extendMarkRange('link').setLink({ href }).run()`,
  Remove → `unsetLink()`. Themed, keyboard-accessible (Enter applies).

### `StringListField` (`string-list-field.tsx`) — extend
- Add optional `renderItem?: (args: { value: string; onChange: (v: string) =>
  void; index: number }) => React.ReactNode`. When present, render it in place of
  the default `<input>` (keep the row, remove button, legend, add button). When
  absent, behavior is unchanged (links).

## Controlled sync

TipTap is internally uncontrolled; sync carefully to avoid the old impl's loops:
- Initialize `useEditor({ content: value })`.
- `onUpdate`: `onChange(normalize(editor.getHTML()))` where `normalize` maps
  TipTap's empty document (`<p></p>`) to `''`.
- One effect: when the incoming `value` prop changes AND differs from the
  editor's current HTML, call `editor.commands.setContent(value, { emitUpdate:
  false })`. This is what updates the editors on `form.reset` after material load
  and after a Word-doc parse, without re-triggering `onChange`.
- Guard against setting content while the editor is focused/mid-edit (compare
  normalized HTML) so keystrokes aren't clobbered.

## Integration

- `material-form.tsx`: wrap `text`, `proTips`, `assignments` in `Controller` →
  `RichTextEditor` (toolbar `fixed`), replacing the `MaterialTextFields`
  textareas for those three. Key points' `StringListField` gains a `renderItem`
  that returns `<RichTextEditor toolbar="bubble" .../>`.
- `material-text-fields.tsx`: reduced to the single `jobOfTheDay` URL input
  (still `register`); the three prose textareas move to `material-form` as
  Controllers. (Rename left as `MaterialTextFields` for minimal churn, or inline
  the one field — decided in the plan.)
- Container (`material-section-container.tsx`) is unchanged — it already drives
  everything through the form; the reset-on-load/parse flow now updates the
  editors via the sync effect above.

## Styling detail

- `.material-prose` already themes headings, lists, code, `pre`, blockquote,
  `hr`, and links (with the external-link icon) via `--color-gray-*` /
  `--color-accent-*`. Applying it to the editor content is the whole "themed
  content" story.
- New `.rich-editor` rules in `src/styles.css` (in the existing components layer):
  - `.rich-editor__content .ProseMirror { min-block-size: …; outline: none;
    padding: … }`
  - placeholder: `.rich-editor__content .ProseMirror p.is-editor-empty:first-child::before
    { content: attr(data-placeholder); color: var(--color-gray-9); … }`
  - focus-within ring on the wrapper via a token, or Tailwind on the wrapper.
- Toolbar/buttons/bubble menu: Tailwind utilities in the components (no new CSS).

## Testing

- Pure/unit: `RichTextToolbar` (button click → command called on a mock editor;
  active state reflects `editor.isActive`), `LinkPopover` (Apply/Remove call the
  right chain), the empty-HTML `normalize` helper, `StringListField` `renderItem`
  (custom node rendered; add/remove still fire).
- `RichTextEditor`: light jsdom smoke test (mounts with initial value, emits it)
  — contenteditable interaction is unreliable in jsdom, so deep editing behavior
  is covered by manual verification in the running app.
- Manual: load existing material, parse a docx, edit via toolbar + bubble menu +
  link popover, Save, reopen → persisted; check light/dark theme.

## Out of scope

- Quiz rich editing (stays markdown — would need HTML↔markdown conversion).
- Highlight, text colors, code block, tables, images (not in `.material-prose`).
- A shared/global editor outside the lesson-material admin surface.

## Files

| File | Change |
| --- | --- |
| `package.json` | add `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extensions`, `@tiptap/pm` (latest) |
| `src/components/admin/lesson-config/rich-text-editor.tsx` | new |
| `src/components/admin/lesson-config/rich-text-toolbar.tsx` | new |
| `src/components/admin/lesson-config/link-popover.tsx` | new |
| `src/components/admin/lesson-config/string-list-field.tsx` | add `renderItem` |
| `src/components/admin/lesson-config/material-form.tsx` | Controllers for text/proTips/assignments; keyPoints renderItem |
| `src/components/admin/lesson-config/material-text-fields.tsx` | reduce to jobOfTheDay |
| `src/styles.css` | add `.rich-editor` chrome rules |
| `src/components/admin/lesson-config/__tests__/*` | toolbar, link-popover, renderItem, editor smoke tests |
