import { createFileRoute } from '@tanstack/react-router';
// `#/` not `@/`: vitest cannot resolve the `@/` alias, and this module is
// imported directly by its route test.
import { CourseBoardContainer } from '#/components/admin/course-board-container';
import { hasAdminAccess, hasOrgPermission } from '#/lib/admin-schemas';

/**
 * The per-course **configure** surface: module CRUD, lesson config (video,
 * material, quiz, gates, sequencing), course actions, staff, onboarding, news
 * and persona.
 *
 * Sibling of `/admin/editor`, not superseded by it. That one COMPOSES —
 * dragging a library lesson into a course, moving it, reordering, removing the
 * placement; this one AUTHORS. The split mirrors the permission model: a
 * placement is course-scoped `structure` work, while what a lesson IS follows
 * its discipline. Both surfaces let a lesson be reordered within a module;
 * that overlap is accepted.
 */
export const Route = createFileRoute('/_authed/admin/$courseId/editor')({
  component: EditorPage,
});

function EditorPage() {
  const { courseId } = Route.useParams();
  const { permissions, roles } = Route.useRouteContext();
  const id = Number(courseId);
  if (!Number.isInteger(id) || id <= 0) {
    return <div className="p-6 text-sm text-secondary">Course not found.</div>;
  }
  return (
    <CourseBoardContainer
      courseId={id}
      // Read here because the route is the only place holding global
      // permissions. All three are org-level with no course-scoped fallback,
      // so the staff this route now admits hold none of them.
      capabilities={{
        canEditCourse: hasOrgPermission(roles, permissions, 'course', 'update'),
        canDeleteCourse: hasOrgPermission(
          roles,
          permissions,
          'course',
          'delete',
        ),
        // The RAG corpus is guarded by `requireAdmin`, not by a permission
        // key, so the client-side mirror is the admin floor itself.
        canTrainCourse: hasAdminAccess(roles),
      }}
    />
  );
}
