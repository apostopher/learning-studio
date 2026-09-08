import { z } from 'zod';
import { UserLevelSchema } from '#/types';

/**
 * Wire schemas for offerings — a dated run of a course.
 *
 * Its own module rather than more of `admin-schemas.ts`, which is already
 * long and is about the editor's board. Nothing here is shared with it.
 *
 * TERMINOLOGY. "Offering" is overloaded in this codebase: the editor's course
 * rail uses it for a COURSE (`add-course-button.tsx` — "offering is an alias
 * of course, not a second table"). That is a different sense from this one. A
 * course is the template; an offering is one dated run of it, and the same
 * course run twice is two offerings.
 */

/**
 * A calendar day as `yyyy-MM-dd`.
 *
 * Deliberately a plain string, never a `Date`. An offering starts on a
 * calendar day, and putting it through a `Date` on either side of the wire
 * reintroduces the timezone shift the `date` column exists to avoid. It is
 * also byte-identical to `CalendarDay.key` from the calendar grid, so a drop
 * target hands its key straight to the API with nothing in between.
 */
export const calendarDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a yyyy-MM-dd date');

/** Someone on an offering, as the roster table renders them. */
export const offeringUserSchema = z.object({
  userId: z.string(),
  /** Full name, or the email when the profile carries no name. */
  name: z.string(),
  email: z.string(),
  /**
   * Their current 3D Airmanship level FOR THIS OFFERING'S COURSE, or null if
   * they have none yet.
   *
   * Per course, not per person: the level decides which lessons they receive,
   * and someone can be advanced on one course and basic on another. Null is a
   * real state — an assigned student who has not been levelled — and the
   * table says so rather than guessing a default.
   */
  level: UserLevelSchema.nullable(),
});
export type OfferingUser = z.infer<typeof offeringUserSchema>;

/** An offering as delivered by GET /api/admin/offerings. */
export const offeringSchema = z.object({
  id: z.number(),
  courseId: z.number(),
  courseName: z.string(),
  startsOn: calendarDaySchema,
  /** Inclusive — an offering starting and ending the same day is one day. */
  endsOn: calendarDaySchema,
  users: z.array(offeringUserSchema),
});
export type Offering = z.infer<typeof offeringSchema>;

export const offeringListSchema = z.array(offeringSchema);

/**
 * The dates, checked together.
 *
 * Compared as strings, which is safe and intended: `yyyy-MM-dd` sorts
 * lexicographically in date order, so this needs no parsing and cannot drift
 * with the reader's timezone.
 */
const datesOrdered = <T extends { startsOn: string; endsOn: string }>(
  value: T,
  ctx: z.RefinementCtx,
) => {
  if (value.endsOn < value.startsOn) {
    ctx.addIssue({
      code: 'custom',
      path: ['endsOn'],
      message: 'The end date cannot be before the start date',
    });
  }
};

/** Input accepted by POST /api/admin/offerings. */
export const createOfferingInputSchema = z
  .object({
    courseId: z.number().int().positive(),
    startsOn: calendarDaySchema,
    endsOn: calendarDaySchema,
    /**
     * Optional at creation. An offering with nobody on it is a legitimate
     * state — the dates are usually fixed before the roster is — so this is
     * an empty array, not a validation failure.
     */
    userIds: z.array(z.string()).default([]),
  })
  .superRefine(datesOrdered);
export type CreateOfferingInput = z.infer<typeof createOfferingInputSchema>;

/** Input accepted by PATCH /api/admin/offerings/:id. */
export const updateOfferingInputSchema = z
  .object({
    startsOn: calendarDaySchema,
    endsOn: calendarDaySchema,
    userIds: z.array(z.string()),
  })
  .superRefine(datesOrdered);
export type UpdateOfferingInput = z.infer<typeof updateOfferingInputSchema>;

/**
 * The form the create/edit dialog binds to.
 *
 * `startsOn` IS a field, seeded from the day the course was dropped on. The
 * drag still decides where a run begins; the field is there because the same
 * dialog edits an existing offering, where moving the run is the whole point.
 *
 * The completion window in days is deliberately NOT a field. It is
 * `endsOn - startsOn`, and storing it alongside the dates would create two
 * sources of truth that disagree the moment one is edited. The dialog derives
 * it for display and writes back through the dates.
 */
export const offeringFormSchema = z
  .object({
    startsOn: calendarDaySchema.min(1, 'Pick a start date'),
    endsOn: calendarDaySchema.min(1, 'Pick an end date'),
    users: z.array(offeringUserSchema),
  })
  .superRefine(datesOrdered);
export type OfferingFormValues = z.infer<typeof offeringFormSchema>;
