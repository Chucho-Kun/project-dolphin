// lib/texto.ts — Auto-shrink de textos del editor (SPEC 02 Paso 6).
//
// Auto-shrink con piso en el 60 % de la base (límites REVISABLES). El usuario
// elige la base hasta el 250 % del default (SPEC 2.1: manija + slider); si
// el contenido desborda el slot, se encoge hasta el piso y ahí trunca con
// elipsis, y el panel lo indica.
// El slot es el ancho del contenido default al 100 % (lo mide el shell en
// el SVG vivo): el texto default siempre cabe exacto y uno más largo encoge.

/** Lista fija Google OFL (SPEC 2.4): reexport del catálogo, sin duplicar. */
export { FUENTES_EDITOR } from "./fuentes";
import { resolverFuente } from "./fuentes";

/** Piso del auto-shrink (fracción de la base). REVISABLE. */
export const PISO_AUTO_SHRINK = 0.6;

/**
 * Techo de escala manual (SPEC 2.1): 250 % del default original.
 * Revierte el tope del SPEC 02 (la base la fijan manija y slider).
 */
export const TECHO_ESCALA_TEXTO = 2.5;

export type AjusteTexto = {
  contenido: string;
  tamano: number;
  color: string;
  fuente: string;
  /** SPEC 2.4: peso opcional (ausente ⇒ 400; diseños viejos abren en Regular). */
  peso?: 400 | 700;
  // SPEC 2.1: opcionales para que los diseños viejos abran sin error.
  x?: number;
  y?: number;
};

/**
 * Completa el desplazamiento ausente (diseños viejos) con 0,0.
 */
export function normalizarPosicionTexto(ajuste: AjusteTexto): {
  x: number;
  y: number;
} {
  const x =
    typeof ajuste.x === "number" && Number.isFinite(ajuste.x) ? ajuste.x : 0;
  const y =
    typeof ajuste.y === "number" && Number.isFinite(ajuste.y) ? ajuste.y : 0;
  return { x, y };
}

export type ReferenciaTexto = {
  /** Tamaño default del SVG en px. */
  tamanoDefault: number;
  /** Ancho del contenido default al 100 % en unidades SVG. */
  anchoSlot: number;
  peso?: string;
  estilo?: string;
};

export type TextoResuelto = {
  /** Tamaño a renderizar (px SVG). */
  tamanoEfectivo: number;
  /** Contenido a renderizar (con elipsis si truncó). */
  mostrado: string;
  truncado: boolean;
};

let lienzoMedida: HTMLCanvasElement | null = null;

/** Peso normalizado (ausente ⇒ 400; diseños viejos abren en Regular). */
export function normalizarPesoTexto(peso: unknown): 400 | 700 {
  return peso === 700 ? 700 : 400;
}

/** Familia CSS desde un id del catálogo (desconocida ⇒ Roboto). */
export function familiaDeFuente(id: string): string {
  try {
    return resolverFuente(id).familia;
  } catch {
    return "Roboto";
  }
}

/**
 * Espera a que la familia y peso estén disponibles antes de medir/pintar
 * (SPEC 2.4 paso 4). Si falla, se mide y pinta con Roboto 400 sin error.
 */
export async function esperarFuente(
  fuenteId: string,
  peso?: 400 | 700,
): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  const familia = familiaDeFuente(fuenteId);
  const p = normalizarPesoTexto(peso);
  try {
    await document.fonts.load(`${p} 16px "${familia}"`);
  } catch {
    // Fallback silencioso a Roboto 400 (el canvas y el guardado no se rompen).
  }
}

/** Espera a un conjunto de familias/pesos (solo los usados, no las 10). */
export async function esperarFuentes(
  textos: { fuente: string; peso?: 400 | 700 }[],
): Promise<void> {
  const vistos = new Set<string>();
  const pendientes: Promise<void>[] = [];
  for (const t of textos) {
    const p = normalizarPesoTexto(t.peso);
    const clave = `${t.fuente}:${p}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    pendientes.push(esperarFuente(t.fuente, p));
  }
  await Promise.allSettled(pendientes);
}

/** Ancho en px con canvas 2D. Null en servidor (sin document). */
export function medirAnchoTexto(
  contenido: string,
  tamano: number,
  fuente: string,
  peso = "400",
  estilo = "normal",
): number | null {
  if (typeof document === "undefined" || contenido === "") return contenido === "" ? 0 : null;
  try {
    lienzoMedida ??= document.createElement("canvas");
    const ctx = lienzoMedida.getContext("2d");
    if (!ctx) return null;
    const familia = familiaDeFuente(fuente);
    const p = peso === "700" ? "700" : "400";
    ctx.font = `${estilo} ${p} ${tamano}px "${familia}", Roboto, sans-serif`;
    return ctx.measureText(contenido).width;
  } catch {
    return null;
  }
}

export type Medidor = (
  contenido: string,
  tamano: number,
  fuente: string,
) => number | null;

/**
 * Resuelve tamaño + contenido a renderizar. `medir` es inyectable para
 * pruebas (por defecto usa el canvas del navegador).
 */
export function resolverTexto(
  ajuste: AjusteTexto,
  ref: ReferenciaTexto | null,
  medir: Medidor = (c, t, f) =>
    medirAnchoTexto(
      c,
      t,
      f,
      String(normalizarPesoTexto(ajuste.peso)),
      ref?.estilo ?? "normal",
    ),
): TextoResuelto {
  // SPEC 2.1: la base la fija el usuario (manija/slider) hasta el 250 %
  // del default; el piso es el 60 % de esa base actual.
  const techo =
    (ref?.tamanoDefault ?? 0) > 0
      ? TECHO_ESCALA_TEXTO * (ref?.tamanoDefault ?? 0)
      : ajuste.tamano;
  const base = Math.min(techo, Math.max(1, ajuste.tamano));
  if (!ref || ref.tamanoDefault <= 0 || ref.anchoSlot <= 0) {
    return { tamanoEfectivo: base, mostrado: ajuste.contenido, truncado: false };
  }
  const piso = PISO_AUTO_SHRINK * base;
  const anchoBase = medir(ajuste.contenido, base, ajuste.fuente);
  if (anchoBase == null || anchoBase <= ref.anchoSlot) {
    return { tamanoEfectivo: base, mostrado: ajuste.contenido, truncado: false };
  }
  const querido = base * (ref.anchoSlot / anchoBase);
  if (querido >= piso) {
    return { tamanoEfectivo: querido, mostrado: ajuste.contenido, truncado: false };
  }
  // Al piso: trunca con elipsis hasta caber (binaria sobre el prefijo).
  const elipsis = "…";
  let lo = 0;
  let hi = ajuste.contenido.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidato = ajuste.contenido.slice(0, mid) + elipsis;
    const ancho = medir(candidato, piso, ajuste.fuente);
    if (ancho != null && ancho <= ref.anchoSlot) lo = mid;
    else hi = mid - 1;
  }
  return {
    tamanoEfectivo: piso,
    mostrado: ajuste.contenido.slice(0, lo) + elipsis,
    truncado: true,
  };
}
