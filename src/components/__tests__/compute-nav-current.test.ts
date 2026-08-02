import { describe, expect, it } from 'vitest';
import { computeNavCurrent, navItemHref } from '../compute-nav-current';

const ITEMS = [
  { to: '/course/$courseSlug/modules', label: 'Modules' },
  { to: '/course/$courseSlug/news', label: 'News' },
  { to: '/course/$courseSlug/library', label: 'Library' },
  { to: '/course/$courseSlug/settings', label: 'Settings' },
] as const;

const at = (pathname: string) => computeNavCurrent(ITEMS, pathname, 'itps');

describe('computeNavCurrent', () => {
  it('highlights the section whose path the learner is on', () => {
    expect(at('/course/itps/library')).toMatchObject({ label: 'Library' });
    expect(at('/course/itps/settings')).toMatchObject({ label: 'Settings' });
  });

  /**
   * Modules sends the learner to a lesson, so it has to stay lit once they
   * arrive — otherwise the highlight vanishes the moment the navigation it
   * started completes.
   */
  it('keeps Modules highlighted on the lesson it redirects to', () => {
    expect(at('/course/itps/modules/wakeup-call/lessons/rules')).toMatchObject({
      label: 'Modules',
    });
  });

  /**
   * The reported bug, at the unit level. `location.pathname` is the in-flight
   * DESTINATION while a navigation runs, so feeding it here is what moves the
   * highlight on click rather than on commit.
   */
  it('highlights the destination, not the origin, mid-navigation', () => {
    expect(at('/course/itps/settings')).toMatchObject({ label: 'Settings' });
  });

  it('matches a sibling path only on a segment boundary', () => {
    // Without the `/` guard, prefix matching would claim this for Library.
    expect(at('/course/itps/library-archive')).toBe(undefined);
  });

  it('does not highlight anything on a course page that is no nav section', () => {
    expect(at('/course/itps')).toBe(undefined);
  });

  it('scopes matching to the course in the URL', () => {
    expect(at('/course/another/library')).toBe(undefined);
  });

  it('picks exactly one item, so two pills can never mount at once', () => {
    const matched = ITEMS.filter(
      (i) =>
        computeNavCurrent([i], '/course/itps/library', 'itps') !== undefined,
    );
    expect(matched).toHaveLength(1);
  });
});

describe('navItemHref', () => {
  it('resolves the course slug into the route template', () => {
    expect(navItemHref('/course/$courseSlug/library', 'itps')).toBe(
      '/course/itps/library',
    );
  });
});
