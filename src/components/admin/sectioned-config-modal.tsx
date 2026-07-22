import { Dialog } from '@base-ui/react/dialog';
import { Tabs } from '@base-ui/react/tabs';
import { X } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { ScrollArea } from '#/components/scroll-area';

export interface ConfigModalSection {
  /** Stable tab value; also the panel key. */
  value: string;
  /** Sidebar label. */
  title: string;
  /** Panel body, rendered in the main area when this section is active. */
  content: ReactNode;
}

interface SectionedConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Header title, e.g. "Configure lesson" / "Edit course". */
  title: string;
  /** Persistent heading shown above the panels — usually the entity name. */
  heading: ReactNode;
  sections: ConfigModalSection[];
  /** Overall modal width; defaults to 1280px. */
  width?: string;
  /** Sidebar (tab list) column width; defaults to 320px. */
  sidebarWidth?: string;
}

/**
 * Presentational JIRA-style configuration modal: a fixed-width vertical-tab
 * sidebar beside a scrolling main panel, with a persistent heading above the
 * active section. Callers own each section's content and its own save
 * behavior; this shell lays out only the chrome. Shared by the lesson-config
 * and course-edit dialogs.
 */
export const SectionedConfigModal = ({
  open,
  onOpenChange,
  title,
  heading,
  sections,
  width = '1280px',
  sidebarWidth = '320px',
}: SectionedConfigModalProps) => {
  const firstValue = sections[0]?.value;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-gray-1/70 backdrop-blur-sm" />
        <Dialog.Popup
          style={{ '--modal-dialog-width': width } as CSSProperties}
          className="fixed inset-0 z-40 m-auto grid h-[85vh] max-h-[calc(100vh-2rem)] w-[var(--modal-dialog-width)] max-w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-xl border border-gray-6 bg-gray-2 shadow-xl"
        >
          <div className="flex items-center justify-between gap-4 border-gray-6 border-b px-6 py-4">
            <Dialog.Title className="font-semibold text-gray-12 text-lg">
              {title}
            </Dialog.Title>
            <Dialog.Close className="shrink-0 rounded-md p-1.5 text-gray-11 transition-colors hover:bg-gray-4 hover:text-gray-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9">
              <X className="h-5 w-5" aria-hidden="true" />
            </Dialog.Close>
          </div>

          {firstValue && (
            <Tabs.Root
              defaultValue={firstValue}
              orientation="vertical"
              style={{ gridTemplateColumns: `${sidebarWidth} minmax(0, 1fr)` }}
              className="grid min-h-0"
            >
              <Tabs.List className="flex min-h-0 flex-col overflow-y-auto border-gray-6 border-e bg-gray-1">
                {sections.map((section) => (
                  <Tabs.Tab
                    key={section.value}
                    value={section.value}
                    className="border-gray-6 border-b px-4 py-3 text-start font-medium text-gray-11 text-sm transition-colors hover:bg-gray-3 hover:text-gray-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-apple-9 aria-selected:bg-gray-3 aria-selected:text-gray-12"
                  >
                    {section.title}
                  </Tabs.Tab>
                ))}
              </Tabs.List>

              <ScrollArea className="min-h-0" viewportClassName="p-6">
                <div className="flex flex-col gap-6">
                  <h2 className="break-words font-semibold text-2xl text-gray-12">
                    {heading}
                  </h2>
                  {sections.map((section) => (
                    <Tabs.Panel
                      key={section.value}
                      value={section.value}
                      className="flex-1"
                    >
                      {section.content}
                    </Tabs.Panel>
                  ))}
                </div>
              </ScrollArea>
            </Tabs.Root>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
