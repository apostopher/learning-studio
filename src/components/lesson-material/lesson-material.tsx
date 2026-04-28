import { Tabs } from '@base-ui/react/tabs';
import { ScrollArea } from '#/components/scroll-area';
import type { LessonMaterial } from '#/db/lesson';

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
};

export const LessonMaterialView = ({ material }: LessonMaterialProps) => (
  <Tabs.Root defaultValue="keyPoints" className="flex flex-col gap-4">
    <ScrollArea
      orientation="horizontal"
      className="lesson-material-tabs-scroll w-full border-b border-gray-6"
    >
      <Tabs.List className="relative z-0 flex w-max gap-1 px-1">
        {TABS.map((tab) => (
          <Tabs.Tab
            key={tab.value}
            value={tab.value}
            className="flex h-9 items-center justify-center px-3 text-sm font-medium text-gray-11 outline-hidden select-none whitespace-nowrap hover:text-gray-12 data-[selected]:text-gray-12"
          >
            {tab.label}
          </Tabs.Tab>
        ))}
        <Tabs.Indicator className="absolute bottom-0 left-0 h-px w-[var(--active-tab-width)] translate-x-[var(--active-tab-left)] bg-gray-12 transition-all duration-200 ease-in-out" />
      </Tabs.List>
    </ScrollArea>

    <Tabs.Panel value="keyPoints" className="outline-hidden">
      {/* TODO: presentation component */}
      <pre className="text-sm text-gray-11">
        {JSON.stringify(material.keyPoints, null, 2)}
      </pre>
    </Tabs.Panel>

    <Tabs.Panel value="quiz" className="outline-hidden">
      {/* TODO: presentation component */}
      <pre className="text-sm text-gray-11">
        {JSON.stringify(material.quiz, null, 2)}
      </pre>
    </Tabs.Panel>

    <Tabs.Panel value="proTips" className="outline-hidden">
      {/* TODO: presentation component */}
      <pre className="text-sm text-gray-11 whitespace-pre-wrap">
        {material.proTips}
      </pre>
    </Tabs.Panel>

    <Tabs.Panel value="links" className="outline-hidden">
      {/* TODO: presentation component */}
      <pre className="text-sm text-gray-11">
        {JSON.stringify(material.links, null, 2)}
      </pre>
    </Tabs.Panel>

    <Tabs.Panel value="assignments" className="outline-hidden">
      {/* TODO: presentation component */}
      <pre className="text-sm text-gray-11 whitespace-pre-wrap">
        {material.assignments}
      </pre>
    </Tabs.Panel>

    <Tabs.Panel value="jobOfTheDay" className="outline-hidden">
      {/* TODO: presentation component */}
      <pre className="text-sm text-gray-11 whitespace-pre-wrap">
        {material.jobOfTheDay}
      </pre>
    </Tabs.Panel>
  </Tabs.Root>
);
