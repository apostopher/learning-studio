import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { ScrollArea } from '#/components/scroll-area';

interface CourseEmbeddingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}

/**
 * Single-column scrolling modal at the lesson-editor's height. Header with a
 * close button; body scrolls. Presentational shell — the caller owns content.
 */
export const CourseEmbeddingsModal = ({
  open,
  onOpenChange,
  title,
  children,
}: CourseEmbeddingsModalProps) => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-40 bg-gray-1/70 backdrop-blur-sm" />
      <Dialog.Popup className="fixed inset-0 z-40 m-auto grid h-[85vh] max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-[720px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-xl border border-gray-6 bg-gray-2 shadow-xl">
        <div className="flex items-center justify-between gap-4 border-gray-6 border-b px-6 py-4">
          <Dialog.Title className="font-semibold text-primary text-lg">
            {title}
          </Dialog.Title>
          <Dialog.Close className="shrink-0 rounded-md p-1.5 text-secondary transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9">
            <X className="h-5 w-5" aria-hidden="true" />
          </Dialog.Close>
        </div>
        <ScrollArea viewportClassName="p-6">{children}</ScrollArea>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>
);
