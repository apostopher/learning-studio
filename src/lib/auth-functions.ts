import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { auth } from '#/lib/auth';

export const getSession = createServerFn({ method: 'GET' }).handler(
  async () => {
    const headers = getRequestHeaders();
    const session = await auth.api.getSession({ headers });

    return session;
  },
);

export const ensureSession = createServerFn({ method: 'GET' }).handler(
  async () => {
    const headers = getRequestHeaders();
    const session = await auth.api.getSession({ headers });

    if (!session) {
      throw new Error('Unauthorized');
    }

    return session;
  },
);

/** Session plus the user's role names, for the root router context. */
export const getAuthContext = createServerFn({ method: 'GET' }).handler(
  async () => {
    // Imported dynamically INSIDE the handler, never at module scope.
    // `__root.tsx` imports this file, so anything reachable from its top level
    // is in the client bundle — and `auth-context.server` pulls in the
    // database layer, where `drizzle(undefined)` throws during module
    // evaluation and the router never initialises. See that module's comment.
    const { resolveAuthContext } = await import('#/lib/auth-context.server');
    return resolveAuthContext(getRequestHeaders());
  },
);
