import { Tabs } from '@base-ui/react/tabs';
import type { ReactNode } from 'react';
import type { AiTrainingSectionId } from '#/lib/ai-training-sections';

interface AiTrainingPageProps {
  /** The inner sections, in nav order. */
  sections: readonly { id: AiTrainingSectionId; label: string }[];
  active: AiTrainingSectionId;
  onSelect: (id: AiTrainingSectionId) => void;
  /** The active section's content. Only one is ever mounted. */
  children: ReactNode;
}

/**
 * The AI Training tab's shell: its inner section nav and the active section.
 *
 * One Base UI `Tabs`, laid out by CSS alone — a vertical rail at the start
 * from `md` up, a row of tabs above the content below that. Hookless, so the
 * breakpoint cannot also switch the list's keyboard orientation: it stays
 * horizontal (Left/Right arrows) at every width, Home/End work everywhere.
 */
export const AiTrainingPage = ({
  sections,
  active,
  onSelect,
  children,
}: AiTrainingPageProps) => (
  <div className="content-grid py-10">
    <div className="content flex flex-col gap-6">
      <h1 className="font-semibold text-2xl text-primary">AI Training</h1>

      <Tabs.Root
        value={active}
        onValueChange={(next) => onSelect(next as AiTrainingSectionId)}
        className="flex flex-col gap-6 md:flex-row md:items-start"
      >
        <Tabs.List
          aria-label="AI Training sections"
          className="flex shrink-0 gap-1 overflow-x-auto border-gray-6 border-b md:w-48 md:flex-col md:overflow-visible md:border-e md:border-b-0 md:pe-4"
        >
          {sections.map((section) => (
            <Tabs.Tab
              key={section.id}
              value={section.id}
              className="whitespace-nowrap rounded-md px-3 py-2 text-start font-medium text-secondary text-sm transition-colors hover:bg-gray-3 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9 aria-selected:bg-gray-3 aria-selected:text-primary"
            >
              {section.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        <Tabs.Panel
          value={active}
          className="min-w-0 flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-9"
        >
          {children}
        </Tabs.Panel>
      </Tabs.Root>
    </div>
  </div>
);
