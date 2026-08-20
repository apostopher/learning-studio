import { createFileRoute } from '@tanstack/react-router';
import { CourseBoardContainer } from '@/components/admin/course-board-container';
import { hasAdminAccess, hasPermissionKey } from '@/lib/admin-schemas';

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
        canEditCourse: hasPermissionKey(permissions, 'course', 'update'),
        canDeleteCourse: hasPermissionKey(permissions, 'course', 'delete'),
        // The RAG corpus is guarded by `requireAdmin`, not by a permission
        // key, so the client-side mirror is the admin floor itself.
        canTrainCourse: hasAdminAccess(roles),
      }}
    />
  );
}
