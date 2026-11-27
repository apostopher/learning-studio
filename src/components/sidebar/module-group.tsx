import { Collapsible } from '@base-ui/react/collapsible';
import { ChevronDown, Layers, Lock } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { inlineDirSign } from '#/lib/inline-direction';
import { CircularProgress } from '../ui/circular-progress';
import {
  MODULE_CONTENT_VARIANTS,
  MODULE_PANEL_VARIANTS,
  MODULE_TRIGGER_CLASSES,
} from './module-item';

type ModuleGroupProps = {
  label: string;
  /** Null when the group is closed to this pilot: a padlock, not a ring. */
  percent: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The grouped modules' own accordion. */
  children: ReactNode;
};

/**
 * A row that folds several modules under one heading: the 3D Airmanship
 * modules a course borrows, gathered at the end of the student sidebar. Drawn
 * like a module row (same trigger, ring, chevron and panel motion) so it reads
 * as one more entry in the list; its modules sit indented inside it.
 */
export const ModuleGroup = ({
  label,
  percent,
  open,
  onOpenChange,
  children,
}: ModuleGroupProps) => (
  <Collapsible.Root
    open={open}
    onOpenChange={onOpenChange}
    className="flex flex-col"
  >
    <Collapsible.Trigger className={MODULE_TRIGGER_CLASSES}>
      <Layers className="size-4 shrink-0 text-tertiary" aria-hidden="true" />
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {percent === null ? (
        <>
          <Lock className="size-4 shrink-0 text-tertiary" aria-hidden="true" />
          <span className="sr-only">, not open to you yet</span>
        </>
      ) : (
        <CircularProgress
          value={percent}
          size={24}
          strokeWidth={8}
          ariaLabel={`${label} progress`}
        />
      )}
      <motion.span
        className="sidebar-chevron shrink-0 inline-flex"
        // Same rotation as a module row's chevron — see ModuleItem.
        animate={{ rotate: open ? 0 : -90 * inlineDirSign() }}
        style={{ willChange: 'transform' }}
        aria-hidden="true"
      >
        <ChevronDown className="size-4" />
      </motion.span>
    </Collapsible.Trigger>
    <Collapsible.Panel keepMounted className="overflow-hidden">
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            variants={MODULE_PANEL_VARIANTS}
            initial="closed"
            animate="open"
            exit="closed"
          >
            <motion.div
              variants={MODULE_CONTENT_VARIANTS}
              className="ms-sidebar-row-inline border-s border-gray-6 ps-1 pt-sidebar-row-gap"
            >
              {children}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Collapsible.Panel>
  </Collapsible.Root>
);
