import { createFileRoute } from '@tanstack/react-router';
import { CourseBoardContainer } from '@/components/admin/course-board-container';

export const Route = createFileRoute('/_authed/admin/$courseId/editor')({
  component: EditorPage,
});

function EditorPage() {
  const { courseId } = Route.useParams();
  const id = Number(courseId);
  if (!Number.isInteger(id) || id <= 0) {
    return <div className="p-6 text-sm text-gray-11">Course not found.</div>;
  }
  return <CourseBoardContainer courseId={id} />;
}
