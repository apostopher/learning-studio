import { motion, useReducedMotion } from 'motion/react';
import { readSidebarMotionTokens } from '../../lib/sidebar-motion';

const MODULE_ROW_COUNT = 6;
const NESTED_LESSONS_BY_INDEX: Record<number, number> = { 2: 2, 3: 2 };
const OPACITY_STEP_FALLBACK = 0.12;

function rowOpacity(index: number): number {
  if (typeof window === 'undefined') return 1 - index * OPACITY_STEP_FALLBACK;
  const raw = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue('--sidebar-skeleton-row-opacity-step');
  const step = Number.parseFloat(raw);
  const safe = Number.isFinite(step) && step > 0 ? step : OPACITY_STEP_FALLBACK;
  return Math.max(0.1, 1 - index * safe);
}

const shimmerAnimate = {
  backgroundPosition: ['0% 0', '-200% 0'] as [string, string],
};

export const SidebarSkeleton = () => {
  const reduced = useReducedMotion();
  const tokens = readSidebarMotionTokens();
  const transition = reduced
    ? { duration: 0 }
    : {
        duration: tokens.shimmerS,
        repeat: Number.POSITIVE_INFINITY,
        ease: 'linear' as const,
      };
  const animate = reduced ? undefined : shimmerAnimate;

  return (
    <div
      aria-busy="true"
      className="flex flex-col gap-sidebar-row-gap px-sidebar-row-inline py-sidebar-row-block"
    >
      <motion.div
        aria-hidden="true"
        className="sidebar-skeleton-row"
        style={{ blockSize: 'var(--block-size-sidebar-skeleton-header)' }}
        animate={animate}
        transition={transition}
      />
      {Array.from({ length: MODULE_ROW_COUNT }, (_, moduleIndex) => (
        <div
          key={moduleIndex}
          className="flex flex-col gap-sidebar-row-gap"
          style={{ opacity: rowOpacity(moduleIndex) }}
          data-role="sidebar-skeleton-module"
        >
          <motion.div
            aria-hidden="true"
            className="sidebar-skeleton-row"
            style={{ blockSize: 'var(--block-size-sidebar-skeleton-module)' }}
            animate={animate}
            transition={transition}
          />
          {Array.from(
            { length: NESTED_LESSONS_BY_INDEX[moduleIndex] ?? 0 },
            (_, lessonIndex) => (
              <motion.div
                key={lessonIndex}
                aria-hidden="true"
                className="sidebar-skeleton-row ms-sidebar-lesson-indent"
                style={{
                  blockSize: 'var(--block-size-sidebar-skeleton-lesson)',
                }}
                animate={animate}
                transition={transition}
              />
            ),
          )}
        </div>
      ))}
    </div>
  );
};
