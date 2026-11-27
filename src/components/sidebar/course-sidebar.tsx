import { Separator } from '@base-ui/react/separator';
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useReducedMotion,
} from 'motion/react';
import type { LessonLock } from '#/lib/lesson-gating';
import { readSidebarMotionTokens } from '../../lib/sidebar-motion';
import { ArchivedLessonsSection } from './archived-lessons-section';
import type { ArchivedLesson } from './compute-archived-lessons';
import type { LessonRing } from './compute-lesson-ring';
import { CourseSidebarHeader } from './course-sidebar-header';
import { LockedModulePreview } from './locked-module-preview';
import { ModuleAccordion } from './module-accordion';
import { ModuleGroup } from './module-group';
import {
  SidebarEmptyLevel,
  type SidebarEmptyLevelReason,
} from './sidebar-empty-level';
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
  courseSlug: string;
  status: 'loading' | 'error' | 'ready';
  title?: string;
  moduleCount?: number;
  lessonCount?: number;
  modules?: readonly ModuleLike[];
  openModuleSlug: string | null;
  onOpenChange: (slug: string | null) => void;
  activeLessonSlug: string | null;
  lessonPercents?: Record<string, number>;
  modulePercents?: Record<number, number>;
  coursePercent?: number;
  lessonLocks?: Record<string, LessonLock>;
  lessonRings?: Record<string, LessonRing>;
  /** See CourseSidebarHeaderProps — absent/null means no badge. */
  level?: string | null;
  /** Lessons completed at an earlier level — see ArchivedLessonsSection. */
  archivedLessons?: readonly ArchivedLesson[];
  archiveSectionOpen?: boolean;
  onArchiveSectionOpenChange?: (open: boolean) => void;
  /**
   * Set when a learner's tree is empty because of their level (none set, or
   * no lessons at it) — the message replaces the empty module list.
   */
  emptyReason?: SidebarEmptyLevelReason | null;
  /**
   * The 3D Airmanship modules, drawn last under one `flagshipGroup.label`
   * accordion instead of among `modules`. Absent or empty: no group.
   */
  flagshipGroup?: {
    label: string;
    modules: readonly ModuleLike[];
    percent: number;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /**
     * Set when the pilot may open none of them (no level): the modules show
     * read only and faded under this note, and the ring becomes a padlock.
     */
    lockedNote?: string;
  };
};

const STAGE_CLASSES = 'flex flex-col gap-sidebar-section-gap min-h-0';

export const CourseSidebar = ({
  courseSlug,
  status,
  title,
  moduleCount,
  lessonCount,
  modules,
  openModuleSlug,
  onOpenChange,
  activeLessonSlug,
  lessonPercents,
  modulePercents,
  coursePercent,
  lessonLocks,
  lessonRings,
  level,
  archivedLessons,
  archiveSectionOpen,
  onArchiveSectionOpenChange,
  emptyReason,
  flagshipGroup,
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
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
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
              coursePercent={coursePercent ?? 0}
              level={level}
            />
            {emptyReason ? (
              <SidebarEmptyLevel reason={emptyReason} />
            ) : (
              <div className="flex flex-col gap-sidebar-row-gap">
                <ModuleAccordion
                  courseSlug={courseSlug}
                  modules={modules ?? []}
                  openModuleSlug={openModuleSlug}
                  onOpenChange={onOpenChange}
                  activeLessonSlug={activeLessonSlug}
                  lessonPercents={lessonPercents ?? {}}
                  modulePercents={modulePercents ?? {}}
                  lessonLocks={lessonLocks ?? {}}
                  lessonRings={lessonRings}
                />
                {flagshipGroup &&
                flagshipGroup.modules.length > 0 &&
                (modules?.length ?? 0) > 0 ? (
                  // Sets the group apart from the course's own modules above.
                  <Separator className="mx-sidebar-row-inline h-px bg-gray-6" />
                ) : null}
                {flagshipGroup && flagshipGroup.modules.length > 0 ? (
                  <MotionConfig
                    reducedMotion="user"
                    transition={{
                      type: 'spring',
                      bounce: 0.2,
                      visualDuration: 0.4,
                    }}
                  >
                    <ModuleGroup
                      label={flagshipGroup.label}
                      percent={
                        flagshipGroup.lockedNote ? null : flagshipGroup.percent
                      }
                      open={flagshipGroup.open}
                      onOpenChange={flagshipGroup.onOpenChange}
                    >
                      {flagshipGroup.lockedNote ? (
                        <LockedModulePreview
                          modules={flagshipGroup.modules}
                          note={flagshipGroup.lockedNote}
                        />
                      ) : (
                        <ModuleAccordion
                          courseSlug={courseSlug}
                          modules={flagshipGroup.modules}
                          openModuleSlug={openModuleSlug}
                          onOpenChange={onOpenChange}
                          activeLessonSlug={activeLessonSlug}
                          lessonPercents={lessonPercents ?? {}}
                          modulePercents={modulePercents ?? {}}
                          lessonLocks={lessonLocks ?? {}}
                          lessonRings={lessonRings}
                        />
                      )}
                    </ModuleGroup>
                  </MotionConfig>
                ) : null}
              </div>
            )}
            <ArchivedLessonsSection
              courseSlug={courseSlug}
              lessons={archivedLessons ?? []}
              open={archiveSectionOpen ?? false}
              onOpenChange={onArchiveSectionOpenChange ?? (() => {})}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};
