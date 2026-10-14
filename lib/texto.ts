// lib/texto.ts — Auto-shrink de textos del editor (SPEC 02 Paso 6).
//
// Rango [60 %, 100 %] del tamaño default (límites REVISABLES). El usuario
// elige la base sin pasar el 100 %; si el contenido desborda el slot, se
// encoge hasta el piso y ahí trunca con elipsis, y el panel lo indica.
// El slot es el ancho del contenido default al 100 % (lo mide el shell en
// el SVG vivo): el texto default siempre cabe exacto y uno más largo encoge.

/** Lista fija Google OFL inicial (SPEC 02). Se amplía en otro spec. */
export const FUENTES_EDITOR = ["Roboto"] as const;

/** Piso del auto-shrink (fracción del default). REVISABLE. */
export const PISO_AUTO_SHRINK = 0.6;

export type AjusteTexto = {
  contenido: string;
  tamano: number;
  color: string;
  fuente: string;
};

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
    ctx.font = `${estilo} ${peso} ${tamano}px ${fuente}, sans-serif`;
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
    medirAnchoTexto(c, t, f, ref?.peso ?? "400", ref?.estilo ?? "normal"),
): TextoResuelto {
  const base = Math.min(ref?.tamanoDefault ?? ajuste.tamano, Math.max(1, ajuste.tamano));
  if (!ref || ref.tamanoDefault <= 0 || ref.anchoSlot <= 0) {
    return { tamanoEfectivo: base, mostrado: ajuste.contenido, truncado: false };
  }
  const piso = PISO_AUTO_SHRINK * ref.tamanoDefault;
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
