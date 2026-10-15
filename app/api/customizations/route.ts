import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  customizations,
  products,
  type CustomizationAjustes,
  type CustomizationImagen,
} from "@/db/schema";
import { esFuenteValida, normalizarFuente } from "@/lib/fuentes";

export const dynamic = "force-dynamic";

// SPEC 02 Paso 2: persistencia invitada sin cuentas.
// POST crea (token nuevo), PUT reemplaza (last-write-wins), GET reabre por ?t=.
// Sin caducidad. El PDF no se almacena.
const ZONA_RE = /^zona-editable-([1-9]\d*)$/;
const TEXTO_RE = /^texto-editable-[A-Za-z0-9_-]{1,64}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const R2KEY_RE = /^[A-Za-z0-9][A-Za-z0-9/_.-]{0,400}\.(jpg|jpeg|png|webp)$/i;
const COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
// SPEC 2.4: catálogo cerrado en lib/fuentes.ts (10 ids + alias legado
// "Roboto" que se normaliza a "roboto"; el resto se rechaza).
// Alineaciones del SPEC 2.1 (opcionales: los ?t= viejos no las traen).
const ALINEACIONES = ["izquierda", "centro", "derecha"] as const;

function esNumero(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function validarImagenes(v: unknown): v is CustomizationImagen[] {
  if (!Array.isArray(v) || v.length > 20) return false;
  return v.every(
    (e) =>
      typeof e === "object" &&
      e !== null &&
      ZONA_RE.test(String((e as { zonaId?: unknown }).zonaId ?? "")) &&
      R2KEY_RE.test(String((e as { r2Key?: unknown }).r2Key ?? "")),
  );
}

function validarAjustes(v: unknown): v is CustomizationAjustes {
  if (typeof v !== "object" || v === null) return false;
  const o = v as {
    imagenes?: unknown;
    textos?: unknown;
  };
  if (!Array.isArray(o.imagenes) || !Array.isArray(o.textos)) return false;
  if (o.imagenes.length > 20 || o.textos.length > 20) return false;
  const imgsOk = o.imagenes.every((e) => {
    if (typeof e !== "object" || e === null) return false;
    const r = e as { zonaId?: unknown; x?: unknown; y?: unknown; escala?: unknown };
    if (!ZONA_RE.test(String(r.zonaId ?? ""))) return false;
    if (!esNumero(r.x) || !esNumero(r.y) || !esNumero(r.escala)) return false;
    if (Math.abs(r.x) > 10000 || Math.abs(r.y) > 10000) return false;
    if (r.escala < 0.1 || r.escala > 10) return false;
    return true;
  });
  if (!imgsOk) return false;
  const textosOk = o.textos.every((e) => {
    if (typeof e !== "object" || e === null) return false;
    const r = e as {
      id?: unknown;
      contenido?: unknown;
      tamano?: unknown;
      color?: unknown;
      fuente?: unknown;
      peso?: unknown;
      alineacion?: unknown;
      x?: unknown;
      y?: unknown;
    };
    if (!TEXTO_RE.test(String(r.id ?? ""))) return false;
    if (typeof r.contenido !== "string" || r.contenido.length > 500) return false;
    // SPEC 2.1: el techo UX (250 % del default) lo aplica el cliente; el
    // servidor solo acota abuso (antes 500, insuficiente para el 250 %).
    if (!esNumero(r.tamano) || r.tamano < 1 || r.tamano > 2000) return false;
    if (!COLOR_RE.test(String(r.color ?? ""))) return false;
    if (typeof r.fuente !== "string" || !esFuenteValida(r.fuente)) return false;
    // SPEC 2.4: peso opcional (ausente ⇒ 400); distinto de 400/700 se rechaza.
    if (r.peso !== undefined && r.peso !== 400 && r.peso !== 700) return false;
    // SPEC 2.1: alineación + desplazamiento opcionales (los ?t= viejos no
    // los traen); si vienen, con forma válida (cota ±10000 como imágenes).
    if (
      r.alineacion !== undefined &&
      !(ALINEACIONES as readonly string[]).includes(String(r.alineacion))
    ) {
      return false;
    }
    for (const c of [r.x, r.y]) {
      if (c !== undefined && (!esNumero(c) || Math.abs(c) > 10000)) return false;
    }
    return true;
  });
  return textosOk;
}

/** Normaliza el alias legado "Roboto" → "roboto" antes de guardar. */
function normalizarAjustes(ajustes: CustomizationAjustes): CustomizationAjustes {
  return {
    imagenes: ajustes.imagenes,
    textos: ajustes.textos.map((t) => ({
      ...t,
      fuente: normalizarFuente(t.fuente),
    })),
  };
}

async function productoExiste(code: string): Promise<boolean | null> {  try {
    const db = getDb();
    const filas = await db
      .select({ code: products.code })
      .from(products)
      .where(eq(products.code, code))
      .limit(1);
    return filas.length > 0;
  } catch {
    return null;
  }
}

/** GET /api/customizations?t=[token] — reabre en otra sesión. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = (url.searchParams.get("t") ?? "").trim();
  if (!UUID_RE.test(token)) {
    return NextResponse.json({ error: "token-no-valido" }, { status: 400 });
  }
  try {
    const db = getDb();
    const filas = await db
      .select()
      .from(customizations)
      .where(eq(customizations.tokenSecreto, token))
      .limit(1);
    const fila = filas[0];
    if (!fila) {
      return NextResponse.json({ error: "no-encontrado" }, { status: 404 });
    }
    return NextResponse.json({
      productCode: fila.productCode,
      imagenes: fila.imagenes,
      ajustes: fila.ajustes,
      actualizadoEn: fila.actualizadoEn,
    });
  } catch {
    return NextResponse.json({ error: "base-no-disponible" }, { status: 503 });
  }
}

/** POST /api/customizations — crea y entrega el token de reapertura. */
export async function POST(req: Request) {
  let cuerpo: {
    productCode?: unknown;
    imagenes?: unknown;
    ajustes?: unknown;
  };
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo-no-valido" }, { status: 400 });
  }
  const productCode = String(cuerpo.productCode ?? "").trim();
  if (!productCode) {
    return NextResponse.json({ error: "codigo-requerido" }, { status: 400 });
  }
  if (!validarImagenes(cuerpo.imagenes)) {
    return NextResponse.json({ error: "imagenes-no-validas" }, { status: 400 });
  }
  if (!validarAjustes(cuerpo.ajustes)) {
    return NextResponse.json({ error: "ajustes-no-validos" }, { status: 400 });
  }
  const existe = await productoExiste(productCode);
  if (existe === null) {
    return NextResponse.json({ error: "base-no-disponible" }, { status: 503 });
  }
  if (!existe) {
    return NextResponse.json({ error: "producto-no-encontrado" }, { status: 404 });
  }
  const tokenSecreto = randomUUID();
  try {
    const db = getDb();
    await db.insert(customizations).values({
      productCode,
      tokenSecreto,
      imagenes: cuerpo.imagenes as CustomizationImagen[],
      ajustes: normalizarAjustes(cuerpo.ajustes as CustomizationAjustes),
    });
  } catch {
    return NextResponse.json({ error: "base-no-disponible" }, { status: 503 });
  }
  return NextResponse.json({ tokenSecreto }, { status: 201 });
}

