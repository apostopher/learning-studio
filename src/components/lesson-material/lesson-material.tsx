import { Tabs } from '@base-ui/react/tabs';
import type { RefObject } from 'react';
import { ScrollArea } from '#/components/scroll-area';
import type { LessonMaterial } from '#/db/lesson';
import { useActiveTab, useCurrentTest } from '#/hooks/data/use-lesson-ai-test';
import { Assignments } from './parts/assignments';
import { DebriefQuizContainer } from './parts/debrief-quiz-container';
import { JobOfTheDay } from './parts/job-of-the-day';
import { KeyPoints } from './parts/key-points';
import { Links } from './parts/links';
import { ProTips } from './parts/pro-tips';
import { LessonQuizContainer } from './parts/quiz/lesson-quiz-container';

type LessonMaterialTab =
  | 'keyPoints'
  | 'quiz'
  | 'proTips'
  | 'links'
  | 'assignments'
  | 'jobOfTheDay';

type TabConfig = {
  value: LessonMaterialTab;
  label: string;
};

const TABS: readonly TabConfig[] = [
  { value: 'keyPoints', label: 'Key Points' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'proTips', label: 'Pro Tips' },
  { value: 'links', label: 'Links' },
  { value: 'assignments', label: 'Assignments' },
  { value: 'jobOfTheDay', label: 'Job of the Day' },
] as const;

type LessonMaterialProps = {
  material: NonNullable<LessonMaterial>;
  tabsRef?: RefObject<HTMLDivElement | null>;
};

export const LessonMaterialView = ({
  material,
  tabsRef,
}: LessonMaterialProps) => {
  const [activeTab, setActiveTab] = useActiveTab();
  const currentTest = useCurrentTest();

  return (
    <Tabs.Root
      ref={tabsRef}
      value={activeTab}
      onValueChange={(val) => setActiveTab(val as string)}
      className="flex flex-col gap-4"
    >
      <ScrollArea
        orientation="horizontal"
        className="lesson-material-tabs-scroll w-full border-b border-gray-6"
      >
        <Tabs.List className="relative z-0 flex w-max gap-1 px-1">
          {TABS.map((tab) => (
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

      <Tabs.Panel value="quiz" className="outline-hidden">
        {currentTest ? (
          <DebriefQuizContainer
            lessonSlug={material.lessonSlug}
            material={material}
          />
        ) : (
          <LessonQuizContainer
            lessonSlug={material.lessonSlug}
            quiz={material.quiz}
          />
        )}
      </Tabs.Panel>

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
