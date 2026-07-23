import { asc } from "drizzle-orm";
import { db } from "@/db";
import { helpTopicsTable } from "@/db/schema";

/** All help topics, rank-ordered — used to enrich searchKB context. */
export async function getAllHelpTopics(): Promise<{ title: string; content: string }[]> {
  return db
    .select({ title: helpTopicsTable.title, content: helpTopicsTable.content })
    .from(helpTopicsTable)
    .orderBy(asc(helpTopicsTable.rank));
}
