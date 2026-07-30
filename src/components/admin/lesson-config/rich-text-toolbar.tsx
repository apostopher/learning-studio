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
import type { ComponentType, ReactNode } from 'react';
import { LinkPopover } from './link-popover';
import type { RichTextEditorApi } from './rich-text-editor-api';

interface ToolbarButtonProps {
  label: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  active: boolean;
  onClick: () => void;
}

const ToolbarButton = ({
  label,
  icon: Icon,
  active,
  onClick,
}: ToolbarButtonProps) => (
  <button
    type="button"
    aria-label={label}
    aria-pressed={active}
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
    className="rounded p-1.5 text-secondary transition-colors hover:bg-gray-4 hover:text-primary aria-pressed:bg-gray-4 aria-pressed:text-primary"
  >
    <Icon className="h-4 w-4" aria-hidden />
  </button>
);

/** Every control the toolbar can render. Callers pass a subset via `controls`. */
export const TOOLBAR_CONTROLS = [
  'bold',
  'italic',
  'h1',
  'h2',
  'h3',
  'bulletList',
  'orderedList',
  'blockquote',
  'code',
  'link',
] as const;

export type ToolbarControl = (typeof TOOLBAR_CONTROLS)[number];

/**
 * Inline-emphasis only. Used by the short, single-idea fields — key points and
 * quiz questions/options — where block structure (headings, lists, quotes) has
 * no place: each one renders inside a numbered chip or a radio row, so a
 * heading or nested list there reads as broken layout.
 *
 * Shared rather than repeated at each call site so the three stay in step.
 */
export const INLINE_CONTROLS: readonly ToolbarControl[] = ['bold', 'italic'];

/**
 * Visual grouping, used only to place separators. Kept as data rather than
 * hardcoded `<span>`s between JSX blocks so that an arbitrary `controls` subset
 * can't produce a leading, trailing, or doubled divider — with the old literal
 * separators, `controls={['bold','italic']}` rendered a divider against nothing.
 */
const CONTROL_GROUPS: readonly (readonly ToolbarControl[])[] = [
  ['bold', 'italic'],
  ['h1', 'h2', 'h3'],
  ['bulletList', 'orderedList', 'blockquote', 'code'],
  ['link'],
];

/**
 * Essentials toolbar for RichTextEditor, driven by a passed TipTap editor.
 *
 * `controls` selects which buttons appear; omitting it renders all of them, so
 * existing call sites are unaffected. It replaces the previous `compact`
 * boolean, which could only express "drop the headings" and so could not
 * describe a bold+italic-only toolbar.
 */
export const RichTextToolbar = ({
  editor,
  controls = TOOLBAR_CONTROLS,
}: {
  editor: RichTextEditorApi;
  controls?: readonly ToolbarControl[];
}) => {
  const enabled = new Set(controls);

  // `link` is a popover, not a ToolbarButton, so it cannot come from this map
  // and is branched separately below.
  const buttons: Record<
    Exclude<ToolbarControl, 'link'>,
    {
      label: string;
      icon: ComponentType<{ className?: string }>;
      active: boolean;
      run: () => void;
    }
  > = {
    bold: {
      label: 'Bold',
      icon: Bold,
      active: editor.isActive('bold'),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    italic: {
      label: 'Italic',
      icon: Italic,
      active: editor.isActive('italic'),
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    h1: {
      label: 'Heading 1',
      icon: Heading1,
      active: editor.isActive('heading', { level: 1 }),
      run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    h2: {
      label: 'Heading 2',
      icon: Heading2,
      active: editor.isActive('heading', { level: 2 }),
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    h3: {
      label: 'Heading 3',
      icon: Heading3,
      active: editor.isActive('heading', { level: 3 }),
      run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    bulletList: {
      label: 'Bullet list',
      icon: List,
      active: editor.isActive('bulletList'),
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    orderedList: {
      label: 'Ordered list',
      icon: ListOrdered,
      active: editor.isActive('orderedList'),
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    blockquote: {
      label: 'Blockquote',
      icon: Quote,
      active: editor.isActive('blockquote'),
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
    code: {
      label: 'Inline code',
      icon: Code,
      active: editor.isActive('code'),
      run: () => editor.chain().focus().toggleCode().run(),
    },
  };

  const rendered: ReactNode[] = [];
  for (const group of CONTROL_GROUPS) {
    const present = group.filter((c) => enabled.has(c));
    if (present.length === 0) continue;
    // Separator before every group except the first one actually rendered.
    if (rendered.length > 0) {
      rendered.push(
        <span
          key={`sep-${group[0]}`}
          className="mx-1 h-5 w-px bg-gray-6"
          aria-hidden
        />,
      );
    }
    for (const control of present) {
      if (control === 'link') {
        rendered.push(<LinkPopover key="link" editor={editor} />);
        continue;
      }
      const b = buttons[control];
      rendered.push(
        <ToolbarButton
          key={control}
          label={b.label}
          icon={b.icon}
          active={b.active}
          onClick={b.run}
        />,
      );
    }
  }

  return <div className="flex flex-wrap items-center gap-0.5">{rendered}</div>;
};
