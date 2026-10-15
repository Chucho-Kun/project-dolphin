// lib/fuentes.ts — Catálogo cerrado de fuentes del editor (SPEC 2.4 Paso 1).
//
// Única fuente de verdad del catálogo: ids kebab estables (lo que se persiste),
// familia CSS, categoría. Sin tabla DB, sin JSON público.
// Los archivos WOFF2 los emite `next/font/google` desde la página del editor
// (Paso 2); este módulo es importable desde cliente y servidor, así que no
// llama a `next/font` directamente.

export type CategoriaFuente = "sans" | "serif" | "manuscrita";

export type EntradaFuente = {
  /** Kebab estable, p. ej. "open-sans" — es lo que se persiste. */
  id: string;
  /** Nombre CSS, p. ej. "Open Sans". */
  familia: string;
  categoria: CategoriaFuente;
};

export const FUENTES_EDITOR: EntradaFuente[] = [
  { id: "roboto", familia: "Roboto", categoria: "sans" },
  { id: "open-sans", familia: "Open Sans", categoria: "sans" },
  { id: "lato", familia: "Lato", categoria: "sans" },
  { id: "montserrat", familia: "Montserrat", categoria: "sans" },
  { id: "roboto-condensed", familia: "Roboto Condensed", categoria: "sans" },
  { id: "oswald", familia: "Oswald", categoria: "sans" },
  { id: "poppins", familia: "Poppins", categoria: "sans" },
  { id: "inter", familia: "Inter", categoria: "sans" },
  { id: "playfair-display", familia: "Playfair Display", categoria: "serif" },
  { id: "dancing-script", familia: "Dancing Script", categoria: "manuscrita" },
];

export const FUENTE_DEFAULT = "roboto";

export const PESO_DEFAULT = 400 as const;

export type PesoFuente = 400 | 700;

/** Alias legado: los ?t= viejos traen "Roboto" (familia con mayúscula). */
export function normalizarFuente(id: string): string {
  if (id === "Roboto") return "roboto";
  return id;
}

export function esFuenteValida(id: string): boolean {
  const normalizado = normalizarFuente(id);
  return FUENTES_EDITOR.some((f) => f.id === normalizado);
}

/** Desconocida o ausente ⇒ Roboto (sin error ni migración). */
export function resolverFuente(id: string): EntradaFuente {
  const normalizado = normalizarFuente(id);
  return (
    FUENTES_EDITOR.find((f) => f.id === normalizado) ?? FUENTES_EDITOR[0]
  );
}
