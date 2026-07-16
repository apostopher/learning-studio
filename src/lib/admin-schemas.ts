import { z } from 'zod';

export const ADMIN_ROLE = 'admin';

/** Course summary as delivered by GET /api/admin/courses (dates arrive as ISO strings). */
export const adminCourseSummarySchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  imageUrlAvif: z.string().nullable(),
  imageUrlWebp: z.string().nullable(),
  updatedAt: z.coerce.date(),
  moduleCount: z.number(),
  lessonCount: z.number(),
});
export type AdminCourseSummary = z.infer<typeof adminCourseSummarySchema>;

/** A full course row as delivered over JSON (dates coerced back to Date). */
export const courseSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  imageUrlAvif: z.string().nullable(),
  imageUrlWebp: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Course = z.infer<typeof courseSchema>;

/** Input accepted by POST /api/admin/courses. */
export const createCourseInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  description: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().trim().max(2000).optional(),
  ),
  // Set programmatically by the image upload flow (never user-typed, never
  // '' — the field is undefined until an upload resolves), so a plain optional
  // URL keeps the react-hook-form value type clean (string | undefined).
  imageUrlAvif: z.string().url().optional(),
  imageUrlWebp: z.string().url().optional(),
});
export type CreateCourseInput = z.infer<typeof createCourseInputSchema>;

/** Input accepted by PATCH /api/admin/courses/:id — same shape as create. */
export const updateCourseInputSchema = createCourseInputSchema;
export type UpdateCourseInput = z.infer<typeof updateCourseInputSchema>;

export const createModuleInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  // Set programmatically by the image upload flow (never user-typed).
  imageUrlAvif: z.string().url().optional(),
  imageUrlWebp: z.string().url().optional(),
});
export type CreateModuleInput = z.infer<typeof createModuleInputSchema>;

/** PATCH body for renaming / updating a module's details (name + cover image). */
export const updateModuleInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  imageUrlAvif: z.string().url().optional(),
  imageUrlWebp: z.string().url().optional(),
});
export type UpdateModuleInput = z.infer<typeof updateModuleInputSchema>;

export const createLessonInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
});
export type CreateLessonInput = z.infer<typeof createLessonInputSchema>;

export const boardLessonSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  rank: z.coerce.number(),
  isAvailable: z.boolean(),
});
export type BoardLesson = z.infer<typeof boardLessonSchema>;

export const boardModuleSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  imageUrlAvif: z.string().nullable(),
  imageUrlWebp: z.string().nullable(),
  rank: z.coerce.number(),
  lessons: z.array(boardLessonSchema),
});
export type BoardModule = z.infer<typeof boardModuleSchema>;

/** The course header delivered with the editor board. */
export const boardCourseSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  imageUrlAvif: z.string().nullable(),
  imageUrlWebp: z.string().nullable(),
});
export type BoardCourse = z.infer<typeof boardCourseSchema>;

export const courseBoardSchema = z.object({
  course: boardCourseSchema,
  modules: z.array(boardModuleSchema),
});
export type CourseBoard = z.infer<typeof courseBoardSchema>;

export const reorderModuleInputSchema = z
  .object({
    prevModuleId: z.number().int().positive().nullable(),
    nextModuleId: z.number().int().positive().nullable(),
  })
  .refine((v) => v.prevModuleId !== null || v.nextModuleId !== null, {
    message: 'At least one neighbor is required',
  });
export type ReorderModuleInput = z.infer<typeof reorderModuleInputSchema>;

export const reorderLessonInputSchema = z
  .object({
    prevLessonId: z.number().int().positive().nullable(),
    nextLessonId: z.number().int().positive().nullable(),
  })
  .refine((v) => v.prevLessonId !== null || v.nextLessonId !== null, {
    message: 'At least one neighbor is required',
  });
export type ReorderLessonInput = z.infer<typeof reorderLessonInputSchema>;
