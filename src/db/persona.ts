import { eq } from "drizzle-orm";
import { db } from "@/db";
import { personaTable } from "@/db/schema";

/**
 * Look up a persona row by its unique `name` (e.g. "viper7"). Returns `null`
 * when no persona with that name has been seeded yet. Used by the chat route
 * to load the system-prompt persona content.
 */
export async function getPersona(name: string) {
  const [row] = await db
    .select()
    .from(personaTable)
    .where(eq(personaTable.name, name))
    .limit(1);
  return row ?? null;
}
