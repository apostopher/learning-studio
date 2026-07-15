import { createServerFn } from '@tanstack/react-start';
import { listAdminCourses } from '@/db/admin';
import { ForbiddenError, requireAdmin } from './admin-functions.server';

/** Route-guard probe: resolves for admins, rejects otherwise. */
export const ensureAdmin = createServerFn({ method: 'GET' }).handler(
  async () => {
    try {
      const { roles } = await requireAdmin();
      return { ok: true as const, roles };
    } catch (error) {
      if (error instanceof ForbiddenError) return { ok: false as const };
      throw error;
    }
  },
);

/** Admin-only: all courses with counts. Self-guarded. */
export const listAdminCoursesFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requireAdmin();
    return listAdminCourses();
  },
);
