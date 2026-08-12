# Sticky toolbar for the long-form rich-text editors

**Date:** 2026-08-11
**Status:** Approved, ready for implementation

## Problem

In the lesson config modal's Content tab, the three long-form prose fields
(Text, Pro tips, Assignments) render `RichTextEditor` with its default fixed
toolbar. The editor grows to fit its content (`.rich-editor__content` has
`min-block-size: 8rem` and no maximum), and the modal's shared `ScrollArea`
does the scrolling. Once a field's content is longer than the viewport, its
toolbar scrolls out of reach — the author must scroll back to the top of the
field to apply any formatting.

## Considered and rejected: a selection bubble menu

`RichTextEditor` already supports `toolbar="bubble"`, wired to TipTap's
`BubbleMenu`, and the key-point and quiz fields already use it. Switching the
long-form fields to it was rejected.

`BubbleMenu` only appears when the selection is non-empty. The long-form
fields use `TOOLBAR_CONTROLS` — `bold, italic, h1, h2, h3, bulletList,
orderedList, blockquote, code, link` — of which eight are **block** commands
normally applied with a collapsed cursor sitting on a line. Bubble-only would
mean selecting a line's text before it could become a heading or a list item.
The content these fields hold is heavily structured (headings such as TITLE,
SCRIPT, Scene 1), so that regression would land on the most common action.

The existing split is therefore principled, not accidental: bubble for short
repeated fields whose `INLINE_CONTROLS` is `['bold', 'italic']` — two
selection-based marks — and fixed for long-form fields where block controls
matter. This change preserves it.

## Design

### Scope

Every call site that takes the default `toolbar="fixed"` is one of the three
long-form fields (`material-form.tsx:46`, `:67`, `:83`); the bubble call sites
pass `toolbar="bubble"` explicitly (`material-form.tsx:118`,
`quiz-field.tsx:73`, `:112`). Making the fixed bar sticky inside
`RichTextEditor` therefore affects exactly those three fields. No new prop and
no per-call-site opt-in — there is no fixed-toolbar call site that should
*not* be sticky.

### The change

One `className`, on the fixed-toolbar wrapper at
`src/components/admin/lesson-config/rich-text-editor.tsx:105`:

```
 flex flex-wrap items-center gap-0.5 border-gray-6 border-b p-1
→ sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-t-lg
  border-gray-6 border-b bg-gray-1 p-1
```

Three additions beyond `sticky top-0`, each load-bearing:

- **`bg-gray-1`** — the bar has no background of its own today; it inherits
  the wrapper's. Once sticky, prose scrolls *underneath* it, so without an
  explicit opaque background the text bleeds through the toolbar.
- **`z-10`** — stacks the bar above the ProseMirror content.
- **`rounded-t-lg`** — the `.rich-editor` wrapper is `rounded-lg`. A sticky
  child paints over the parent's rounded top corners and would render square
  corners against the rounded border.

`top-0` is a physical property, but `position: sticky` offsets have no logical
equivalent in Tailwind and the axis here is genuinely block-direction pinning,
not an inline-direction layout choice.

### Why sticky resolves correctly here

Sticky positions against the nearest scrolling ancestor: the Base UI
`ScrollArea` viewport in `sectioned-config-modal.tsx:109`. The usual failure —
Radix-style scroll areas wrapping content in a `display: table` node, which
breaks sticky — does not apply. Base UI 1.4.1's `scroll-area` bundle contains
no `display: table`, the repo's `.scroll-area-content` sets only
`min-inline-size`/`min-block-size`, and neither `.rich-editor` nor anything
between it and the viewport sets `overflow: hidden`. `.scroll-area-root`'s
`overflow: hidden` sits outside the viewport and so does not clip.

### Expected behaviour

Each toolbar pins only while its own field is on screen and releases as that
field scrolls past, so scrolling the Content tab hands off from Text's bar to
Pro tips' to Assignments'. This is correct — a toolbar belongs to its field —
but it is the part most worth checking on screen.

## Testing

`jsdom` performs no layout, so a test asserting the bar is *pinned* would
assert nothing. The failure worth a regression test is the one that is
invisible in a static screenshot and silently makes text unreadable: the
sticky bar losing its own opaque background. Assert that the fixed toolbar
carries a background class of its own, alongside the existing
`rich-text-editor` tests.

Everything else is verified on screen: open a lesson's Content tab, scroll a
long Text field, and confirm the bar pins, stays legible over the scrolling
prose, keeps its rounded top corners, and hands off between fields.

## Out of scope

- The bubble-toolbar fields (key points, quiz), `TOOLBAR_CONTROLS`,
  `INLINE_CONTROLS`, and the TipTap schema.
- The unbounded growth of `.rich-editor__content`. Capping field height with
  an inner scroll would also solve toolbar reach, but it changes how authors
  read long content and is a larger UX decision than this one.
