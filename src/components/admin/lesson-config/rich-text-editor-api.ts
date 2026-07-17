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
