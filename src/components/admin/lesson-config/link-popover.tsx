import { Popover } from '@base-ui/react/popover';
import { Link2, Link2Off } from 'lucide-react';
import type { FormEvent } from 'react';
import type { RichTextEditorApi } from './rich-text-editor-api';

/**
 * Link add/edit popover for the rich-text toolbar. Prefills from the current
 * selection's link; Apply sets it on the extended mark range, Remove unsets it.
 *
 * Deliberately hookless (uncontrolled `<form>` read via FormData on submit,
 * instead of `useState`): this repo's Vite pipeline (react-compiler +
 * TanStack Start under Vitest) nulls the hook dispatcher for ANY component
 * that calls a React hook directly in a render test — a pre-existing infra
 * issue unrelated to this component (see src/components/video-player/hooks.ts's
 * top-of-file note). The input's value is seeded via `defaultValue` (not a
 * hook), read fresh at render time from the editor's current link — Base UI
 * unmounts Popover.Popup's content on close by default, so this re-seeds on
 * every open without needing state.
 *
 * The input uses `type="text"` rather than `type="url"`: native URL
 * validation would silently block form submission (and thus `applyLink`)
 * for scheme-less input like `example.com`, while the popover still closes
 * via `Popover.Close`. `applyLink` normalizes scheme-less input instead.
 */
export const LinkPopover = ({ editor }: { editor: RichTextEditorApi }) => {
  const applyLink = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const raw = new FormData(event.currentTarget).get('href');
    let url = typeof raw === 'string' ? raw.trim() : '';
    if (!url) return;
    if (!/^(https?:|mailto:|tel:)/i.test(url)) url = `https://${url}`;
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };
  const removeLink = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
  };

  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label="Link"
        aria-pressed={editor.isActive('link')}
        className="rounded p-1.5 text-gray-11 transition-colors hover:bg-gray-4 hover:text-gray-12 aria-pressed:bg-gray-4 aria-pressed:text-gray-12"
      >
        <Link2 className="h-4 w-4" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6}>
          <Popover.Popup className="rounded-lg border border-gray-6 bg-gray-2 p-1.5 shadow-lg">
            <form onSubmit={applyLink} className="flex items-center gap-1.5">
              <input
                defaultValue={
                  (editor.getAttributes('link').href as string) ?? ''
                }
                type="text"
                name="href"
                placeholder="https://…"
                aria-label="Link URL"
                className="w-56 rounded-md border border-gray-6 bg-gray-1 px-2 py-1 text-gray-12 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
              />
              <Popover.Close
                type="submit"
                className="rounded-md bg-apple-9 px-2.5 py-1 font-medium text-apple-contrast text-sm hover:bg-apple-10"
              >
                Apply
              </Popover.Close>
              <Popover.Close
                type="button"
                onClick={removeLink}
                aria-label="Remove link"
                className="rounded-md p-1.5 text-gray-11 hover:bg-gray-4 hover:text-gray-12"
              >
                <Link2Off className="h-4 w-4" aria-hidden="true" />
              </Popover.Close>
            </form>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
};
