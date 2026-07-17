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
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
          />
          <ToolbarButton
            label="Heading 2"
            icon={Heading2}
            active={editor.isActive('heading', { level: 2 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
          />
          <ToolbarButton
            label="Heading 3"
            icon={Heading3}
            active={editor.isActive('heading', { level: 3 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
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
