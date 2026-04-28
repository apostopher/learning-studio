import { lessonMaterialTable } from "./schema";
import { db } from "#/db";
import { eq } from "drizzle-orm";

export async function getLessonMaterial(lessonSlug: string) {
  try {
    const lessonMaterials = await db
      .select()
      .from(lessonMaterialTable)
      .where(eq(lessonMaterialTable.lessonSlug, lessonSlug))
      .limit(1);

    if (lessonMaterials.length === 0) {
      return null;
    }

    return lessonMaterials[0];
  } catch (error) {
    console.error(error);
    return null;
  }
}

export type LessonMaterial = Awaited<ReturnType<typeof getLessonMaterial>>;
