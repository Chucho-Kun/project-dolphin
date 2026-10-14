// lib/svg.ts — Utilidades del contrato SVG del editor (SPEC 02).
//
// - Sanitización obligatoria en ingesta (seed, fixture, cargas):
//   sin `<script>`, sin manejadores `on*`, parse sin ejecución.
// - Medidas físicas en mm obligatorias (`width`/`height` en mm).
// - Zonas `zona-editable-N` y textos `texto-editable-<clave>`.

export const ZONA_PREFIJO = "zona-editable-";
export const TEXTO_PREFIJO = "texto-editable-";

/** Elimina scripts, manejadores on* y javascript: URLs. Parse sin ejecución. */
export function sanitizeSvg(svg: string): string {
  let out = svg;
  // Comentarios con scripts potenciales fuera: se conservan, solo se limpia código activo.
  // 1. <script ...>...</script> (cualquier caja/atributos)
  out = out.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script\s*>/gi, "");
  // 2. Atributos manejadores on* (onclick, onload, onerror, ...), con o sin comillas
  out = out.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // 3. URLs javascript: / data:text/html en href/xlink:href
  out = out.replace(
    /\s(?:href|xlink:href)\s*=\s*("[^"]*"|'[^']*')/gi,
    (m) => {
      if (/javascript\s*:|data\s*:\s*text\/html/i.test(m)) return "";
      return m;
    },
  );
  // 4. <foreignObject> puede incrustar HTML activo: se elimina
  out = out.replace(
    /<foreignObject\b[^<]*(?:(?!<\/foreignObject>)<[^<]*)*<\/foreignObject\s*>/gi,
    "",
  );
  // 5. <iframe>, <object>, <embed>, <form> no forman parte del contrato
  out = out.replace(
    /<(iframe|object|embed|form)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1\s*>/gi,
    "",
  );
  out = out.replace(/<(iframe|object|embed)\b[^>]*\/?>/gi, "");
  return out;
}

function parseMm(value: string | null): number | null {
  if (!value) return null;
  const m = value.trim().match(/^([\d.]+)\s*mm$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Extrae width/height del tag <svg>. Solo acepta mm (contrato estricto). */
export function medidasMm(svg: string): { anchoMm: number; altoMm: number } | null {
  const tag = svg.match(/<svg\b[^>]*>/i)?.[0] ?? "";
  const w = tag.match(/\bwidth\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i)?.[1]?.replace(/^["']|["']$/g, "") ?? null;
  const h = tag.match(/\bheight\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i)?.[1]?.replace(/^["']|["']$/g, "") ?? null;
  const anchoMm = parseMm(w);
  const altoMm = parseMm(h);
  if (anchoMm == null || altoMm == null) return null;
  return { anchoMm, altoMm };
}

/** IDs de zonas `zona-editable-N` presentes en el SVG. */
export function zonasDelSvg(svg: string): string[] {
  const ids = new Set<string>();
  const re = /id\s*=\s*"(zona-editable-\d+)"|id\s*=\s*'(zona-editable-\d+)'/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) ids.add(m[1] ?? m[2]);
  return [...ids].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
}

/** Claves de textos `texto-editable-<clave>` presentes en el SVG. */
export function textosDelSvg(svg: string): string[] {
  const ids = new Set<string>();
  const re = /id\s*=\s*"(texto-editable-([A-Za-z0-9_-]+))"|id\s*=\s*'(texto-editable-([A-Za-z0-9_-]+))'/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) ids.add(m[1] ?? m[3]);
  return [...ids].sort();
}

/** Valida el contrato mínimo del SVG para edición. */
export function validarContratoSvg(svg: string): {
  ok: boolean;
  medidas: { anchoMm: number; altoMm: number } | null;
  zonas: string[];
  textos: string[];
  errores: string[];
} {
  const limpio = sanitizeSvg(svg);
  const medidas = medidasMm(limpio);
  const zonas = zonasDelSvg(limpio);
  const textos = textosDelSvg(limpio);
  const errores: string[] = [];
  if (!medidas) errores.push("sin-medidas-mm");
  if (zonas.length === 0) errores.push("sin-zonas");
  return { ok: errores.length === 0, medidas, zonas, textos, errores };
}
