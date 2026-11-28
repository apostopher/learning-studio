import { Tabs } from '@base-ui/react/tabs';
import { Lock } from 'lucide-react';
import { ScrollArea } from '#/components/scroll-area';
import type { PlanLockedTabs } from '#/lib/lesson-gating';
import { computeMaterialTabs } from './compute-material-tabs';
import { PlanLockedNotice } from './parts/plan-locked-notice';

type PlanLockedMaterialProps = {
  tabs: PlanLockedTabs;
  courseSlug: string;
  /** The video has a caption transcript — decides the Debrief tab, as for anyone. */
  transcriptUsable: boolean;
};

/**
 * A paid lesson on a free seat (user, 2026-11-28): the same tab strip a paid
 * learner sees, each tab marked with a lock and saying it is locked, with none
 * of the content behind it (the server never sends it).
 *
 * The tab strip is `computeMaterialTabs`, so it cannot drift from the real
 * one. Presentational: Base UI's Tabs keeps which tab is showing.
 */
export const PlanLockedMaterial = ({
  tabs,
  courseSlug,
  transcriptUsable,
}: PlanLockedMaterialProps) => {
  const strip = computeMaterialTabs({
    hasQuiz: tabs.hasQuiz,
    debrief: {
      materialText: tabs.hasBodyText ? 'body' : null,
      transcriptUsable,
      readOnly: false,
    },
    extraTab: tabs.extraTab,
    courseSlug,
  });
  return (
    <Tabs.Root defaultValue={strip[0]?.value} className="flex flex-col gap-4">
      <ScrollArea
        orientation="horizontal"
        className="lesson-material-tabs-scroll w-full border-b border-gray-6"
      >
        <Tabs.List className="relative z-0 flex w-max gap-1 px-1">
          {strip.map((tab) => (
            <Tabs.Tab
              key={tab.value}
              value={tab.value}
              className="flex h-9 items-center justify-center gap-1.5 px-3 text-sm font-medium text-secondary outline-hidden select-none whitespace-nowrap hover:text-primary data-selected:text-primary"
            >
              <Lock className="size-3.5" aria-hidden="true" />
              {tab.label}
              <span className="sr-only">, locked</span>
            </Tabs.Tab>
          ))}
          <Tabs.Indicator className="absolute bottom-0 left-0 h-px w-(--active-tab-width) translate-x-(--active-tab-left) bg-primary transition-all duration-200 ease-in-out" />
        </Tabs.List>
      </ScrollArea>
      {strip.map((tab) => (
        <Tabs.Panel
          key={tab.value}
          value={tab.value}
          className="outline-hidden"
        >
          <PlanLockedNotice subject={tab.label} />
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
};
