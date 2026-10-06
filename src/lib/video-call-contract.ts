import { z } from 'zod';

/**
 * The client/server contract for Tavus video calls — limits, reasons and
 * response shapes. Imported by both route handlers and data hooks, so it must
 * stay free of server-only imports.
 */

export const PER_CALL_LIMIT_SECONDS = 600;
export const DAILY_LIMIT_SECONDS = 1800;
/** Below this much time left today, a call isn't worth starting. */
export const MIN_START_SECONDS = 60;
/** When the "1 minute left" banner appears. */
export const WARNING_AT_SECONDS = 60;

export const videoCallUnavailableReasonSchema = z.enum([
  'daily_limit',
  'already_active',
  'not_configured',
]);
export type VideoCallUnavailableReason = z.infer<
  typeof videoCallUnavailableReasonSchema
>;

export const videoCallStartErrorReasonSchema = z.enum([
  'daily_limit',
  'already_active',
  'not_configured',
  'provider_unavailable',
]);
export type VideoCallStartErrorReason = z.infer<
  typeof videoCallStartErrorReasonSchema
>;

export const videoCallEndReasonSchema = z.enum([
  'user',
  'time_limit',
  'left',
  'error',
  'stale',
]);
export type VideoCallEndReason = z.infer<typeof videoCallEndReasonSchema>;

export const allowanceResponseSchema = z.object({
  canStart: z.boolean(),
  reason: videoCallUnavailableReasonSchema.nullable(),
  remainingSeconds: z.number().int().nonnegative(),
  resetsAt: z.string().datetime(),
  activeCallId: z.string().nullable(),
});
export type AllowanceResponse = z.infer<typeof allowanceResponseSchema>;

export const startRequestSchema = z.object({
  chatId: z.string().min(1).optional(),
  courseSlug: z.string().min(1).optional(),
});
export type StartRequest = z.infer<typeof startRequestSchema>;

export const startResponseSchema = z.object({
  id: z.string(),
  chatId: z.string(),
  conversationUrl: z.string().url(),
  endsAt: z.string().datetime(),
});
export type StartResponse = z.infer<typeof startResponseSchema>;

export const startErrorResponseSchema = z.object({
  reason: videoCallStartErrorReasonSchema,
  resetsAt: z.string().datetime().optional(),
});

export const statusResponseSchema = z.object({
  status: z.enum(['active', 'ended']),
  endReason: videoCallEndReasonSchema.nullable(),
  durationSeconds: z.number().int().nullable(),
  transcriptSaved: z.boolean(),
  chatId: z.string(),
});
export type VideoCallStatusResponse = z.infer<typeof statusResponseSchema>;
