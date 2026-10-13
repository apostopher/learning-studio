export type LessonContent = {
  name: string;
  text: string | null;
  proTips: string | null;
};
export type ModuleContent = { name: string; lessons: LessonContent[] };
export type CourseContent = { name: string; modules: ModuleContent[] };
export type GatedLesson = LessonContent & { slug: string };
export type GatedCourse = {
  name: string;
  modules: { name: string; lessons: GatedLesson[] }[];
};

/** Lessons the learner may read — the only lesson chunks searchKB may return. */
export function allowedLessonSlugs(course: GatedCourse): string[] {
  return course.modules.flatMap((m) => m.lessons.map((l) => l.slug));
}

/**
 * Names only — enough for "what's in module 3?" without shipping material.
 * Built from the gated course, so a hidden lesson is not even named.
 */
export function courseOutline(course: GatedCourse): string {
  const lines = course.modules.map(
    (m) =>
      `- ${m.name}: ${m.lessons.length ? m.lessons.map((l) => l.name).join('; ') : '(no lessons available)'}`,
  );
  return `Course: ${course.name}\n${lines.join('\n')}`;
}

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
