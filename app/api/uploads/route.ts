import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getBucket, getStorageClient, publicUrlFor } from "@/lib/storage";
import {
  consumirLimite,
  ipDelCliente,
  revisarLimite,
} from "@/lib/rate-limit";
import { products } from "@/db/schema";

export const dynamic = "force-dynamic";

// SPEC 02 Paso 2: imagen del invitado → R2.
// Valida JPG/PNG/WebP de máx 10 MB en servidor (el cliente revalida en Paso 5)
// + rate-limit best-effort 20/día/IP. Códigos de error estables para i18n editor.*.
const MAX_BYTES = 10 * 1024 * 1024;
const MIME_A_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const ZONA_RE = /^zona-editable-([1-9]\d*)$/;

function firmaMagica(bytes: Uint8Array, mime: string): boolean {
  if (mime === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mime === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  if (mime === "image/webp") {
    return (
      bytes.length >= 12 &&
      bytes[0] === 0x52 && // R
      bytes[1] === 0x49 && // I
      bytes[2] === 0x46 && // F
      bytes[3] === 0x46 && // F
      bytes[8] === 0x57 && // W
      bytes[9] === 0x45 && // E
      bytes[10] === 0x42 && // B
      bytes[11] === 0x50 // P
    );
  }
  return false;
}

export async function POST(req: Request) {
  const ip = ipDelCliente(req);
  const cupo = revisarLimite(ip, 20);
  if (!cupo.permitido) {
    return NextResponse.json(
      { error: "limite-diario" },
      {
        status: 429,
        headers: { "Retry-After": String(cupo.reintentoSeg) },
      },
    );
  }

  let forma: FormData;
  try {
    forma = await req.formData();
  } catch {
    return NextResponse.json({ error: "archivo-requerido" }, { status: 400 });
  }

  const archivo = forma.get("file");
  const productCode = String(forma.get("productCode") ?? "").trim();
  const zonaId = String(forma.get("zonaId") ?? "").trim();

  if (!productCode) {
    return NextResponse.json({ error: "codigo-requerido" }, { status: 400 });
  }
  if (!ZONA_RE.test(zonaId)) {
    return NextResponse.json({ error: "zona-no-valida" }, { status: 400 });
  }
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "archivo-requerido" }, { status: 400 });
  }
  if (archivo.size <= 0) {
    return NextResponse.json({ error: "archivo-requerido" }, { status: 400 });
  }
  if (archivo.size > MAX_BYTES) {
    return NextResponse.json({ error: "muy-grande" }, { status: 413 });
  }
  const mime = (archivo.type || "").toLowerCase();
  const ext = MIME_A_EXT[mime];
  if (!ext) {
    return NextResponse.json({ error: "tipo-no-valido" }, { status: 415 });
  }

  // El producto debe existir: evita huérfanos en R2.
  try {
    const db = getDb();
    const filas = await db
      .select({ code: products.code })
      .from(products)
      .where(eq(products.code, productCode))
      .limit(1);
    if (filas.length === 0) {
      return NextResponse.json(
        { error: "producto-no-encontrado" },
        { status: 404 },
      );
    }
  } catch {
    return NextResponse.json({ error: "base-no-disponible" }, { status: 503 });
  }

  const bytes = new Uint8Array(await archivo.arrayBuffer());
  if (!firmaMagica(bytes, mime)) {
    return NextResponse.json({ error: "tipo-no-valido" }, { status: 415 });
  }

  const key = `personalizaciones/${productCode}/${zonaId}/${randomUUID()}.${ext}`;
  try {
    const s3 = getStorageClient();
    await s3.send(
      new PutObjectCommand({
        Bucket: getBucket(),
        Key: key,
        Body: Buffer.from(bytes),
        ContentType: mime,
      }),
    );
  } catch {
    return NextResponse.json(
      { error: "almacen-no-disponible" },
      { status: 503 },
    );
  }

  const trasConsumo = consumirLimite(ip, 20);
  if (!trasConsumo.permitido) {
    // Condición de carrera entre paralelas: la subida ya quedó; se informa el tope.
    return NextResponse.json(
      { error: "limite-diario" },
      {
        status: 429,
        headers: { "Retry-After": String(trasConsumo.reintentoSeg) },
      },
    );
  }

  return NextResponse.json(
    { key, url: publicUrlFor(key) },
    {
      status: 201,
      headers: { "X-RateLimit-Remaining": String(trasConsumo.restantes) },
    },
  );
}
