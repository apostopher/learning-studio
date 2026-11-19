import { asc, desc, eq, getTableName, sql } from 'drizzle-orm';
import { db } from '#/db';
import { aiChats, aiMessages, userProfileTable } from '#/db/schema';
import {
  SESSIONS_PAGE_SIZE,
  type SessionMessage,
  type SessionSummary,
} from '#/lib/viper-session-schemas';

/**
 * Admin-only, read-only access to learners' Viper chats (the AI Training
 * tab's Sessions section). Nothing here writes: these are learners' private
 * conversations, shown to admins to see how Viper is answering.
 */

/**
 * The OUTER chat's id, table-qualified by hand. Interpolating `aiChats.id`
 * into the subqueries below would render bare `"id"` whenever drizzle thinks
 * the select is single-table, and Postgres binds a bare `"id"` to the
 * subquery's own table: every chat would then count no messages (the same
 * bug shipped once, 2026-11-12, see `outerRef` in progress-components.ts).
 */
const outerChatId = sql`${sql.identifier(getTableName(aiChats))}.${sql.identifier(aiChats.id.name)}`;

const summaryColumns = {
  id: aiChats.id,
  title: aiChats.title,
  // concat_ws skips a null half, so a first name alone still names someone;
  // nullif turns "no name at all" into null for the UI to word.
  learnerName: sql<
    string | null
  >`nullif(trim(concat_ws(' ', ${userProfileTable.firstName}, ${userProfileTable.lastName})), '')`,
  updatedAt: aiChats.updatedAt,
  messageCount: sql<number>`(
    select count(*)::int from ai_messages m where m.chat_id = ${outerChatId}
  )`.mapWith(Number),
  isVideoCall: sql<boolean>`exists (
    select 1 from video_calls v where v.chat_id = ${outerChatId}
  )`.mapWith(Boolean),
};

const summaries = () =>
  db
    .select(summaryColumns)
    .from(aiChats)
    .leftJoin(userProfileTable, eq(userProfileTable.userId, aiChats.userId));

/**
 * One page of every learner's chats, most recently active first. Reads one
 * row past the page to learn whether another page exists.
 */
export async function listViperSessions(
  page: number,
): Promise<{ sessions: SessionSummary[]; hasMore: boolean }> {
  const rows = await summaries()
    // id breaks ties so two chats updated in the same instant cannot swap
    // places between page reads and appear twice (or never).
    .orderBy(desc(aiChats.updatedAt), desc(aiChats.id))
    .limit(SESSIONS_PAGE_SIZE + 1)
    .offset(page * SESSIONS_PAGE_SIZE);
  return {
    sessions: rows.slice(0, SESSIONS_PAGE_SIZE),
    hasMore: rows.length > SESSIONS_PAGE_SIZE,
  };
}

/** One chat's summary and its messages in conversation order, or null. */
export async function getViperSession(chatId: string): Promise<{
  summary: SessionSummary;
  messages: SessionMessage[];
} | null> {
  const [summary] = await summaries().where(eq(aiChats.id, chatId)).limit(1);
  if (!summary) return null;

  const rows = await db
    .select({
      id: aiMessages.id,
      role: aiMessages.role,
      parts: aiMessages.parts,
    })
    .from(aiMessages)
    .where(eq(aiMessages.chatId, chatId))
    .orderBy(asc(aiMessages.order));

  return {
    summary,
    // `parts` is untyped json; anything but an array shows as no text.
    messages: rows.map((row) => ({
      ...row,
      parts: Array.isArray(row.parts) ? row.parts : [],
    })),
  };
}
