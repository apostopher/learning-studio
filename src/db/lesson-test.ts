import { eq, and, desc } from "drizzle-orm";
import { db } from "#/db";
import { lessonTestResultsTable } from "./schema";

export async function saveTestResult(data: {
  userId: string;
  lessonSlug: string;
  questions: unknown;
  answers: unknown;
  totalScore: number;
}) {
  const [result] = await db
    .insert(lessonTestResultsTable)
    .values({
      userId: data.userId,
      lessonSlug: data.lessonSlug,
      questions: data.questions,
      answers: data.answers,
      totalScore: data.totalScore,
      completedAt: new Date(),
    })
    .returning();

  return result;
}

export async function getTestResults(userId: string, lessonSlug: string) {
  return db
    .select()
    .from(lessonTestResultsTable)
    .where(
      and(
        eq(lessonTestResultsTable.userId, userId),
        eq(lessonTestResultsTable.lessonSlug, lessonSlug),
      ),
    )
    .orderBy(desc(lessonTestResultsTable.createdAt));
}
