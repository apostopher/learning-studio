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
  /**
   * Overrides the shell's `heading` while this section is active. For a
   * section whose subject is not the entity itself — e.g. a course modal's
   * dependency tab, which edits the course's *modules*.
   */
  heading?: ReactNode;
  /**
   * Render this section as a full-height panel that owns its own scrolling,
   * instead of sharing the shell's scroll area.
   *
   * For a section whose content must fill the modal rather than flow down it —
   * the persona carousel, whose two panes slide horizontally and each scroll
   * internally. Opt-in: sections that don't set it keep the shared scrolling
   * behaviour exactly, so the lesson-config and course-edit dialogs are
   * untouched.
   */
  fill?: boolean;
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
            <Dialog.Title className="font-semibold text-primary text-lg">
              {title}
            </Dialog.Title>
            <Dialog.Close className="shrink-0 rounded-md p-1.5 text-secondary transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9">
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
                    className="border-gray-6 border-b px-4 py-3 text-start font-medium text-secondary text-sm transition-colors hover:bg-gray-3 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-apple-9 aria-selected:bg-gray-3 aria-selected:text-primary"
                  >
                    {section.title}
                  </Tabs.Tab>
                ))}
              </Tabs.List>

              {/*
                Both panel groups occupy the same grid cell; Base UI hides
                inactive panels, and `.config-scroll-group` yields the cell
                when it holds nothing visible (see styles.css), so exactly one
                is ever live.
              */}
              <div className="grid min-h-0 grid-cols-1 grid-rows-1">
                {sections.some((section) => !section.fill) && (
                  <ScrollArea
                    className="config-scroll-group col-start-1 row-start-1 min-h-0"
                    viewportClassName="p-6"
                  >
                    {sections
                      .filter((section) => !section.fill)
                      .map((section) => (
                        // The heading lives INSIDE each panel so a section can
                        // override it; only the active panel renders, so exactly
                        // one h2 is ever present. The flex column is an inner div
                        // rather than the panel itself: Base UI hides inactive
                        // panels with the `hidden` attribute, and a
                        // `display:flex` utility class outranks the UA `[hidden]`
                        // rule, which would make every hidden panel visible.
                        <Tabs.Panel
                          key={section.value}
                          value={section.value}
                          className="flex-1"
                        >
                          <div className="flex flex-col gap-6">
                            <h2 className="break-words font-semibold text-2xl text-primary">
                              {section.heading ?? heading}
                            </h2>
                            {section.content}
                          </div>
                        </Tabs.Panel>
                      ))}
                  </ScrollArea>
                )}

                {sections
                  .filter((section) => section.fill)
                  .map((section) => (
                    // No shared padding and no heading: a fill section owns its
                    // whole panel, including where its title sits and what
                    // scrolls. Same `hidden`-vs-`display` caveat as above, so
                    // the flex column is an inner div.
                    <Tabs.Panel
                      key={section.value}
                      value={section.value}
                      className="col-start-1 row-start-1 min-h-0"
                    >
                      <div className="flex h-full min-h-0 flex-col">
                        {section.content}
                      </div>
                    </Tabs.Panel>
                  ))}
              </div>
            </Tabs.Root>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
