import { GetObjectCommand } from "@aws-sdk/client-s3";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { customizations } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getBucket, getStorageClient, publicUrlFor } from "@/lib/storage";
import { sanitizeSvg, validarContratoSvg } from "@/lib/svg";
import type { Product } from "@/db/schema";

// lib/plantilla.ts — Carga server del SVG base + reapertura (SPEC 02 Paso 4).
//
// Sin SVG configurado, o con SVG sin medidas físicas, se devuelve un motivo
// de aviso: la página muestra aviso visible, nunca error ni crash.

export type PlantillaOk = {
  ok: true;
  svg: string;
  anchoMm: number;
  altoMm: number;
  zonas: string[];
  textos: string[];
};

export type PlantillaAviso = {
  ok: false;
  motivo: "sin-svg" | "sin-medidas" | "sin-zonas" | "no-disponible";
};

async function leerR2(key: string): Promise<string | null> {
  try {
    const s3 = getStorageClient();
    const res = await s3.send(
      new GetObjectCommand({ Bucket: getBucket(), Key: key }),
    );
    const cuerpo = res.Body as unknown as
      | { transformToString?: () => Promise<string> }
      | undefined;
    if (cuerpo && typeof cuerpo.transformToString === "function") {
      return await cuerpo.transformToString();
    }
    return null;
  } catch {
    return null;
  }
}

function leerLocalRespaldo(code: string): string | null {
  // Respaldo local del piloto (el seed ya lo subió a R2; si R2 falla, el
  // editor sigue mostrando el diseño en lugar de romperse).
  const ruta = path.resolve(
    process.cwd(),
    `public/editor/${code}/diseno-piloto.svg`,
  );
  try {
    if (fs.existsSync(ruta)) return fs.readFileSync(ruta, "utf8");
  } catch {
    return null;
  }
  return null;
}

/** Carga y valida el SVG base de la plantilla. Nunca lanza. */
export async function cargarPlantillaSvg(
  product: Pick<Product, "code" | "plantillaSvgKey">,
): Promise<PlantillaOk | PlantillaAviso> {
  if (!product.plantillaSvgKey) return { ok: false, motivo: "sin-svg" };
  const crudo =
    (await leerR2(product.plantillaSvgKey)) ?? leerLocalRespaldo(product.code);
  if (!crudo) return { ok: false, motivo: "no-disponible" };
  const svg = sanitizeSvg(crudo);
  const contrato = validarContratoSvg(svg);
  if (!contrato.medidas) return { ok: false, motivo: "sin-medidas" };
  if (contrato.zonas.length === 0) return { ok: false, motivo: "sin-zonas" };
  return {
    ok: true,
    svg,
    anchoMm: contrato.medidas.anchoMm,
    altoMm: contrato.medidas.altoMm,
    zonas: contrato.zonas,
    textos: contrato.textos,
  };
}

export type Reapertura = {
  productCode: string;
  imagenes: { zonaId: string; src: string; r2Key: string }[];
  ajustesImagenes: { zonaId: string; x: number; y: number; escala: number }[];
  ajustesTextos: {
    id: string;
    contenido: string;
    tamano: number;
    color: string;
    fuente: string;
  }[];
} | null;

/** Carga una personalización por token (?t=). Null si el enlace no vale. */
export async function cargarReapertura(token: string): Promise<Reapertura> {
  try {
    const db = getDb();
    const filas = await db
      .select()
      .from(customizations)
      .where(eq(customizations.tokenSecreto, token))
      .limit(1);
    const fila = filas[0];
    if (!fila) return null;
    return {
      productCode: fila.productCode,
      // Proxy mismo-origen (mitigación CORS del raster): nunca CDN directo.
      imagenes: fila.imagenes.map((e) => ({
        zonaId: e.zonaId,
        src: `/api/r2/${e.r2Key}`,
        r2Key: e.r2Key,
      })),
      ajustesImagenes: fila.ajustes.imagenes,
      ajustesTextos: fila.ajustes.textos,
    };
  } catch {
    return null;
  }
}

/** URL pública para una key R2 (fotos subidas por el invitado). */
export function urlParaR2(key: string): string {
  return publicUrlFor(key);
}
