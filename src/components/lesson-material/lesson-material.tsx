import { Tabs } from '@base-ui/react/tabs';
import type { RefObject } from 'react';
import { ScrollArea } from '#/components/scroll-area';
import type { LessonMaterial } from '#/db/lesson';
import { useActiveTab } from '#/hooks/data/use-lesson-ai-test';
import { computeMaterialTabs, resolveActiveTab } from './compute-material-tabs';
import { Assignments } from './parts/assignments';
import { DebriefQuizContainer } from './parts/debrief-quiz-container';
import { JobOfTheDay } from './parts/job-of-the-day';
import { KeyPoints } from './parts/key-points';
import { Links } from './parts/links';
import { ProTips } from './parts/pro-tips';
import { LessonQuizContainer } from './parts/quiz/lesson-quiz-container';

type LessonMaterialProps = {
  material: NonNullable<LessonMaterial>;
  tabsRef?: RefObject<HTMLDivElement | null>;
  /** Whether tab 2 is the Debrief rather than the authored quiz. */
  hasDebrief: boolean;
  /** Called with each newly selected tab, so the container can record it. */
  onTabSelected?: (tab: string) => void;
};

export const LessonMaterialView = ({
  material,
  tabsRef,
  hasDebrief,
  onTabSelected,
}: LessonMaterialProps) => {
  const [activeTab, setActiveTab] = useActiveTab();

  // Body text is enough: when no key points were authored the server derives
  // them from that text (see resolveDebriefSource), so a lesson with prose and
  // no bullet list no longer loses its Debrief tab.
  const canDebrief = Boolean(material.text);
  const tabs = computeMaterialTabs({ hasDebrief, canDebrief });
  const selected = resolveActiveTab(tabs, activeTab);

  return (
    <Tabs.Root
      ref={tabsRef}
      value={selected}
      onValueChange={(val) => {
        setActiveTab(val as string);
        onTabSelected?.(val as string);
      }}
      className="flex flex-col gap-4"
    >
      <ScrollArea
        orientation="horizontal"
        className="lesson-material-tabs-scroll w-full border-b border-gray-6"
      >
        <Tabs.List className="relative z-0 flex w-max gap-1 px-1">
          {tabs.map((tab) => (
            <Tabs.Tab
              key={tab.value}
              value={tab.value}
              className="flex h-9 items-center justify-center px-3 text-sm font-medium text-secondary outline-hidden select-none whitespace-nowrap hover:text-primary data-selected:text-primary"
            >
              {tab.label}
            </Tabs.Tab>
          ))}
          <Tabs.Indicator className="absolute bottom-0 left-0 h-px w-(--active-tab-width) translate-x-(--active-tab-left) bg-primary transition-all duration-200 ease-in-out" />
        </Tabs.List>
      </ScrollArea>

      <Tabs.Panel value="keyPoints" className="outline-hidden">
        <KeyPoints points={material.keyPoints} />
      </Tabs.Panel>

      {/*
        Which container owns this panel is decided by `hasDebrief`, not by
        whether a test happens to be in memory. Keying off `currentTest` meant
        the panel fell back to the authored quiz the moment the learner
        refreshed — the debrief was only ever reachable through the post-video
        overlay, and unrecoverable once dismissed.
      */}
      {tabs.some((tab) => tab.value === 'quiz') ? (
        <Tabs.Panel value="quiz" className="outline-hidden">
          {hasDebrief ? (
            <DebriefQuizContainer lessonSlug={material.lessonSlug} />
          ) : (
            <LessonQuizContainer
              lessonSlug={material.lessonSlug}
              quiz={material.quiz}
            />
          )}
        </Tabs.Panel>
      ) : null}

      <Tabs.Panel value="proTips" className="outline-hidden">
        <ProTips proTips={material.proTips} />
      </Tabs.Panel>

      <Tabs.Panel value="links" className="outline-hidden">
        <Links links={material.links} />
      </Tabs.Panel>

      <Tabs.Panel value="assignments" className="outline-hidden">
        <Assignments assignments={material.assignments} />
      </Tabs.Panel>

      <Tabs.Panel value="jobOfTheDay" className="outline-hidden">
        <JobOfTheDay jobOfTheDay={material.jobOfTheDay} />
      </Tabs.Panel>
    </Tabs.Root>
  );
};
