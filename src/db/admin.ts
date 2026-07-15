import { desc, eq, like, or, sql } from 'drizzle-orm';
import type { DBCourse } from '@/db/schema';
import {
  coursesTable,
  lessonsTable,
  modulesTable,
  userProfileRolesTable,
  userProfileTable,
  userRolesTable,
} from '@/db/schema';
import type {
  AdminCourseSummary,
  CreateCourseInput,
} from '@/lib/admin-schemas';
import { slugify } from '@/lib/slugify';
import { db } from '.';

// re-export so existing importers of AdminCourseSummary from "@/db/admin" keep working
export type { AdminCourseSummary } from '@/lib/admin-schemas';

/** All courses with their module and lesson counts, newest-updated first. */
export async function listAdminCourses(): Promise<AdminCourseSummary[]> {
  const rows = await db
    .select({
      id: coursesTable.id,
      name: coursesTable.name,
      slug: coursesTable.slug,
      updatedAt: coursesTable.updatedAt,
      moduleCount: sql<number>`count(distinct ${modulesTable.id})`,
      lessonCount: sql<number>`count(distinct ${lessonsTable.id})`,
    })
    .from(coursesTable)
    .leftJoin(modulesTable, eq(modulesTable.courseId, coursesTable.id))
    .leftJoin(lessonsTable, eq(lessonsTable.moduleId, modulesTable.id))
    .groupBy(coursesTable.id)
    .orderBy(desc(coursesTable.updatedAt), desc(coursesTable.id));

  // Postgres count() comes back as a string via node-postgres; normalise to number.
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    updatedAt: r.updatedAt,
    moduleCount: Number(r.moduleCount),
    lessonCount: Number(r.lessonCount),
  }));
}

/** Role names assigned to the auth user (empty if no profile or no roles). */
export async function getUserRoleNames(userId: string): Promise<string[]> {
  const rows = await db
    .select({ name: userRolesTable.name })
    .from(userProfileTable)
    .innerJoin(
      userProfileRolesTable,
      eq(userProfileRolesTable.userProfileId, userProfileTable.id),
    )
    .innerJoin(
      userRolesTable,
      eq(userRolesTable.id, userProfileRolesTable.roleId),
    )
    .where(eq(userProfileTable.userId, userId));

  return rows.map((r) => r.name);
}

export async function createCourse(
  input: CreateCourseInput,
): Promise<DBCourse> {
  const base = slugify(input.name) || 'course';

  // Find a free slug: base, else base-2, base-3, ...
  const taken = await db
    .select({ slug: coursesTable.slug })
    .from(coursesTable)
    .where(
      or(eq(coursesTable.slug, base), like(coursesTable.slug, `${base}-%`)),
    );
  const takenSet = new Set(taken.map((r) => r.slug));
  let slug = base;
  for (let n = 2; takenSet.has(slug); n++) slug = `${base}-${n}`;

  const [created] = await db
    .insert(coursesTable)
    .values({
      name: input.name,
      slug,
      description: input.description ?? null,
      imageUrl: input.imageUrl ?? null,
    })
    .returning();
  return created;
}
