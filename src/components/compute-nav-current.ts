/**
 * Which nav item the highlight belongs on, for a given pathname.
 *
 * Takes a plain STRING, not the router's `matchRoute` function, and that is
 * load-bearing rather than a style choice. React Compiler is enabled
 * (vite.config.ts), so it memoises component output against the values it can
 * see. `matchRoute()` reads mutable router state during render — invisible to
 * the compiler — so a version that called it computed the highlight once on
 * mount and then cached the JSX forever, even though the router had moved on.
 * A string prop changes, so the memo invalidates.
 *
 * The pathname to pass is `useRouterState(s => s.location.pathname)`, which is
 * the IN-FLIGHT destination while a navigation is running and the committed
 * location at rest (verified against the router, not assumed). That is what
 * makes the highlight move the instant a link is clicked rather than after the
 * route commits — the fix for "did I press it or not?" on slow destinations
 * like Modules, whose beforeLoad resolves over the network and then redirects
 * into a lesson.
 */
export function computeNavCurrent<T extends { to: string }>(
  items: readonly T[],
  pathname: string,
  courseSlug: string,
): T | undefined {
  return items.find((item) => {
    const href = navItemHref(item.to, courseSlug);
    // Prefix, not equality, so Modules stays lit on the lesson it sends you
    // to. The `/` guard stops `/library` from matching a sibling like
    // `/library-archive`.
    return pathname === href || pathname.startsWith(`${href}/`);
  });
}

/** Resolve a nav item's route template against the current course. */
export function navItemHref(to: string, courseSlug: string): string {
  return to.replace('$courseSlug', courseSlug);
}
