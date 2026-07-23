import { db } from "@/db";
import { aiChats, aiMessages } from "@/db/schema";
import { chatTitleFromText } from "@/lib/chat-title";
import { and, asc, desc, eq, max, sql } from "drizzle-orm";

export { chatTitleFromText } from "@/lib/chat-title";

/**
 * Resolve the chat id for a streaming turn: if the caller already has a
 * `chatId` (continuing a conversation), just return it — no ownership check
 * here, callers that need one should use getChat. Otherwise create a new
 * `aiChats` row titled from the first user message and return its new id.
 */
export async function ensureChat({
  chatId,
  userId,
  firstUserText,
}: {
  chatId?: string;
  userId: string;
  firstUserText: string;
}): Promise<string> {
  if (chatId) return chatId;

  const [row] = await db
    .insert(aiChats)
    .values({ userId, title: chatTitleFromText(firstUserText) })
    .returning({ id: aiChats.id });

  if (!row) throw new Error("ensureChat: insert returned no row");
  return row.id;
}

/**
 * Append messages to a chat, ordering them after whatever is already there.
 * Order starts at `max(order)+1` for the chat (0 if the chat has no messages
 * yet) and increments per message, preserving the caller's array order.
 */
export async function appendMessages(
  chatId: string,
  msgs: Array<{ role: string; parts: unknown }>,
): Promise<void> {
  if (msgs.length === 0) return;

  const [row] = await db
    .select({ maxOrder: max(aiMessages.order) })
    .from(aiMessages)
    .where(eq(aiMessages.chatId, chatId));

  const startOrder = (row?.maxOrder ?? -1) + 1;

  await db.insert(aiMessages).values(
    msgs.map((msg, i) => ({
      chatId,
      role: msg.role,
      parts: msg.parts,
      order: startOrder + i,
    })),
  );

  await db
    .update(aiChats)
    .set({ updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(aiChats.id, chatId));
}

/**
 * List a user's chats, most recently updated first — powers the chat sidebar.
 */
export async function listChats(
  userId: string,
): Promise<Array<{ id: string; title: string; updatedAt: Date }>> {
  return db
    .select({
      id: aiChats.id,
      title: aiChats.title,
      updatedAt: aiChats.updatedAt,
    })
    .from(aiChats)
    .where(eq(aiChats.userId, userId))
    .orderBy(desc(aiChats.updatedAt));
}

/**
 * Load a single chat with its messages in order, scoped to `userId` so one
 * user can never read another's chat by guessing/enumerating `chatId`s.
 * Returns null when the chat doesn't exist or isn't owned by `userId`.
 */
export async function getChat(
  userId: string,
  chatId: string,
): Promise<{
  chat: typeof aiChats.$inferSelect;
  messages: Array<typeof aiMessages.$inferSelect>;
} | null> {
  const [chat] = await db
    .select()
    .from(aiChats)
    .where(and(eq(aiChats.id, chatId), eq(aiChats.userId, userId)));

  if (!chat) return null;

  const messages = await db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.chatId, chatId))
    .orderBy(asc(aiMessages.order));

  return { chat, messages };
}
