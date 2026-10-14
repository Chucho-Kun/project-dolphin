import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getBucket, getStorageClient } from "@/lib/storage";

export const dynamic = "force-dynamic";

// Proxy mismo-origen para las fotos del editor (SPEC 02, mitigación CORS).
// El CDN no envía `Access-Control-Allow-Origin`: cargar la foto directo del
// CDN contaminaría el canvas (tainted) e impediría el PDF. Sirviéndola por
// este proxy, el raster es same-origin y la descarga funciona. Las keys
// llevan UUID, así que no hay enumeración práctica.
const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9/_.-]{0,400}\.(jpg|jpeg|png|webp)$/i;
const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const r2Key = (key ?? []).join("/");
  if (!KEY_RE.test(r2Key) || r2Key.includes("..")) {
    return NextResponse.json({ error: "no-encontrado" }, { status: 404 });
  }
  try {
    const s3 = getStorageClient();
    const res = await s3.send(
      new GetObjectCommand({ Bucket: getBucket(), Key: r2Key }),
    );
    const cuerpo = res.Body as unknown as
      | { transformToByteArray?: () => Promise<Uint8Array> }
      | undefined;
    if (!cuerpo || typeof cuerpo.transformToByteArray !== "function") {
      return NextResponse.json({ error: "no-disponible" }, { status: 502 });
    }
    const bytes = await cuerpo.transformToByteArray();
    const ext = (r2Key.split(".").pop() ?? "").toLowerCase();
    // Uint8Array → ArrayBuffer copiado para Response (evita SAB transferido).
    const copia = new Uint8Array(bytes.length);
    copia.set(bytes);
    return new NextResponse(copia, {
      status: 200,
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(copia.length),
      },
    });
  } catch {
    return NextResponse.json({ error: "no-encontrado" }, { status: 404 });
  }
}
