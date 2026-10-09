import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";

let client: ReturnType<typeof postgres> | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (dbInstance) return dbInstance;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL no está configurada.");
  }
  client = postgres(url, { max: 5 });
  dbInstance = drizzle(client, { schema });
  return dbInstance;
}

export async function checkDb(): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, skipped: true, error: "DATABASE_URL ausente" };
  }
  try {
    const db = getDb();
    await db.execute(sql`select 1`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
