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

function respaldoLocalPara(code: string, pagina: number): string | null {
  // SPEC 2.5: respaldo local por página. p.1 conserva el piloto legado;
  // BOD-001 usa diseno-01.svg / diseno-02.svg (el seed ya los subió a R2;
  // si R2 falla, el editor sigue mostrando el diseño en lugar de romperse).
  const candidatos =
    pagina === 2
      ? [`public/editor/${code}/diseno-02.svg`]
      : [
          `public/editor/${code}/diseno-01.svg`,
          `public/editor/${code}/diseno-piloto.svg`,
        ];
  for (const rel of candidatos) {
    const ruta = path.resolve(process.cwd(), rel);
    try {
      if (fs.existsSync(ruta)) return ruta;
    } catch {
      continue;
    }
  }
  return null;
}

function leerLocalRespaldo(code: string, pagina = 1): string | null {
  const ruta = respaldoLocalPara(code, pagina);
  if (!ruta) return null;
  try {
    return fs.readFileSync(ruta, "utf8");
  } catch {
    return null;
  }
}

/** Carga y valida una página del SVG base. Nunca lanza. */
export async function cargarPlantillaSvg(
  product: Pick<Product, "code" | "plantillaSvgKey" | "plantillaSvgKey2">,
  pagina: number = 1,
): Promise<PlantillaOk | PlantillaAviso> {
  const key =
    pagina === 2 ? product.plantillaSvgKey2 : product.plantillaSvgKey;
  if (!key) {
    // Sin key: el respaldo local aún puede mostrar la página (modo local).
    const local = leerLocalRespaldo(product.code, pagina);
    if (!local) return { ok: false, motivo: "sin-svg" };
    const svg = sanitizeSvg(local);
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
  const crudo =
    (await leerR2(key)) ?? leerLocalRespaldo(product.code, pagina);
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

export type PaginaPlantilla = (PlantillaOk | PlantillaAviso) & {
  pagina: number;
};

/**
 * Carga las páginas de la plantilla como array (SPEC 2.5 paso 4).
 * Cada página valida mm + ≥1 zona por separado. Sin SVG de pág. 2
 * (ni key ni respaldo local) devuelve solo la pág. 1, sin error.
 */
export async function cargarPaginasPlantilla(
  product: Pick<Product, "code" | "plantillaSvgKey" | "plantillaSvgKey2">,
): Promise<PaginaPlantilla[]> {
  const p1 = await cargarPlantillaSvg(product, 1);
  const paginas: PaginaPlantilla[] = [{ ...p1, pagina: 1 }];
  const hayP2 =
    Boolean(product.plantillaSvgKey2) ||
    respaldoLocalPara(product.code, 2) !== null;
  if (!hayP2) return paginas;
  const p2 = await cargarPlantillaSvg(product, 2);
  paginas.push({ ...p2, pagina: 2 });
  return paginas;
}

export type Reapertura = {
  productCode: string;
  imagenes: { zonaId: string; src: string; r2Key: string; pagina: number }[];
  ajustesImagenes: { zonaId: string; x: number; y: number; escala: number; pagina: number }[];
  ajustesTextos: {
    id: string;
    contenido: string;
    tamano: number;
    color: string;
    fuente: string;
    // SPEC 2.1: opcionales (los ?t= viejos no los traen; van tal cual).
    alineacion?: "izquierda" | "centro" | "derecha";
    x?: number;
    y?: number;
    // SPEC 2.4: peso opcional (ausente ⇒ 400).
    peso?: 400 | 700;
    // SPEC 2.5: página normalizada (ausente ⇒ 1; los ?t= viejos abren en p.1).
    pagina: number;
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
    // SPEC 2.5: sin migración de datos — `pagina` ausente ⇒ 1 (patrón SPEC 2.1).
    const paginaDe = (p: unknown): number => (p === 1 || p === 2 ? p : 1);
    return {
      productCode: fila.productCode,
      // Proxy mismo-origen (mitigación CORS del raster): nunca CDN directo.
      imagenes: fila.imagenes.map((e) => ({
        zonaId: e.zonaId,
        src: `/api/r2/${e.r2Key}`,
        r2Key: e.r2Key,
        pagina: paginaDe(e.pagina),
      })),
      ajustesImagenes: fila.ajustes.imagenes.map((e) => ({
        ...e,
        pagina: paginaDe(e.pagina),
      })),
      ajustesTextos: fila.ajustes.textos.map((e) => ({
        ...e,
        pagina: paginaDe(e.pagina),
      })),
    };
  } catch {
    return null;
  }
}

/** URL pública para una key R2 (fotos subidas por el invitado). */
export function urlParaR2(key: string): string {
  return publicUrlFor(key);
}
