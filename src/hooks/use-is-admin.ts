import { useRouteContext } from '@tanstack/react-router';
import { ADMIN_ROLE } from '#/lib/admin-schemas';

/**
 * Whether the signed-in user is an admin, from data the client already holds.
 *
 * No new endpoint and no new request: the root route's `beforeLoad` already
 * awaits `getAuthContext()` and puts `roles: string[]` into the router context
 * (`src/routes/__root.tsx`), which TanStack Router dehydrates into the SSR
 * payload. `/_authed/admin`'s own guard reads the same `context.roles`, so this
 * is the established client-side admin signal rather than a new one.
 *
 * Why not `adminBypass` from the material response: that is per-lesson and only
 * present once the material query for the lesson currently open has resolved,
 * so it cannot answer a whole-sidebar question, and on a locked or errored
 * response it is absent entirely.
 *
 * `strict: false` because this is called from components mounted under many
 * routes; the context is inherited from the root, so `roles` is present in the
 * app. It reads defensively anyway — a test router built without a context (or
 * any future route tree that drops it) must degrade to "not an admin", never to
 * a crash and never to an accidental bypass.
 *
 * This is a display concern only. Every server route re-derives admin status
 * from the session; nothing here relaxes an actual gate.
 */
export function useIsAdmin(): boolean {
  const context = useRouteContext({ strict: false }) as
    | { roles?: unknown }
    | undefined;
  const roles = context?.roles;
  return Array.isArray(roles) && roles.includes(ADMIN_ROLE);
}
