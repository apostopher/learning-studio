import { Accordion } from '@base-ui/react/accordion';
import { MotionConfig } from 'motion/react';
import { ModuleItem } from './module-item';

type LessonLike = { slug: string; name: string; videoId: string | null };
type ModuleLike = {
  id: number;
  slug: string;
  name: string;
  lessons: readonly LessonLike[];
};

type ModuleAccordionProps = {
  modules: readonly ModuleLike[];
  openModuleSlug: string | null;
  onOpenChange: (slug: string | null) => void;
  activeLessonSlug: string | null;
  lessonPercents: Record<string, number>;
  modulePercents: Record<number, number>;
};

export const ModuleAccordion = ({
  modules,
  openModuleSlug,
  onOpenChange,
  activeLessonSlug,
  lessonPercents,
  modulePercents,
}: ModuleAccordionProps) => (
  <MotionConfig
    reducedMotion="user"
    transition={{ type: 'spring', bounce: 0.2, visualDuration: 0.4 }}
  >
    <Accordion.Root
      value={openModuleSlug ? [openModuleSlug] : []}
      onValueChange={(values) =>
        onOpenChange(
          typeof values[0] === 'string' ? (values[0] as string) : null,
        )
      }
      className="flex flex-col gap-sidebar-row-gap"
    >
      {modules.map((module, index) => (
        <ModuleItem
          key={module.slug}
          module={module}
          rank={index + 1}
          isOpen={openModuleSlug === module.slug}
          activeLessonSlug={activeLessonSlug}
          modulePercent={modulePercents[module.id] ?? 0}
          lessonPercents={lessonPercents}
        />
      ))}
    </Accordion.Root>
  </MotionConfig>
);
