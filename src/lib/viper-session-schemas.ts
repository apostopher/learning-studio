import { z } from 'zod';

/** Learners' Viper chats listed per page in the AI Training Sessions section. */
export const SESSIONS_PAGE_SIZE = 50;

/**
 * `?page=` for GET /api/admin/viper/sessions: absent means 0; anything but a
 * non-negative whole number is a 400, never silently page 0.
 */
export const sessionsPageParamSchema = z
  .string()
  .regex(/^\d+$/, 'page must be a non-negative integer')
  .transform(Number)
  .pipe(z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER))
  .nullable()
  .transform((page) => page ?? 0);

/** One learner chat, as the Sessions list shows it. */
export const sessionSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  /** Null when the learner's profile has no name on it. */
  learnerName: z.string().nullable(),
  // A Date on the server, an ISO string over the wire.
  updatedAt: z.coerce.date(),
  messageCount: z.number().int().nonnegative(),
  /** The chat holds a Tavus video call's transcript. */
  isVideoCall: z.boolean(),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

/** GET /api/admin/viper/sessions. */
export const sessionsPageSchema = z.object({
  sessions: z.array(sessionSummarySchema),
  hasMore: z.boolean(),
});
export type SessionsPage = z.infer<typeof sessionsPageSchema>;

export const sessionMessageSchema = z.object({
  id: z.string(),
  role: z.string(),
  /** AI SDK UI message parts, stored as JSON. Only text parts are shown. */
  parts: z.array(z.unknown()),
});
export type SessionMessage = z.infer<typeof sessionMessageSchema>;

/** GET /api/admin/viper/sessions/$chatId. */
export const sessionTranscriptSchema = z.object({
  summary: sessionSummarySchema,
  messages: z.array(sessionMessageSchema),
});
export type SessionTranscript = z.infer<typeof sessionTranscriptSchema>;
