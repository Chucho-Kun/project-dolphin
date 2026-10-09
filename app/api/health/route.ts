import { NextResponse } from "next/server";
import { checkDb } from "@/lib/db";
import { checkStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  const [db, storage] = await Promise.all([checkDb(), checkStorage()]);

  const allOk = db.ok && storage.ok;
  const anyConfiguredFail =
    (!db.ok && !db.skipped) || (!storage.ok && !storage.skipped);

  return NextResponse.json(
    {
      status: allOk ? "ok" : "degraded",
      db,
      storage,
    },
    { status: allOk ? 200 : anyConfiguredFail ? 503 : 200 },
  );
}
