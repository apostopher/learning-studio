import { db } from ".";
import { userOrgTable, orgLessonsTable, lessonsTable } from "./schema";
import { eq } from "drizzle-orm";
import { cacheWithRedis } from "@/integrations/upstash/redis";

export async function getContentAvailableForUser(userId: string) {
  try {
    const content = await db
      .select({
        orgId: userOrgTable.orgId,
        lessonId: orgLessonsTable.lessonId,
        lessonSlug: lessonsTable.slug,
      })
      .from(userOrgTable)
      .innerJoin(orgLessonsTable, eq(userOrgTable.orgId, orgLessonsTable.orgId))
      .innerJoin(lessonsTable, eq(orgLessonsTable.lessonId, lessonsTable.id))
      .where(eq(userOrgTable.userId, userId));
    return content;
  } catch (error) {
    console.error(error);
    return [];
  }
}

export type ContentAvailableForUser = Awaited<
  ReturnType<typeof getContentAvailableForUser>
>;

export const getContentAvailableForUserWithCache = cacheWithRedis<
  string,
  Awaited<ReturnType<typeof getContentAvailableForUser>>
>("content-available-for-user", getContentAvailableForUser);
