// lib/encuadre.ts — Matemática del auto-encuadre cover (SPEC 02 Paso 5).
//
// El ajuste canónico vive en unidades SVG respecto al encuadre centrado:
// `{ x, y, escala }` con `escala = 1` = cover exacto. La imagen nunca sale
// de su zona por dos vías: el `<clipPath>` del canvas (recorte duro) y este
// clamp (la zona siempre queda cubierta, sin huecos).

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;

export type Caja = { w: number; h: number };
export type TamNatural = { w: number; h: number };
export type AjusteImagen = { x: number; y: number; escala: number };

export const AJUSTE_CENTRADO: AjusteImagen = { x: 0, y: 0, escala: 1 };

/** Factor cover: la imagen llena la caja recortando el sobrante. */
export function escalaCover(nat: TamNatural, caja: Caja): number {
  if (nat.w <= 0 || nat.h <= 0 || caja.w <= 0 || caja.h <= 0) return 1;
  return Math.max(caja.w / nat.w, caja.h / nat.h);
}

/** Tamaño mostrado en unidades SVG para un ajuste dado. */
export function tamanoMostrado(
  nat: TamNatural,
  caja: Caja,
  escala: number,
): { w: number; h: number } {
  const s = escalaCover(nat, caja) * escala;
  return { w: nat.w * s, h: nat.h * s };
}

/** Desplazamiento máximo sin dejar huecos (mitad del sobrante por eje). */
export function panMaximo(
  nat: TamNatural,
  caja: Caja,
  escala: number,
): { mx: number; my: number } {
  const m = tamanoMostrado(nat, caja, escala);
  return {
    mx: Math.max(0, (m.w - caja.w) / 2),
    my: Math.max(0, (m.h - caja.h) / 2),
  };
}

/**
 * Clamp total: escala en [1, 4] y pan dentro de la cobertura. Con esto la
 * zona siempre queda cubierta y —junto al clip del canvas— la imagen nunca
 * se sale de `zona-editable-N`.
 */
export function limitarAjuste(
  ajuste: AjusteImagen,
  nat: TamNatural | null,
  caja: Caja | null,
): AjusteImagen {
  const escala = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, ajuste.escala || 1));
  if (!nat || !caja) return { x: 0, y: 0, escala };
  const { mx, my } = panMaximo(nat, caja, escala);
  return {
    x: Math.min(mx, Math.max(-mx, ajuste.x || 0)),
    y: Math.min(my, Math.max(-my, ajuste.y || 0)),
    escala,
  };
}

/** Posición de la esquina superior en unidades SVG (centrado + pan). */
export function origenMostrado(
  nat: TamNatural,
  caja: Caja,
  ajuste: AjusteImagen,
): { x: number; y: number; w: number; h: number } {
  const limpio = limitarAjuste(ajuste, nat, caja);
  const m = tamanoMostrado(nat, caja, limpio.escala);
  return {
    x: (caja.w - m.w) / 2 + limpio.x,
    y: (caja.h - m.h) / 2 + limpio.y,
    w: m.w,
    h: m.h,
  };
}
