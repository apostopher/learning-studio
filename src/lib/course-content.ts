export type LessonContent = {
  name: string;
  text: string | null;
  proTips: string | null;
};
export type ModuleContent = { name: string; lessons: LessonContent[] };
export type CourseContent = { name: string; modules: ModuleContent[] };

/**
 * Pure HTML builder for a course's full structure + lesson material, used to
 * enrich RAG context for the chat agent's searchKB tool. HTML-escapes all
 * user-authored text (course/module/lesson names, material, pro tips). The
 * DB layer (src/db/course-content.ts) supplies `course`, pre-ordered by
 * module then lesson rank.
 */
export function courseContentToHtml(course: CourseContent): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lesson = (l: LessonContent) =>
    `<h3>${esc(l.name)}</h3>${l.text ? `<p>${esc(l.text)}</p>` : ''}${l.proTips ? `<p><strong>Pro tips:</strong> ${esc(l.proTips)}</p>` : ''}`;
  const mod = (m: ModuleContent) =>
    `<h2>${esc(m.name)}</h2>${m.lessons.map(lesson).join('\n')}`;
  return `<h1>${esc(course.name)}</h1>${course.modules.map(mod).join('\n')}`;
}
