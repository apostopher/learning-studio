import { Link, useRouterState } from '@tanstack/react-router';
import { motion, useReducedMotion } from 'motion/react';
import { computeNavCurrent } from './compute-nav-current';

type CourseHeaderNavProps = { courseSlug: string };

/**
 * The site-wide navigation, at the trailing end of the course header.
 *
 * Adding a section should be a single object in NAV_ITEMS — which is why the
 * items are data rather than repeated JSX, and why the active treatment is a
 * single shared element rather than a per-link style each new entry would have
 * to remember to opt into.
 *
 * Labels are lowercase in the DOM and uppercased in CSS: `text-transform` is
 * presentational, so a screen reader still announces "Library" rather than
 * spelling out an all-caps string.
 */
const NAV_ITEMS = [
  { label: 'Modules', to: '/course/$courseSlug/modules' },
  { label: 'News', to: '/course/$courseSlug/news' },
  { label: 'Library', to: '/course/$courseSlug/library' },
  { label: 'Settings', to: '/course/$courseSlug/settings' },
] as const;

/**
 * No overshoot. A nav indicator is a state swap, not a physical object being
 * thrown — a bounce here reads as the UI being unsure where it landed.
 */
const INDICATOR_SPRING = { type: 'spring', duration: 0.28, bounce: 0 } as const;

/**
 * `layoutId` makes the gold block a SHARED element, so it morphs from the old
 * item to the new one instead of one box hiding and another appearing. CSS
 * cannot do this — they are different elements in different positions, and
 * there is no transition between separate elements to hook.
 *
 * `borderRadius` is an inline PIXEL value, not the `--radius-inner` class it
 * would otherwise use. Layout animations work by scaling, which distorts
 * corners, and Motion only corrects for that when the radius is in px.
 */
const ActiveIndicator = ({ reduced }: { reduced: boolean }) => (
  <motion.span
    layoutId="course-nav-active"
    className="course-nav__pill"
    style={{ borderRadius: 8 }}
    // Reduced motion means gentler, not none: the indicator still moves to the
    // new item and the colours still change, it just does not travel there.
    transition={reduced ? { duration: 0 } : INDICATOR_SPRING}
  />
);

export const CourseHeaderNav = ({ courseSlug }: CourseHeaderNavProps) => {
  const reduced = useReducedMotion() ?? false;

  /**
   * The destination of an in-flight navigation, or the committed location when
   * nothing is running — `location.pathname` is BOTH, by construction.
   *
   * A primitive string, not an object: the store compares by value, so this
   * re-renders exactly when the path changes. It is also the only shape React
   * Compiler can track — see computeNavCurrent for what went wrong when this
   * called `matchRoute()` during render instead.
   *
   * Read from the ROUTER rather than held in local state on click: a cancelled,
   * failed or redirected navigation moves this back on its own, so the
   * highlight cannot get stranded on a page the learner never reached.
   */
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const current = computeNavCurrent(NAV_ITEMS, pathname, courseSlug);

  return (
    <nav aria-label="Sections" className="course-nav">
      {NAV_ITEMS.map((item) => {
        const isCurrent = current?.to === item.to;
        return (
          <Link
            key={item.to}
            to={item.to}
            params={{ courseSlug }}
            className="course-nav__link"
            // Drives the label colour. Deliberately NOT `data-status`, which
            // Link sets from the committed location only — the label would
            // invert a beat after the pill arrived rather than with it.
            data-current={isCurrent ? 'true' : undefined}
          >
            {isCurrent && <ActiveIndicator reduced={reduced} />}
            <span className="course-nav__label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
};
