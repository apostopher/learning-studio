import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  coursesTable,
  lessonMaterialTable,
  lessonsTable,
  modulesTable,
} from "@/db/schema";
import {
  type CourseContent,
  courseContentToHtml,
  type ModuleContent,
} from "@/lib/course-content";

/**
 * getCourseDetails (src/db/course.ts) does not carry lesson_material text, so
 * this is a minimal, focused reader dedicated to agent RAG enrichment: it
 * selects courses→modules→lessons left-joined to lesson_material (matched by
 * lessons.slug = lesson_material.lesson_slug), ordered by rank, and hands the
 * assembled shape to the pure builder in src/lib/course-content.ts.
 */
export async function getCourseContentForAgent(slug: string): Promise<string> {
  const rows = await db
    .select({
      courseName: coursesTable.name,
      moduleId: modulesTable.id,
      moduleName: modulesTable.name,
      lessonId: lessonsTable.id,
      lessonName: lessonsTable.name,
      text: lessonMaterialTable.text,
      proTips: lessonMaterialTable.proTips,
    })
    .from(coursesTable)
    .leftJoin(modulesTable, eq(modulesTable.courseId, coursesTable.id))
    .leftJoin(lessonsTable, eq(lessonsTable.moduleId, modulesTable.id))
    .leftJoin(
      lessonMaterialTable,
      eq(lessonMaterialTable.lessonSlug, lessonsTable.slug),
    )
    .where(eq(coursesTable.slug, slug))
    .orderBy(asc(modulesTable.rank), asc(lessonsTable.rank));

  if (rows.length === 0) return "";

  const courseName = rows[0].courseName;
  const modules: ModuleContent[] = [];
  const moduleMap = new Map<number, ModuleContent>();
  // lesson_material.lesson_slug has no unique constraint, so the left-join
  // above can return >1 material row per lesson — key lessons by lessons.id
  // and keep only the first material row seen for each, so a lesson never
  // appears twice in the rendered output.
  const seenLessonIds = new Set<number>();

  for (const row of rows) {
    if (row.moduleId === null || row.moduleName === null) continue;
    let mod = moduleMap.get(row.moduleId);
    if (!mod) {
      mod = { name: row.moduleName, lessons: [] };
      moduleMap.set(row.moduleId, mod);
      modules.push(mod);
    }
    if (row.lessonId === null || row.lessonName === null) continue;
    if (seenLessonIds.has(row.lessonId)) continue;
    seenLessonIds.add(row.lessonId);
    mod.lessons.push({
      name: row.lessonName,
      text: row.text,
      proTips: row.proTips,
    });
  }

  const course: CourseContent = { name: courseName, modules };
  return courseContentToHtml(course);
}
