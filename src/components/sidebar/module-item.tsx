import { Accordion } from '@base-ui/react/accordion';
import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
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
  isOpen: boolean;
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

const PANEL_VARIANTS = {
  open: {
    height: 'auto',
    maskImage: 'linear-gradient(to bottom, black 100%, transparent 100%)',
  },
  closed: {
    height: 0,
    maskImage: 'linear-gradient(to bottom, black 50%, transparent 100%)',
  },
} as const;

const CONTENT_VARIANTS = {
  open: { filter: 'blur(0px)', opacity: 1 },
  closed: { filter: 'blur(2px)', opacity: 0 },
} as const;

export const ModuleItem = ({
  module,
  rank,
  isOpen,
  activeLessonSlug,
}: ModuleItemProps) => (
  <Accordion.Item value={module.slug} className="flex flex-col">
    <Accordion.Header>
      <Accordion.Trigger className={TRIGGER_CLASSES}>
        <span className="tabular-nums text-gray-10 text-xs font-medium shrink-0 pt-0.5">
          {String(rank).padStart(2, '0')}
        </span>
        <span className="flex-1 min-w-0 break-words">{module.name}</span>
        <motion.span
          className="sidebar-chevron shrink-0 mt-0.5 inline-flex"
          animate={{ rotate: isOpen ? 0 : -90 }}
          style={{ willChange: 'transform' }}
          aria-hidden="true"
        >
          <ChevronDown className="size-4" />
        </motion.span>
      </Accordion.Trigger>
    </Accordion.Header>
    <Accordion.Panel keepMounted className="overflow-hidden">
      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            variants={PANEL_VARIANTS}
            initial="closed"
            animate="open"
            exit="closed"
          >
            <motion.div variants={CONTENT_VARIANTS}>
              <LessonList
                moduleSlug={module.slug}
                lessons={module.lessons}
                activeLessonSlug={activeLessonSlug}
              />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Accordion.Panel>
  </Accordion.Item>
);
