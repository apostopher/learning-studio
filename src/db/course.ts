import { db } from ".";
import {
  coursesTable,
  modulesTable,
  lessonsTable,
  lessonDependenciesTable,
  moduleDependenciesTable,
  orgLessonsTable,
  orgsTable,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { inArray } from "drizzle-orm";
import { cacheWithRedis } from "@/integrations/upstash/redis";
import type { DBModule, DBLesson } from "@/db/schema";
import type {
  SubscriptionType,
  VideoResponse,
  CourseLessonDependencies,
} from "@/types";

type LessonDetails = DBLesson & {
  dependsOn: CourseLessonDependencies;
  videoId: string;
  videoDetails?: VideoResponse;
  organizations: { id: number; name: string }[];
};
type ModuleDetails = DBModule & {
  dependsOn: string[];
  lessons: LessonDetails[];
};

export async function getCourseDetails(slug: string) {
  // 1️⃣ Get course and its modules in a single query
  const courseWithModules = await db
    .select({
      course: coursesTable,
      module: modulesTable,
    })
    .from(coursesTable)
    .leftJoin(modulesTable, eq(modulesTable.courseId, coursesTable.id))
    .where(eq(coursesTable.slug, slug));

  if (!courseWithModules || courseWithModules.length === 0) return null;

  const course = courseWithModules[0].course;

  // 2️⃣ Get all lessons + dependencies + module dependencies in one query
  const modules = courseWithModules
    .map((m) => m.module)
    .filter((module): module is DBModule => Boolean(module));
  const moduleMapWithDependencies = new Map<number, ModuleDetails>();

  // Create moduleMap from modules array
  modules.forEach((module) => {
    moduleMapWithDependencies.set(module.id, {
      ...module,
      requiredSubscriptions: module.requiredSubscriptions as SubscriptionType[],
      dependsOn: [],
      lessons: [],
    });
  });

  const lessonData = await db
    .select({
      lesson: lessonsTable,
      lessonDep: lessonDependenciesTable,
      moduleDep: moduleDependenciesTable,
      orgLesson: orgLessonsTable,
      org: orgsTable,
    })
    .from(lessonsTable)
    .leftJoin(
      lessonDependenciesTable,
      eq(lessonsTable.id, lessonDependenciesTable.lessonId),
    )
    .leftJoin(
      moduleDependenciesTable,
      eq(lessonsTable.moduleId, moduleDependenciesTable.moduleId),
    )
    .leftJoin(orgLessonsTable, eq(lessonsTable.id, orgLessonsTable.lessonId))
    .leftJoin(orgsTable, eq(orgLessonsTable.orgId, orgsTable.id))
    .where(
      inArray(
        lessonsTable.moduleId,
        db
          .select({ id: modulesTable.id })
          .from(modulesTable)
          .where(eq(modulesTable.courseId, course.id)),
      ),
    );

  // 3️⃣ Restructure the result

  const lessonMap = new Map<number, LessonDetails>();

  for (const { lesson, lessonDep, moduleDep, orgLesson, org } of lessonData) {
    // group lessons
    if (!lessonMap.has(lesson.id)) {
      lessonMap.set(lesson.id, {
        ...lesson,
        requiredSubscriptions:
          lesson.requiredSubscriptions as SubscriptionType[],
        videoId: lesson.videoId || "",
        otherVideoIds: lesson.otherVideoIds || [],
        videoDetails: undefined, // will be populated later
        dependsOn: [],
        organizations: [],
      });
    }
    if (lessonDep?.dependsOn) {
      lessonMap.get(lesson.id)?.dependsOn.push(...lessonDep.dependsOn);
    }

    // Add organization information if it exists
    if (orgLesson && org) {
      const lessonDetails = lessonMap.get(lesson.id);
      if (
        lessonDetails &&
        !lessonDetails.organizations.find((o) => o.id === org.id)
      ) {
        lessonDetails.organizations.push({
          id: org.id,
          name: org.name,
        });
      }
    }

    const mod = moduleMapWithDependencies.get(lesson.moduleId);

    if (moduleDep?.dependsOn && mod) {
      moduleDep.dependsOn.forEach((dep) => {
        if (!mod.dependsOn.includes(dep)) {
          mod.dependsOn.push(dep);
        }
      });
    }

    if (mod && !mod.lessons.find((l) => l.id === lesson.id)) {
      const lessonDetails = lessonMap.get(lesson.id);
      if (lessonDetails) {
        mod.lessons.push(lessonDetails);
      }
    }
  }

  // sort each module.lessons by rank
  moduleMapWithDependencies.forEach((mod) => {
    const modLessons = mod.lessons.sort(
      (a, b) => Number(a.rank) - Number(b.rank),
    );
    // add depends on for module ids 2 to 5
    if (mod.id > 1 && mod.id < 6) {
      modLessons.forEach((lesson, index) => {
        const isFree = lesson.requiredSubscriptions.includes("associate");
        if (index > 0 && !isFree && lesson.dependsOn.length === 0) {
          lesson.dependsOn.push({
            moduleSlug: mod.slug,
            lessonSlug: modLessons[index - 1].slug,
          });
        }
      });
    }
  });

  return {
    ...course,
    modules: Array.from(moduleMapWithDependencies.values()).sort(
      (a, b) => Number(a.rank) - Number(b.rank),
    ),
  };
}

export type CourseDetails = Awaited<ReturnType<typeof getCourseDetails>>;

export const getCourseDetailsWithCache = cacheWithRedis<
  string,
  Awaited<ReturnType<typeof getCourseDetails>>
>("course-details", getCourseDetails);
