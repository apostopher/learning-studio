import { Accordion } from '@base-ui/react/accordion';
import { ChevronDown } from 'lucide-react';
import { LessonList } from './lesson-list';

type LessonLike = { slug: string; name: string };
type ModuleLike = {
  slug: string;
  name: string;
  lessons: readonly LessonLike[];
};

type ModuleItemProps = {
  module: ModuleLike;
  rank: number;
  activeLessonSlug: string | null;
};

const TRIGGER_CLASSES = [
  'sidebar-focus-ring',
  'flex items-start gap-2 w-full',
  'px-sidebar-row-inline py-sidebar-row-block',
  'text-start text-sm text-gray-12',
  'rounded-sidebar-row',
  'hover:bg-gray-a3',
].join(' ');

export const ModuleItem = ({
  module,
  rank,
  activeLessonSlug,
}: ModuleItemProps) => (
  <Accordion.Item value={module.slug} className="flex flex-col">
    <Accordion.Header>
      <Accordion.Trigger className={TRIGGER_CLASSES}>
        <span className="tabular-nums text-gray-10 text-xs font-medium shrink-0 pt-0.5">
          {String(rank).padStart(2, '0')}
        </span>
        <span className="flex-1 min-w-0 break-words">{module.name}</span>
        <ChevronDown
          className="sidebar-chevron size-4 shrink-0 mt-0.5"
          aria-hidden="true"
        />
      </Accordion.Trigger>
    </Accordion.Header>
    <Accordion.Panel className="overflow-hidden">
      <LessonList
        moduleSlug={module.slug}
        lessons={module.lessons}
        activeLessonSlug={activeLessonSlug}
      />
    </Accordion.Panel>
  </Accordion.Item>
);
