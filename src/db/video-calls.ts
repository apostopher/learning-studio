import { and, eq, gte, isNull } from 'drizzle-orm';
import { db } from '#/db';
import { appendMessages } from '#/db/chat';
import { videoCalls } from '#/db/schema';
import type { VideoCallEndReason } from '#/lib/video-call-contract';

export type VideoCall = typeof videoCalls.$inferSelect;

export interface NewActiveCall {
  userId: string;
  userName: string | null;
  chatId: string;
  courseSlug: string | null;
  tavusConversationId: string;
  reservedSeconds: number;
}

const ONE_ACTIVE_INDEX = 'video_calls_one_active_per_user_idx';

export async function listCallsSince(
  userId: string,
  since: Date,
): Promise<VideoCall[]> {
  return db
    .select()
    .from(videoCalls)
    .where(
      and(eq(videoCalls.userId, userId), gte(videoCalls.startedAt, since)),
    );
}

export async function getActiveCallForUser(
  userId: string,
): Promise<VideoCall | null> {
  const [row] = await db
    .select()
    .from(videoCalls)
    .where(and(eq(videoCalls.userId, userId), eq(videoCalls.status, 'active')))
    .limit(1);
  return row ?? null;
}

/** Ownership-scoped: another user's id reads as missing. */
export async function getCallForUser(
  id: string,
  userId: string,
): Promise<VideoCall | null> {
  const [row] = await db
    .select()
    .from(videoCalls)
    .where(and(eq(videoCalls.id, id), eq(videoCalls.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function getCallById(id: string): Promise<VideoCall | null> {
  const [row] = await db
    .select()
    .from(videoCalls)
    .where(eq(videoCalls.id, id))
    .limit(1);
  return row ?? null;
}

export async function getCallByConversation(
  conversationId: string,
): Promise<VideoCall | null> {
  const [row] = await db
    .select()
    .from(videoCalls)
    .where(eq(videoCalls.tavusConversationId, conversationId))
    .limit(1);
  return row ?? null;
}

function isUniqueViolation(err: unknown, constraint: string): boolean {
  // node-postgres puts code/constraint on the error; drizzle may wrap it in `cause`.
  const e = err as { code?: string; constraint?: string; cause?: unknown };
  const pg = (e.cause ?? e) as { code?: string; constraint?: string };
  return pg.code === '23505' && pg.constraint === constraint;
}

export async function insertActiveCall(
  values: NewActiveCall,
): Promise<VideoCall | 'already_active'> {
  try {
    const [row] = await db
      .insert(videoCalls)
      .values({ ...values, status: 'active' })
      .returning();
    if (!row) throw new Error('insertActiveCall: insert returned no row');
    return row;
  } catch (err) {
    if (isUniqueViolation(err, ONE_ACTIVE_INDEX)) return 'already_active';
    throw err;
  }
}

/** Only transitions an active row; returns whether it did. */
export async function markCallEnded(
  id: string,
  fields: {
    endedAt: Date;
    durationSeconds: number;
    endReason: VideoCallEndReason;
  },
): Promise<boolean> {
  const rows = await db
    .update(videoCalls)
    .set({ status: 'ended', ...fields })
    .where(and(eq(videoCalls.id, id), eq(videoCalls.status, 'active')))
    .returning({ id: videoCalls.id });
  return rows.length > 0;
}

/**
 * Claims `transcript_saved_at` and appends the messages in one transaction,
 * so the webhook, the end route and client polling can all call it and the
 * transcript lands exactly once. Returns false when already saved.
 */
export async function saveTranscriptOnce(
  id: string,
  chatId: string,
  messages: Array<{ role: string; parts: unknown }>,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const claimed = await tx
      .update(videoCalls)
      .set({ transcriptSavedAt: new Date() })
      .where(and(eq(videoCalls.id, id), isNull(videoCalls.transcriptSavedAt)))
      .returning({ id: videoCalls.id });
    if (claimed.length === 0) return false;
    await appendMessages(chatId, messages, tx);
    return true;
  });
}
