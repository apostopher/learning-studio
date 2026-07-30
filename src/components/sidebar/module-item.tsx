import { Accordion } from '@base-ui/react/accordion';
import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { inlineDirSign } from '#/lib/inline-direction';
import type { LessonLock } from '#/lib/lesson-gating';
import { CircularProgress } from '../ui/circular-progress';
import { LessonList } from './lesson-list';

type LessonLike = { slug: string; name: string; videoId: string | null };
type ModuleLike = {
  id: number;
  slug: string;
  name: string;
  lessons: readonly LessonLike[];
};

type ModuleItemProps = {
  courseSlug: string;
  module: ModuleLike;
  rank: number;
  isOpen: boolean;
  activeLessonSlug: string | null;
  modulePercent: number;
  lessonPercents: Record<string, number>;
  lessonLocks: Record<string, LessonLock>;
};

const TRIGGER_CLASSES = [
  'sidebar-focus-ring',
  'flex items-center gap-2 w-full',
  'px-sidebar-row-inline py-sidebar-row-block',
  'text-start text-sm text-primary',
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
  courseSlug,
  module,
  rank,
  isOpen,
  activeLessonSlug,
  modulePercent,
  lessonPercents,
  lessonLocks,
}: ModuleItemProps) => (
  <Accordion.Item value={module.slug} className="flex flex-col">
    <Accordion.Header>
      <Accordion.Trigger className={TRIGGER_CLASSES}>
        <span className="tabular-nums text-tertiary text-xs font-medium shrink-0">
          {String(rank).padStart(2, '0')}
        </span>
        <span className="flex-1 min-w-0 truncate">{module.name}</span>
        <CircularProgress
          value={modulePercent}
          size={24}
          strokeWidth={8}
          ariaLabel={`Module ${module.name} progress`}
        />
        <motion.span
          className="sidebar-chevron shrink-0 inline-flex"
          // -90deg points the chevron toward inline-start in LTR. Sign-flip
          // with inlineDirSign() so it mirrors to +90 in RTL — same physical
          // logic, opposite physical direction. Closed → points back at the
          // page edge; open → points down into the panel.
          animate={{ rotate: isOpen ? 0 : -90 * inlineDirSign() }}
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
                courseSlug={courseSlug}
                moduleSlug={module.slug}
                lessons={module.lessons}
                activeLessonSlug={activeLessonSlug}
                lessonPercents={lessonPercents}
                lessonLocks={lessonLocks}
              />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Accordion.Panel>
  </Accordion.Item>
);
