import { Tabs } from '@base-ui/react/tabs';
import { ScrollArea } from '#/components/scroll-area';
import type { LessonMaterial } from '#/db/lesson';
import { useActiveTab } from '#/hooks/data/use-lesson-ai-test';
import { computeMaterialTabs, resolveActiveTab } from './compute-material-tabs';
import { Assignments } from './parts/assignments';
import { DebriefPanelContainer } from './parts/debrief-panel-container';
import { JobOfTheDay } from './parts/job-of-the-day';
import { KeyPoints } from './parts/key-points';
import { Links } from './parts/links';
import { ProTips } from './parts/pro-tips';
import { LessonQuizContainer } from './parts/quiz/lesson-quiz-container';

type LessonMaterialProps = {
  material: NonNullable<LessonMaterial>;
  /** The course the lesson is being read in — every write the quiz/debrief containers make is per course. */
  courseSlug: string;
  /** `lessons.has_debrief` — the admin's switch for the Debrief tab. */
  hasDebrief: boolean;
  /** Called with each newly selected tab, so the container can record it. */
  onTabSelected?: (tab: string) => void;
  /** The lesson was completed at an earlier level — quiz/debrief writes must be inert. */
  readOnly: boolean;
};

export const LessonMaterialView = ({
  material,
  courseSlug,
  hasDebrief,
  onTabSelected,
  readOnly,
}: LessonMaterialProps) => {
  const [activeTab, setActiveTab] = useActiveTab();

  const tabs = computeMaterialTabs({
    hasQuiz: (material.quiz?.length ?? 0) > 0,
    // Body text is enough: when no key points were authored the server
    // derives them from that text (see resolveDebriefSource). Read-only
    // lessons get no debrief clock (call 12), so no tab either.
    hasDebriefTab: hasDebrief && !readOnly && Boolean(material.text),
    extraTab: material.extraTab,
  });
  const has = (value: string) => tabs.some((tab) => tab.value === value);
  const selected = resolveActiveTab(tabs, activeTab);

  return (
    <Tabs.Root
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

      {has('quiz') ? (
        <Tabs.Panel value="quiz" className="outline-hidden">
          <LessonQuizContainer
            courseSlug={courseSlug}
            lessonSlug={material.lessonSlug}
            quiz={material.quiz}
            readOnly={readOnly}
          />
        </Tabs.Panel>
      ) : null}

      {has('debrief') ? (
        <Tabs.Panel value="debrief" className="outline-hidden">
          <DebriefPanelContainer
            courseSlug={courseSlug}
            lessonSlug={material.lessonSlug}
            readOnly={readOnly}
            headingLevel={2}
          />
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

      {material.extraTab === 'jobOfTheDay' ? (
        <Tabs.Panel value="jobOfTheDay" className="outline-hidden">
          <JobOfTheDay jobOfTheDay={material.jobOfTheDay} />
        </Tabs.Panel>
      ) : (
        <Tabs.Panel value="testThis" className="outline-hidden">
          <Links
            links={material.testThis}
            emptyText="Nothing to test for this lesson yet."
          />
        </Tabs.Panel>
      )}
    </Tabs.Root>
  );
};