/** PUT /api/customizations — last-write-wins por token (reemplaza todo). */
export async function PUT(req: Request) {
  let cuerpo: {
    tokenSecreto?: unknown;
    productCode?: unknown;
    imagenes?: unknown;
    ajustes?: unknown;
  };
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "cuerpo-no-valido" }, { status: 400 });
  }
  const tokenSecreto = String(cuerpo.tokenSecreto ?? "").trim();
  if (!UUID_RE.test(tokenSecreto)) {
    return NextResponse.json({ error: "token-no-valido" }, { status: 400 });
  }
  if (!validarImagenes(cuerpo.imagenes)) {
    return NextResponse.json({ error: "imagenes-no-validas" }, { status: 400 });
  }
  if (!validarAjustes(cuerpo.ajustes)) {
    return NextResponse.json({ error: "ajustes-no-validos" }, { status: 400 });
  }
  try {
    const db = getDb();
    const filas = await db
      .select()
      .from(customizations)
      .where(eq(customizations.tokenSecreto, tokenSecreto))
      .limit(1);
    const fila = filas[0];
    if (!fila) {
      return NextResponse.json({ error: "no-encontrado" }, { status: 404 });
    }
    if (
      cuerpo.productCode !== undefined &&
      String(cuerpo.productCode) !== fila.productCode
    ) {
      return NextResponse.json({ error: "codigo-inmutable" }, { status: 400 });
    }
    await db
      .update(customizations)
      .set({
        imagenes: cuerpo.imagenes as CustomizationImagen[],
        ajustes: normalizarAjustes(cuerpo.ajustes as CustomizationAjustes),
        actualizadoEn: sql`now()`,
      })
      .where(eq(customizations.tokenSecreto, tokenSecreto));
  } catch {
    return NextResponse.json({ error: "base-no-disponible" }, { status: 503 });
  }
  return NextResponse.json({ tokenSecreto });
}
