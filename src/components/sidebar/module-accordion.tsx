import { Accordion } from '@base-ui/react/accordion';
import { ModuleItem } from './module-item';

type LessonLike = { slug: string; name: string };
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
};

export const ModuleAccordion = ({
  modules,
  openModuleSlug,
  onOpenChange,
  activeLessonSlug,
}: ModuleAccordionProps) => (
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
        activeLessonSlug={activeLessonSlug}
      />
    ))}
  </Accordion.Root>
);
