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

// SPEC 2.5 — Normalización en ingesta (seed, Node sin DOM, regex/string).
//
// Convierte capas amables del diseñador (`fotos-editables`, `textos`) al
// contrato por elemento (`zona-editable-N`, `texto-editable-<slug>`).
// Sin capas amables con formas: no-op (el piloto FIG-001 queda intacto).

export type ConfigPaginaDisenador = {
  /** Ruta local del SVG de diseñador (solo para reportes). */
  archivo: string;
  /** Destino en R2 (solo para reportes). */
  keyR2: string;
  /** Se inyecta si el SVG no trae width en mm válido. */
  anchoMm: number;
  /** Se inyecta si el SVG no trae height en mm válido. */
  altoMm: number;
  /** Id exacto del <g> (p. ej. "fotos-editables", sin espacios). */
  capaFotos: string;
  /** Id exacto del <g> (p. ej. "textos"). */
  capaTextos: string;
};

export type ResultadoNormalizacion = {
  svg: string;
  zonas: string[];
  textos: string[];
  avisos: string[];
};

/** Error de normalización con código estable para el reporte del seed. */
export class NormalizacionError extends Error {
  code: "zona-duplicada" | "contrato-mixto" | "sin-capas-editables";
  constructor(
    code: "zona-duplicada" | "contrato-mixto" | "sin-capas-editables",
    detalle: string,
  ) {
    super(`${code}: ${detalle}`);
    this.name = "NormalizacionError";
    this.code = code;
  }
}

/** Slug desde el contenido: minúsculas, sin acentos, no-alfanum → guion. */
export function slugificarTexto(contenido: string): string {
  const sinAcentos = contenido
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const base = sinAcentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!base) return "texto";
  if (base.length <= 30) return base;
  const corte = base.slice(0, 30);
  const ultimoGuion = corte.lastIndexOf("-");
  // Recorte en límite de guion; sin guion, corte duro a 30.
  return ultimoGuion > 0 ? corte.slice(0, ultimoGuion) : corte;
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Extrae una capa <g id="..."> con balance de <g>/</g> (tolera anidados). */
function extraerCapa(
  svg: string,
  idCapa: string,
): { apertura: string; inner: string; completo: string } | null {
  const abierta = new RegExp(
    `<g\\b[^>]*\\bid\\s*=\\s*["']${escaparRegex(idCapa)}["'][^>]*>`,
    "i",
  );
  const m = abierta.exec(svg);
  if (!m || m.index == null) return null;
  const inicioInner = m.index + m[0].length;
  const reTag = /<g\b[^>]*>|<\/g\s*>/gi;
  reTag.lastIndex = inicioInner;
  let profundidad = 1;
  let t: RegExpExecArray | null;
  while ((t = reTag.exec(svg))) {
    if (t[0].startsWith("</")) profundidad -= 1;
    else profundidad += 1;
    if (profundidad === 0) {
      const fin = t.index + t[0].length;
      return {
        apertura: m[0],
        inner: svg.slice(inicioInner, t.index),
        completo: svg.slice(m.index, fin),
      };
    }
  }
  return null;
}

/** Ids de <g> presentes (para diagnosticar `sin-capas-editables`). */
function idsDeGrupos(svg: string): string[] {
  const ids: string[] = [];
  const re = /<g\b[^>]*\bid\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) ids.push(m[1]);
  return ids;
}

/** Formas hijas en orden de documento (solo nivel superior de la capa). */
function formasDeCapa(inner: string): string[] {
  // Nivel superior: se ignoran las formas dentro de <g> anidados.
  const sinAnidados = inner.replace(/<g\b[^>]*>[\s\S]*?<\/g\s*>/gi, "");
  const re =
    /<(rect|circle|ellipse|polygon|path)\b[^>]*?(?:\/>|>[\s\S]*?<\/\s*(?:rect|circle|ellipse|polygon|path)\s*>)/gi;
  const formas: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(sinAnidados))) formas.push(m[0]);
  return formas;
}

/** Textos hijos en orden de documento (solo nivel superior de la capa). */
function textosDeCapa(inner: string): string[] {
  const sinAnidados = inner.replace(/<g\b[^>]*>[\s\S]*?<\/g\s*>/gi, "");
  const re = /<text\b[^>]*>[\s\S]*?<\/text\s*>/gi;
  const textos: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(sinAnidados))) textos.push(m[0]);
  return textos;
}

