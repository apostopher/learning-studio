import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { readSidebarMotionTokens } from '../../lib/sidebar-motion';
import { CourseSidebarHeader } from './course-sidebar-header';
import { ModuleAccordion } from './module-accordion';
import { SidebarError } from './sidebar-error';
import { SidebarSkeleton } from './sidebar-skeleton';

type LessonLike = { slug: string; name: string };
type ModuleLike = {
  id: number;
  slug: string;
  name: string;
  lessons: readonly LessonLike[];
};

type CourseSidebarProps = {
  status: 'loading' | 'error' | 'ready';
  title?: string;
  moduleCount?: number;
  lessonCount?: number;
  modules?: readonly ModuleLike[];
  openModuleSlug: string | null;
  onOpenChange: (slug: string | null) => void;
  activeLessonSlug: string | null;
};

const STAGE_CLASSES = 'flex flex-col gap-sidebar-section-gap min-h-0';

export const CourseSidebar = ({
  status,
  title,
  moduleCount,
  lessonCount,
  modules,
  openModuleSlug,
  onOpenChange,
  activeLessonSlug,
}: CourseSidebarProps) => {
  const reduced = useReducedMotion();
  const tokens = readSidebarMotionTokens();
  const revealTransition = reduced
    ? { duration: 0 }
    : { duration: tokens.revealS, ease: tokens.ease };
  const initialFilter = reduced
    ? 'blur(0px)'
    : 'blur(var(--blur-sidebar-reveal))';

  return (
    <nav aria-label="Course contents" className="h-full min-h-0">
      <AnimatePresence mode="wait" initial={false}>
        {status === 'loading' ? (
          <motion.div
            key="loading"
            className={STAGE_CLASSES}
            exit={{ opacity: 0 }}
            transition={revealTransition}
          >
            <SidebarSkeleton />
          </motion.div>
        ) : status === 'error' ? (
          <motion.div
            key="error"
            className={STAGE_CLASSES}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={revealTransition}
          >
            <SidebarError />
          </motion.div>
        ) : (
          <motion.div
            key="ready"
            className={STAGE_CLASSES}
            initial={{ opacity: 0, filter: initialFilter }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            transition={revealTransition}
          >
            <CourseSidebarHeader
              title={title ?? ''}
              moduleCount={moduleCount ?? 0}
              lessonCount={lessonCount ?? 0}
            />
            <ModuleAccordion
              modules={modules ?? []}
              openModuleSlug={openModuleSlug}
              onOpenChange={onOpenChange}
              activeLessonSlug={activeLessonSlug}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};
