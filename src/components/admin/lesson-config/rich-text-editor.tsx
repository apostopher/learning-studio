import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { useEffect } from 'react';
import type { RichTextEditorApi } from './rich-text-editor-api';
import { RichTextToolbar } from './rich-text-toolbar';

/** TipTap's empty document serializes to `<p></p>`; treat that as empty. */
export function normalizeEditorHtml(html: string): string {
  const stripped = html.replace(/<p>\s*(<br\s*\/?>)?\s*<\/p>/gi, '').trim();
  return stripped === '' ? '' : html.trim();
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
    shouldRerenderOnTransaction: true,
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
        ...(ariaLabel
          ? {
              'aria-label': ariaLabel,
              role: 'textbox',
              'aria-multiline': 'true',
            }
          : {}),
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
