import { createServerFn } from '@tanstack/react-start';
import { listAdminCourses } from '@/db/admin';
import { requireAdmin } from './admin-functions.server';

/** Route-guard probe: resolves for admins, rejects otherwise. */
export const ensureAdmin = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { roles } = await requireAdmin();
    return { roles };
  },
);

/** Admin-only: all courses with counts. Self-guarded. */
export const listAdminCoursesFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requireAdmin();
    return listAdminCourses();
  },
);