function textoPlano(textTag: string): string {
  return textTag
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function atributo(tag: string, nombre: string): string {
  const m = tag.match(
    new RegExp(`\\b${escaparRegex(nombre)}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, "i"),
  );
  return (m?.[1] ?? "").replace(/^["']|["']$/g, "");
}

/** Huella geométrica para duplicados (x,y,w,h + transform idénticos). */
function huellaForma(tag: string): string {
  const nombre = tag.match(/^<\s*([a-z]+)/i)?.[1]?.toLowerCase() ?? "forma";
  if (nombre === "rect") {
    const x = atributo(tag, "x") || "0";
    const y = atributo(tag, "y") || "0";
    const w = atributo(tag, "width") || "";
    const h = atributo(tag, "height") || "";
    const tr = atributo(tag, "transform").replace(/\s+/g, " ").trim();
    return `rect|x=${x}|y=${y}|w=${w}|h=${h}|tr=${tr}`;
  }
  return `${nombre}|${tag.replace(/\s+/g, " ").trim()}`;
}

/**
 * Normaliza un SVG de diseñador al contrato del editor.
 * Lanza `NormalizacionError` con código `zona-duplicada` |
 * `contrato-mixto` | `sin-capas-editables` (el seed lo reporta por página).
 */
export function normalizarSvgDisenador(
  svg: string,
  config: ConfigPaginaDisenador,
): ResultadoNormalizacion {
  const avisos: string[] = [];
  const capaFotos = extraerCapa(svg, config.capaFotos);
  const capaTextos = extraerCapa(svg, config.capaTextos);
  const formas = capaFotos ? formasDeCapa(capaFotos.inner) : [];
  const textosCrudos = capaTextos ? textosDeCapa(capaTextos.inner) : [];

  const explicitasZonas = zonasDelSvg(svg);
  const explicitosTextos = textosDelSvg(svg);
  const hayExplicito = explicitasZonas.length > 0 || explicitosTextos.length > 0;
  const hayAmable = formas.length > 0 || textosCrudos.length > 0;
  if (hayExplicito && hayAmable) {
    throw new NormalizacionError(
      "contrato-mixto",
      `zonas explícitas (${explicitasZonas.join(",") || "—"}) + capas amables a la vez en ${config.archivo}: el dueño elige un sistema`,
    );
  }

  // Sin capas amables con formas: no-op (piloto FIG-001 intacto).
  // Sin contrato explícito ni capas amables: error diagnosticable.
  if (!capaFotos && !capaTextos) {
    if (hayExplicito) {
      return { svg, zonas: explicitasZonas, textos: explicitosTextos, avisos };
    }
    const encontrados = idsDeGrupos(svg);
    throw new NormalizacionError(
      "sin-capas-editables",
      `sin capas "${config.capaFotos}" ni "${config.capaTextos}" en ${config.archivo}; <g> encontrados: ${encontrados.join(", ") || "—"}`,
    );
  }
  if (!hayAmable) {
    const encontrados = idsDeGrupos(svg);
    throw new NormalizacionError(
      "sin-capas-editables",
      `sin formas en "${config.capaFotos}" ni textos en "${config.capaTextos}" en ${config.archivo}; <g> encontrados: ${encontrados.join(", ") || "—"}`,
    );
  }

  // Duplicados geométricos frenan la página (no crean zonas encimadas).
  const vistas = new Map<string, string>();
  for (const forma of formas) {
    const huella = huellaForma(forma);
    if (vistas.has(huella)) {
      const x = atributo(forma, "x");
      const y = atributo(forma, "y");
      throw new NormalizacionError(
        "zona-duplicada",
        `forma duplicada en ${x || "?"},${y || "?"} (${huella}) en ${config.archivo}`,
      );
    }
    vistas.set(huella, forma);
  }

  // Slugs desde el contenido, con sufijo ante colisión.
  const usos = new Map<string, number>();
  const gruposTexto = textosCrudos.map((tag) => {
    const plano = textoPlano(tag);
    let slug = slugificarTexto(plano);
    const veces = usos.get(slug) ?? 0;
    usos.set(slug, veces + 1);
    if (veces > 0) slug = `${slug}-${veces + 1}`;
    return `<g id="${TEXTO_PREFIJO}${slug}">${tag}</g>`;
  });
  const slugs = gruposTexto.map((g) => {
    const m = g.match(/id\s*=\s*"([^"]+)"/);
    return m?.[1] ?? "";
  });

  const gruposZona = formas.map(
    (forma, i) => `<g id="${ZONA_PREFIJO}${i + 1}">${forma}</g>`,
  );
  const zonas = gruposZona.map((_, i) => `${ZONA_PREFIJO}${i + 1}`);

  let out = svg;
  if (capaFotos) out = out.replace(capaFotos.completo, gruposZona.join(""));
  if (capaTextos) out = out.replace(capaTextos.completo, gruposTexto.join(""));

  // Limpieza con aviso: <image> con data: incrustados (fotos de referencia).
  let bytesBase64 = 0;
  const reImageData =
    /<image\b[^>]*?(?:href|xlink:href)\s*=\s*("[^"]*"|'[^']*')[^>]*?(?:\/>|>[\s\S]*?<\/image\s*>)/gi;
  out = out.replace(reImageData, (tag, uriConComillas: string) => {
    const uri = uriConComillas.replace(/^["']|["']$/g, "");
    if (!/^data:/i.test(uri)) return tag;
    bytesBase64 += uri.length;
    return "";
  });
  if (bytesBase64 > 0) {
    avisos.push(`base64-eliminado:${bytesBase64}bytes`);
  }

  // Medidas: se respetan si son válidas; si no, se inyectan las de config.
  const medidas = medidasMm(out);
  if (medidas) {
    avisos.push(`medidas-respetadas:${medidas.anchoMm}x${medidas.altoMm}mm`);
  } else {
    out = out.replace(/<svg\b([^>]*)>/i, (tag, attrs: string) => {
      let next = tag;
      if (!/\bwidth\s*=/i.test(attrs)) {
        next = next.replace(/<svg\b/i, `<svg width="${config.anchoMm}mm"`);
      }
      if (!/\bheight\s*=/i.test(attrs)) {
        next = next.replace(/<svg\b/i, `<svg height="${config.altoMm}mm"`);
      }
      return next;
    });
    avisos.push(`medidas-inyectadas:${config.anchoMm}x${config.altoMm}mm`);
  }

  return { svg: out, zonas, textos: slugs, avisos };
}
