import { Dialog } from '@base-ui/react/dialog';
import { Tabs } from '@base-ui/react/tabs';
import { useAtom } from 'jotai';
import { X } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { configModalSectionAtom } from '#/atoms/admin';
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
  /**
   * Pinned under the tab list while this section is active — the place for
   * the section's primary action (a Save button), so it stays in view however
   * far the panel scrolls. The section keeps its own form; a button here
   * reaches it through the `form` attribute.
   */
  sidebarFooter?: ReactNode;
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
  /**
   * Rendered in the header between the title and Close — the dialog's
   * primary action when it has no sidebar to pin one under (a single-section
   * dialog), so Save sits where the eye already goes to leave.
   */
  headerActions?: ReactNode;
  /**
   * Replaces the plain `<h2>{heading}</h2>` above the panel with a node the
   * caller owns — an editable name with its own controls. The slot renders
   * its own heading element; `heading` is ignored while it is set.
   */
  headingSlot?: ReactNode;
  /**
   * The section to open on, by `value`. Defaults to the first section; a
   * value that matches no section also falls back to the first, so a stale
   * caller cannot open the modal on an empty panel. Tab ORDER is untouched —
   * this only chooses where the reader lands.
   */
  defaultSection?: string;
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
  defaultSection,
  headerActions,
  headingSlot,
}: SectionedConfigModalProps) => {
  // One section has nothing to tab between: no sidebar, no footer. The
  // grid collapses to the panel alone.
  const hasSidebar = sections.length > 1;
  const firstValue =
    sections.find((section) => section.value === defaultSection)?.value ??
    sections[0]?.value;
  // Which tab is open, held in an atom (jotai, per the project's state rule;
  // and this shell is rendered by tests, where a first-party React hook
  // trips the compiler's dispatcher) so the sidebar can pin the ACTIVE
  // section's footer — Base UI would otherwise keep the choice to itself. A
  // remembered value that names no section of THIS dialog falls back to its
  // default, so one atom serves every dialog without stranding any of them.
  const [chosenValue, setChosenValue] = useAtom(configModalSectionAtom);
  const active =
    sections.find((section) => section.value === chosenValue) ??
    sections.find((section) => section.value === firstValue);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop fixed inset-0 z-40 bg-gray-1/70 backdrop-blur-sm" />
        <Dialog.Popup
          style={{ '--modal-dialog-width': width } as CSSProperties}
          className="dialog-popup fixed inset-0 z-40 m-auto grid h-[85vh] max-h-[calc(100vh-2rem)] w-[var(--modal-dialog-width)] max-w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-xl border border-gray-6 bg-gray-2 shadow-xl"
        >
          <div className="flex items-center gap-4 border-gray-6 border-b px-6 py-4 [&>:first-child]:flex-1">
            <Dialog.Title className="font-semibold text-primary text-lg">
              {title}
            </Dialog.Title>
            {headerActions}
            <Dialog.Close
              aria-label="Close"
              className="shrink-0 rounded-md p-1.5 text-secondary transition-colors hover:bg-gray-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Dialog.Close>
          </div>

          {firstValue && (
            <Tabs.Root
              value={active?.value}
              onValueChange={(value) => setChosenValue(String(value))}
              orientation="vertical"
              style={{
                gridTemplateColumns: hasSidebar
                  ? `${sidebarWidth} minmax(0, 1fr)`
                  : 'minmax(0, 1fr)',
              }}
              className="grid min-h-0"
            >
              {hasSidebar && (
                <div
                  data-sidebar
                  className="flex min-h-0 flex-col border-gray-6 border-e bg-gray-1"
                >
                  <Tabs.List className="flex min-h-0 flex-1 flex-col overflow-y-auto">
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
                  {active?.sidebarFooter && (
                    <div className="border-gray-6 border-t p-4">
                      {active.sidebarFooter}
                    </div>
                  )}
                </div>
              )}

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
                            {headingSlot ?? (
                              <h2 className="break-words font-semibold text-2xl text-primary">
                                {section.heading ?? heading}
                              </h2>
                            )}
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
