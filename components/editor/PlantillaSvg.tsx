"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  esperarFuentes,
  familiaDeFuente,
  normalizarPesoTexto,
} from "@/lib/texto";

// components/editor/PlantillaSvg.tsx — Canvas del editor (SPEC 02 Paso 4).
//
// Renderiza el SVG base inline sanitizado 1:1 sin reescalado (las guías del
// dueño se ven tal cual). Por contrato `zona-editable-N`: oculta los rects
// marcadores (solo geometría, no se ven ni se imprimen), crea un <clipPath>
// por zona y dibuja su propio contorno de selección (data-ui, excluido del
// PDF). Cada zona muestra su imagen recortada a su geometría; cada
// `texto-editable-<clave>` muestra su contenido/tamaño/color/fuente.
// Los paneles (Pasos 5-6) y el shell (Paso 7) gobiernan este canvas por props.

export type ImagenEnZona = {
  zonaId: string;
  /** URL lista para <image>: blob/objectURL local o CDN pública. */
  src: string;
  /** Desplazamiento en unidades SVG respecto al auto-encuadre. */
  x?: number;
  y?: number;
  /** 1 = auto-encuadre; >1 acerca, <1 aleja (sin salir de la zona). */
  escala?: number;
};

export type TextoEnPlantilla = {
  id: string;
  contenido: string;
  tamano?: number;
  color?: string;
  fuente?: string;
  /** SPEC 2.4 paso 4: peso por texto (ausente ⇒ 400). */
  peso?: 400 | 700;
  /** SPEC 2.1 paso 3: desplazamiento en unidades SVG (ya recortado). */
  x?: number;
  y?: number;
  /** SPEC 2.1 paso 4: tamaño base (el que escala la manija). */
  tamanoBase?: number;
  /** SPEC 2.1 paso 4: rango de la manija (lo fija el shell). */
  minTamano?: number;
  maxTamano?: number;
};

type Props = {
  /** SVG base ya sanitizado en el servidor. */
  svgText: string;
  imagenes?: ImagenEnZona[];
  textos?: TextoEnPlantilla[];
  zonaSeleccionada?: string | null;
  onSeleccionarZona?: (zonaId: string) => void;
  /** El shell lo usa para el PDF (rasteriza este <svg>). */
  svgRef?: RefObject<SVGSVGElement | null>;
  /** Defectos medidos en el SVG vivo (una vez, antes de aplicar ajustes). */
  onDefectos?: (d: DefectosPlantilla) => void;
  /** Arrastre sobre el canvas (deltas en unidades SVG, ya con escala). */
  onArrastrarZona?: (zonaId: string, dxSvg: number, dySvg: number) => void;
  /** SPEC 2.1 paso 3: texto seleccionado (contorno + gestos). */
  textoSeleccionado?: string | null;
  onSeleccionarTexto?: (id: string | null) => void;
  /** SPEC 2.2 paso 3: fondo deselecciona zona y texto (antes solo texto). */
  onDeseleccionar?: () => void;
  /** Arrastre de texto (deltas ya recortados a la caja del grupo). */
  onArrastrarTexto?: (id: string, dxSvg: number, dySvg: number) => void;
  /** SPEC 2.1 paso 4: manija de escala (tamaño base absoluto). */
  onEscalarTexto?: (id: string, tamanoBase: number) => void;
  /** SPEC 2.3 paso 2-3: archivo externo soltado sobre una zona. */
  onArchivoExterno?: (zonaId: string, file: File) => void;
};

export type CajaZona = { x: number; y: number; w: number; h: number };

/** Gesto en curso. Vive en un ref: sobrevive a los re-renders que el propio
    gesto provoca (seleccionar re-renderiza y recrearía el closure). */
type TipoArrastre =
  | { clase: "zona"; zonaId: string; ultimoX: number; ultimoY: number; movido: boolean }
  | { clase: "texto"; textoId: string; ultimoX: number; ultimoY: number; movido: boolean; x0: number; y0: number; ox0: number; oy0: number; enviadoX: number; enviadoY: number }
  | { clase: "escala"; textoId: string; ultimoX: number; ultimoY: number; movido: boolean; fijoX: number; fijoY: number; dist0: number; base0: number; min: number; max: number }
  // SPEC 2.2 paso 3: toque sobre texto dentro de zona (toque = texto, arrastre = foto).
  | { clase: "mixto"; zonaId: string; textoId: string; ultimoX: number; ultimoY: number; movido: boolean }
  | { clase: "fondo"; movido: boolean };

export type DefectosPlantilla = {
  cajas: Record<string, CajaZona>;
  textos: Record<
    string,
    {
      contenido: string;
      tamano: number;
      ancho: number;
      peso: string;
      estilo: string;
      color: string;
    }
  >;
};

const ZONA_RE = /^zona-editable-([1-9]\d*)$/;

/** Contorno de lo seleccionado (zonas y textos): rojo para indicarlo. */
const COLOR_SELECCION = "#dc2626";

function numero(attr: string | null): number {
  const n = Number(attr);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Caja de una zona en espacio del svg raíz (transform-aware, técnica de
 * `cajaRectEnSvg`). Null sin geometría medible. Es el bbox rectangular:
 * sirve para defectos, overlay y contorno de selección (UI solamente).
 * La foto se recorta con la forma real (clip clonado, SPEC 2.5 paso 2).
 */
function medirCajaZona(svg: SVGSVGElement, g: SVGGElement): CajaZona | null {
  const forma = Array.from(g.children).find((h) =>
    /^(rect|path|circle|ellipse|polygon)$/i.test(h.tagName),
  ) as SVGElement | undefined;
  if (!forma) return null;
  try {
    let bx = 0;
    let by = 0;
    let bw = 0;
    let bh = 0;
    if (forma.tagName.toLowerCase() === "rect") {
      bw = numero(forma.getAttribute("width"));
      bh = numero(forma.getAttribute("height"));
      if (!(bw > 0 && bh > 0)) return null;
      bx = numero(forma.getAttribute("x"));
      by = numero(forma.getAttribute("y"));
    } else {
      const b = (forma as SVGGraphicsElement).getBBox();
      if (!(b.width > 0 && b.height > 0)) return null;
      bx = b.x;
      by = b.y;
      bw = b.width;
      bh = b.height;
    }
    let pts = [
      { x: bx, y: by },
      { x: bx + bw, y: by },
      { x: bx, y: by + bh },
      { x: bx + bw, y: by + bh },
    ];
    let n: Element | null = forma;
    while (n && n !== svg) {
      const mm = (n as SVGGraphicsElement).transform?.baseVal.consolidate()
        ?.matrix;
      if (mm) {
        pts = pts.map((p) => {
          const q = new DOMPoint(p.x, p.y).matrixTransform(mm);
          return { x: q.x, y: q.y };
        });
      }
      n = n.parentElement;
    }
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return {
      x: minX,
      y: minY,
      w: Math.max(...xs) - minX,
      h: Math.max(...ys) - minY,
    };
  } catch {
    return null;
  }
}

/** Primer hijo de forma de una zona (el marcador original, para el clip). */
function formaDeZona(g: SVGGElement): SVGElement | undefined {
  return Array.from(g.children).find((h) =>
    /^(rect|path|circle|ellipse|polygon)$/i.test((h as Element).tagName),
  ) as SVGElement | undefined;
}

/**
 * Caja de tinta del texto en espacio del svg raíz (lo que se ve, con el
 * translate ya aplicado). Null si no hay texto medible. Sirve para apoyar
 * la manija en la esquina del texto (no en la de la cara contenedora).
 */
function cajaTintaTexto(
  svg: SVGSVGElement,
  textoId: string,
): CajaZona | null {
  try {
    const g = svg.querySelector(`#${CSS.escape(textoId)}`);
    const nodoTexto = g?.querySelector("text");
    if (!nodoTexto) return null;
    const rT = nodoTexto.getBoundingClientRect();
    if (!(rT.width > 0 && rT.height > 0)) return null;
    const rS = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    if (!(rS.width > 0 && rS.height > 0 && vb?.width > 0 && vb?.height > 0)) {
      return null;
    }
    const kx = vb.width / rS.width;
    const ky = vb.height / rS.height;
    return {
      x: (rT.left - rS.left) * kx,
      y: (rT.top - rS.top) * ky,
      w: rT.width * kx,
      h: rT.height * ky,
    };
  } catch {
    return null;
  }
}
/** Caja de un <rect> en espacio del svg raíz (ver arriba). */
function cajaRectEnSvg(
  svg: SVGSVGElement,
  rect: SVGRectElement,
): CajaZona | null {
  try {
    const w = numero(rect.getAttribute("width"));
    const h = numero(rect.getAttribute("height"));
    if (!(w > 0 && h > 0)) return null;
    const x = numero(rect.getAttribute("x"));
    const y = numero(rect.getAttribute("y"));
    let pts = [
      { x, y },
      { x: x + w, y },
      { x, y: y + h },
      { x: x + w, y: y + h },
    ];
    let n: Element | null = rect;
    while (n && n !== svg) {
      const mm = (n as SVGGraphicsElement).transform?.baseVal.consolidate()
        ?.matrix;
      if (mm) {
        pts = pts.map((p) => {
          const q = new DOMPoint(p.x, p.y).matrixTransform(mm);
          return { x: q.x, y: q.y };
        });
      }
      n = n.parentElement;
    }
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return {
      x: minX,
      y: minY,
      w: Math.max(...xs) - minX,
      h: Math.max(...ys) - minY,
    };
  } catch {
    return null;
  }
}

/**
 * Rectángulo más chico que contiene el punto (ax,ay): vale un marcador de
 * zona, una guía o un fondo (SPEC 2.1: el texto vive en el cuadro que tiene
 * atrás). Se ignoran los más chicos que la propia tinta (no contendrían
 * nada útil) y sin ninguno se conserva la caja propia del texto.
 */
function cajaContenedora(
  fondos: CajaZona[],
  ax: number,
  ay: number,
  areaMinima: number,
): CajaZona | null {
  let mejor: CajaZona | null = null;
  for (const c of fondos) {
    if (c.w * c.h < areaMinima) continue;
    if (ax >= c.x && ax <= c.x + c.w && ay >= c.y && ay <= c.y + c.h) {
      if (!mejor || c.w * c.h < mejor.w * mejor.h) mejor = c;
    }
  }
  return mejor;
}
/** Primer número de un atributo (los x/y de <text> pueden ser listas). */
function primerNumero(attr: string | null): number {
  const primero = (attr ?? "").trim().split(/[\s,]+/)[0] ?? "";
  const n = Number(primero);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Mide caja + ancla de un grupo de texto en espacio padre (getBBox excluye
 * el propio transform del grupo: se aplica la matriz del autor; el ancla
 * además la del propio <text>). Es el mismo espacio de nuestro translate,
 * del clip y de la manija.
 * Null si no hay contenido medible. `basePrevia` conserva el transform del
 * autor ya capturado (el DOM puede traer el nuestro de un render anterior).
 */
function medirCajaTexto(
  g: SVGGElement,
  nodoTexto: Element,
  basePrevia: string | null,
): { caja: CajaZona; ax: number; ay: number; base: string } | null {
  try {
    const b = (g as SVGGraphicsElement).getBBox();
    // La caja del grupo ya incluye los transforms de los hijos; solo falta
    // el propio del grupo. El ancla (x/y del <text>) necesita además el
    // transform propio del <text> (el dueño posiciona con él).
    const m = g.transform.baseVal.consolidate()?.matrix ?? null;
    const mt =
      (nodoTexto as SVGGraphicsElement).transform?.baseVal.consolidate()
        ?.matrix ?? null;
    const llevar = (x: number, y: number) =>
      m ? new DOMPoint(x, y).matrixTransform(m) : { x, y };
    const esquinas = [
      llevar(b.x, b.y),
      llevar(b.x + b.width, b.y),
      llevar(b.x, b.y + b.height),
      llevar(b.x + b.width, b.y + b.height),
    ];
    const xs = esquinas.map((p) => p.x);
    const ys = esquinas.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const mAncla = m ? (mt ? m.multiply(mt) : m) : mt;
    const aLocal = {
      x: primerNumero(nodoTexto.getAttribute("x")),
      y: primerNumero(nodoTexto.getAttribute("y")),
    };
    const a = mAncla
      ? new DOMPoint(aLocal.x, aLocal.y).matrixTransform(mAncla)
      : aLocal;
    return {
      caja: {
        x: minX,
        y: minY,
        w: Math.max(...xs) - minX,
        h: Math.max(...ys) - minY,
      },
      ax: a.x,
      ay: a.y,
      base: basePrevia ?? g.getAttribute("transform") ?? "",
    };
  } catch {
    return null;
  }
}

export default function PlantillaSvg({
  svgText,
  imagenes = [],
  textos = [],
  zonaSeleccionada = null,
  onSeleccionarZona,
  svgRef,
  onDefectos,
  onArrastrarZona,
  textoSeleccionado = null,
  onSeleccionarTexto,
  onDeseleccionar,
  onArrastrarTexto,
  onEscalarTexto,
  onArchivoExterno,
}: Props) {
  const envolturaRef = useRef<HTMLDivElement>(null);
  // SPEC 2.3 paso 4: caché por src (tras quitar y cargar otra foto distinta
  // el encuadre parte centrado; sin el src reutilizaría el tamaño anterior).
  const [naturales, setNaturales] = useState<
    Record<string, { w: number; h: number; src: string }>
  >({});
  const defectosEnviados = useRef(false);
  const defectosCb = useRef(onDefectos);
  const arrastrarCb = useRef(onArrastrarZona);
  const seleccionarCb = useRef(onSeleccionarZona);
  const seleccionarTextoCb = useRef(onSeleccionarTexto);
  const deseleccionarCb = useRef(onDeseleccionar);
  const arrastrarTextoCb = useRef(onArrastrarTexto);
  const escalarTextoCb = useRef(onEscalarTexto);
  const archivoExternoCb = useRef(onArchivoExterno);
  // SPEC 2.3 paso 2-3: zonas con caja medible (sin caja no hay overlay
  // ni drop fiable; el botón Cargar sigue disponible).
  const cajasValidas = useRef(new Set<string>());
  useEffect(() => {
    defectosCb.current = onDefectos;
    arrastrarCb.current = onArrastrarZona;
    seleccionarCb.current = onSeleccionarZona;
    seleccionarTextoCb.current = onSeleccionarTexto;
    deseleccionarCb.current = onDeseleccionar;
    arrastrarTextoCb.current = onArrastrarTexto;
    escalarTextoCb.current = onEscalarTexto;
    archivoExternoCb.current = onArchivoExterno;
  });
  // SPEC 2.1 paso 3: caja fija del grupo + ancla + transform del autor
  // (referencia del arrastre; se mide una vez, antes de aplicar ajustes).
  // Caja y ancla en espacio padre (con el transform del autor aplicado):
  // es el mismo espacio de nuestro translate, del clip y de la manija.
  const metaTexto = useRef(
    new Map<string, { caja: CajaZona; ax: number; ay: number; base: string }>(),
  );
  const arrastreRef = useRef<TipoArrastre>(null);
  // Últimos defectos enviados (para reenviar fusionados en la remedición).
  const defectosAcum = useRef<DefectosPlantilla | null>(null);

  // SPEC 2.4 paso 4: espera a la familia y peso reales antes de medir/pintar.
  // Al cargar, repinta con la métrica real (el auto-shrink no desborda).
  const [fuentesTick, setFuentesTick] = useState(0);
  const firmaFuentes = (textos ?? [])
    .map((t) => `${t.id}:${t.fuente ?? "roboto"}:${t.peso ?? 400}`)
    .join("|");
  useEffect(() => {
    let vivo = true;
    esperarFuentes(
      (textos ?? []).map((t) => ({ fuente: t.fuente ?? "roboto", peso: t.peso })),
    ).then(() => {
      if (vivo) setFuentesTick((c) => c + 1);
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaFuentes]);

  // Tamaños naturales de las imágenes (para el encuadre cover).
  useEffect(() => {
    let vivo = true;
    for (const img of imagenes) {
      const cached = naturales[img.zonaId];
      if (!img.src || (cached && cached.src === img.src)) continue;
      const srcActual = img.src;
      const sonda = new Image();
      sonda.onload = () => {
        if (!vivo) return;
        const w = sonda.naturalWidth || 1;
        const h = sonda.naturalHeight || 1;
        setNaturales((prev) =>
          prev[img.zonaId]?.src === srcActual
            ? prev
            : { ...prev, [img.zonaId]: { w, h, src: srcActual } },
        );
      };
      sonda.onerror = () => {};
      sonda.src = img.src;
    }
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagenes.map((i) => `${i.zonaId}:${i.src}`).join("|")]);

  // Post-proceso del DOM del SVG: marcadores, clipPaths, fotos, textos, selección.
  useEffect(() => {
    const envoltura = envolturaRef.current;
    if (!envoltura) return;
    const svg = envoltura.querySelector("svg");
    if (!(svg instanceof SVGSVGElement)) return;
    if (svgRef) svgRef.current = svg;
    // Render 1:1 responsive: el viewBox manda, sin reescalado del diseño.
    svg.style.width = "100%";
    svg.style.height = "auto";
    svg.style.display = "block";

    let defs = svg.querySelector("defs");
    if (!defs) {
      defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      svg.insertBefore(defs, svg.firstChild);
    }

    const porZona = new Map(imagenes.map((i) => [i.zonaId, i]));
    const porTexto = new Map(textos.map((t) => [t.id, t]));
    const grupos = Array.from(svg.querySelectorAll("g[id]")) as SVGGElement[];
    // Fondos candidatos para contener textos (SPEC 2.1): rects directos de
    // cualquier grupo (marcadores de zona, guías, fondos), en espacio raíz.
    // Los de UI propia llevan data-ui y se excluyen; los clips viven en defs.
    const fondos: CajaZona[] = [];
    for (const gg of Array.from(svg.querySelectorAll("g"))) {
      for (const r of Array.from(gg.children)) {
        if (r.tagName.toLowerCase() !== "rect") continue;
        if ((r as Element).hasAttribute("data-ui")) continue;
        const c = cajaRectEnSvg(svg, r as SVGRectElement);
        if (c && c.w > 0 && c.h > 0) fondos.push(c);
      }
    }
    const primeraVez = !defectosEnviados.current;
    const cajasDef: DefectosPlantilla["cajas"] = {};
    const textosDef: DefectosPlantilla["textos"] = {};

    // px de pantalla → unidades SVG (el viewBox manda).
    const aSvg = (dxPx: number, dyPx: number) => {
      const rect = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      return {
        dx: dxPx * (rect.width > 0 ? vb.width / rect.width : 1),
        dy: dyPx * (rect.height > 0 ? vb.height / rect.height : 1),
      };
    };
    // Punto de pantalla → punto en unidades SVG (gesto de la manija).
    const aPunto = (cxPx: number, cyPx: number) => {
      const rect = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      return {
        x: rect.width > 0 ? ((cxPx - rect.left) * vb.width) / rect.width : 0,
        y: rect.height > 0 ? ((cyPx - rect.top) * vb.height) / rect.height : 0,
      };
    };
    const zonaDe = (objetivo: EventTarget | null): string | null => {
      const el = objetivo instanceof Element ? objetivo.closest("g[id]") : null;
      const zid = el?.getAttribute("id") ?? "";
      return ZONA_RE.test(zid) ? zid : null;
    };
    // SPEC 2.1 paso 3: grupo de texto bajo el puntero (si lo hay).
    const textoDe = (objetivo: EventTarget | null): string | null => {
      const el = objetivo instanceof Element ? objetivo.closest("g[id]") : null;
      const tid = el?.getAttribute("id") ?? "";
      return tid.startsWith("texto-editable-") ? tid : null;
    };
    // SPEC 2.2 paso 3: zona ancestro aunque el g más cercano sea un texto
    // (texto anidado dentro de zona en SVGs futuros del dueño).
    const zonaAncestroDe = (objetivo: EventTarget | null): string | null => {
      let el = objetivo instanceof Element ? objetivo.parentElement : null;
      while (el) {
        const id = el.getAttribute?.("id") ?? "";
        if (ZONA_RE.test(id)) return id;
        el = el.parentElement;
      }
      return null;
    };

    for (const g of grupos) {
      const id = g.getAttribute("id") ?? "";
      if (ZONA_RE.test(id)) {
        g.style.cursor = "pointer";

        // Geometría transform-aware (bbox rectangular para defectos y
        // selección); el clip usa la forma real (SPEC 2.5 paso 2).
        const caja = medirCajaZona(svg, g);
        const marcador = formaDeZona(g);
        // Oculta el marcador (aporta geometría, no se ve ni se imprime).
        for (const hijo of Array.from(g.children)) {
          if (
            /^(rect|path|circle|ellipse|polygon)$/i.test((hijo as Element).tagName) &&
            !(hijo as Element).hasAttribute("data-foto")
          ) {
            (hijo as SVGElement).style.display = "none";
          }
        }
        // Limpia foto anterior de este render.
        g.querySelectorAll("[data-foto]").forEach((n) => n.remove());
        if (primeraVez && caja && caja.w > 0 && caja.h > 0) {
          cajasDef[id] = { x: caja.x, y: caja.y, w: caja.w, h: caja.h };
        }

        // Clip por zona con la forma real (diamantes recortan en diamante).
        // El contorno de selección sigue siendo el bbox rectangular (UI).
        const clipId = `clip-${id}`;
        defs.querySelector(`#${CSS.escape(clipId)}`)?.remove();
        if (caja && caja.w > 0 && caja.h > 0 && marcador) {
          cajasValidas.current.add(id);
          const clip = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
          clip.setAttribute("id", clipId);
          const clon = marcador.cloneNode(false) as SVGElement;
          clon.removeAttribute("id");
          clon.removeAttribute("display");
          clon.style.display = "";
          clip.appendChild(clon);
          defs.appendChild(clip);

          // Foto recortada a la zona (nunca se sale: clip-path).
          const ajuste = porZona.get(id);
          if (ajuste?.src) {
            const nat = naturales[id];
            const foto = document.createElementNS("http://www.w3.org/2000/svg", "image");
            foto.setAttribute("data-foto", id);
            foto.setAttribute("clip-path", `url(#${clipId})`);
            // FIX proporción (fuera de SPEC 2.2, ver nota al final del spec):
            // `slice` conserva la proporción siempre. Con la caja exacta del
            // cover se ve idéntico a `none`; en la rama provisional (aún sin
            // tamaño natural) recorta centrado en vez de deformar.
            foto.setAttribute("preserveAspectRatio", "xMidYMid slice");
            (foto as SVGImageElement).setAttribute("href", ajuste.src);
            if (nat && nat.w > 0 && nat.h > 0) {
              // Auto-encuadre cover + pan/zoom del panel.
              const escala = ajuste.escala ?? 1;
              const s0 = Math.max(caja.w / nat.w, caja.h / nat.h);
              const s = s0 * escala;
              const w = nat.w * s;
              const h = nat.h * s;
              const dx = ajuste.x ?? 0;
              const dy = ajuste.y ?? 0;
              foto.setAttribute("x", String(caja.x + (caja.w - w) / 2 + dx));
              foto.setAttribute("y", String(caja.y + (caja.h - h) / 2 + dy));
              foto.setAttribute("width", String(w));
              foto.setAttribute("height", String(h));
            } else {
              // Aún sin tamaño natural: relleno provisional hasta la sonda.
              foto.setAttribute("x", String(caja.x));
              foto.setAttribute("y", String(caja.y));
              foto.setAttribute("width", String(caja.w));
              foto.setAttribute("height", String(caja.h));
            }
            g.appendChild(foto);
          }

          // SPEC 2.3 paso 1: overlay de zona vacía (UI: excluido del PDF
          // vía data-ui). Solo si no hay foto; mismo clip-path de la zona
          // (en zonas futuras no rectangulares el rojo nunca se sale de la
          // forma, igual que la foto) y sin interceptar eventos.
          if (!ajuste?.src) {
            const vacia = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "rect",
            );
            vacia.setAttribute("data-ui", "zona-vacia");
            vacia.setAttribute("x", String(caja.x));
            vacia.setAttribute("y", String(caja.y));
            vacia.setAttribute("width", String(caja.w));
            vacia.setAttribute("height", String(caja.h));
            vacia.setAttribute("fill", COLOR_SELECCION);
            vacia.setAttribute("fill-opacity", "0.1");
            vacia.setAttribute("stroke", "none");
            vacia.setAttribute("clip-path", `url(#${clipId})`);
            vacia.style.pointerEvents = "none";
            g.appendChild(vacia);
          }

          // Contorno de selección propio (UI: excluido del PDF vía data-ui).
          // Clicable (pointer-events all con fill none): las caras vacías
          // no tienen qué pulsar (marcador oculto), así el contorno recibe
          // el clic y la zona se selecciona. El contorno del texto sigue
          // sin interceptar para no taparlo.
          const sel = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          sel.setAttribute("data-ui", "seleccion");
          sel.setAttribute("x", String(caja.x));
          sel.setAttribute("y", String(caja.y));
          sel.setAttribute("width", String(caja.w));
          sel.setAttribute("height", String(caja.h));
          sel.setAttribute("fill", "none");
          sel.setAttribute("stroke", zonaSeleccionada === id ? COLOR_SELECCION : "#999");
          sel.setAttribute("stroke-width", zonaSeleccionada === id ? "3" : "1.5");
          sel.setAttribute("stroke-dasharray", zonaSeleccionada === id ? "none" : "8 6");
          sel.style.pointerEvents = "all";
          g.appendChild(sel);
        } else {
          cajasValidas.current.delete(id);
        }
      } else if (id.startsWith("texto-editable-")) {
        const nodoTexto = g.querySelector("text");
        g.style.cursor = "move";
        // SPEC 2.1 paso 3: en táctil el gesto mueve el texto (no scroll).
        g.style.touchAction = "none";
        if (primeraVez && nodoTexto && !metaTexto.current.has(id)) {
          // Defectos del SVG vivo antes de aplicar ajustes (el shell los usa
          // para el auto-shrink: slot = texto default al 100 %).
          const cs = getComputedStyle(nodoTexto);
          let ancho = 0;
          try {
            ancho = (nodoTexto as SVGTextContentElement).getComputedTextLength();
          } catch {
            ancho = 0;
          }
          textosDef[id] = {
            contenido: nodoTexto.textContent ?? "",
            // Lo renderizado manda: las clases del dueño (.st4) ganan a los
            // atributos, así que el default se lee de computados.
            tamano:
              parseFloat(cs.fontSize) ||
              parseFloat(nodoTexto.getAttribute("font-size") ?? "") ||
              16,
            ancho,
            peso: cs.fontWeight || "400",
            estilo: cs.fontStyle || "normal",
            color: cs.fill || nodoTexto.getAttribute("fill") || "",
          };
          // Caja límite: el rectángulo (zona, guía o fondo) más chico que
          // contiene el ancla; sin contenedor se usa la caja propia.
          // Medición inicial (la remedición tardía la activa con contenido).
          const medida = medirCajaTexto(g, nodoTexto, null);
          if (medida) {
            const cont = cajaContenedora(
              fondos,
              medida.ax,
              medida.ay,
              medida.caja.w * medida.caja.h,
            );
            metaTexto.current.set(id, cont ? { ...medida, caja: cont } : medida);
          } else {
            metaTexto.current.set(id, {
              caja: { x: 0, y: 0, w: 0, h: 0 },
              ax: 0,
              ay: 0,
              base: "",
            });
          }
        }
        const ajuste = porTexto.get(id);
        if (nodoTexto && ajuste) {
          nodoTexto.textContent = ajuste.contenido;
          // Estilos inline: las clases del dueño ganan a los atributos, así
          // que lo que edita el invitado va inline. SPEC 2.4 paso 4: familia
          // del catálogo + peso del ajuste (sin itálica en v1); si la fuente
          // falla, el fallback es Roboto 400 sin error.
          if (ajuste.tamano != null) nodoTexto.style.fontSize = `${ajuste.tamano}px`;
          if (ajuste.color) nodoTexto.style.fill = ajuste.color;
          const familia = familiaDeFuente(ajuste.fuente ?? "roboto");
          const peso = normalizarPesoTexto(ajuste.peso);
          nodoTexto.style.fontFamily = `"${familia}", Roboto, sans-serif`;
          nodoTexto.style.fontWeight = String(peso);
          nodoTexto.style.fontStyle = "normal";
          // SPEC 2.1: el texto siempre va alineado a la izquierda.
          nodoTexto.style.setProperty("text-anchor", "start");
          // SPEC 2.1 paso 3: desplazamiento (compuesto tras el transform del
          // autor) + recorte a la caja del grupo (el texto nunca la invade).
          const meta = metaTexto.current.get(id);
          const ox = ajuste.x ?? 0;
          const oy = ajuste.y ?? 0;
          if (meta) {
            const base = meta.base ? `${meta.base} ` : "";
            g.setAttribute("transform", `${base}translate(${ox} ${oy})`);
            const clipTextoId = `clip-texto-${id}`;
            defs.querySelector(`#${CSS.escape(clipTextoId)}`)?.remove();
            g.removeAttribute("clip-path");
            if (meta.caja.w > 0 && meta.caja.h > 0) {
              const clip = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
              clip.setAttribute("id", clipTextoId);
              const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
              rect.setAttribute("x", String(meta.caja.x));
              rect.setAttribute("y", String(meta.caja.y));
              rect.setAttribute("width", String(meta.caja.w));
              rect.setAttribute("height", String(meta.caja.h));
              clip.appendChild(rect);
              defs.appendChild(clip);
              g.setAttribute("clip-path", `url(#${clipTextoId})`);
            }
          }
          // Remedición tardía: si la caja quedó vacía (default sin texto)
          // y ahora hay contenido, se mide con lo renderizado y se reenvían
          // los defectos fusionados (activa clip, arrastre, manija y slot).
          // La base del autor se conserva: el DOM ya trae nuestro translate.
          const metaPrevia = metaTexto.current.get(id);
          const cajaVacia =
            !metaPrevia || metaPrevia.caja.w <= 0 || metaPrevia.caja.h <= 0;
          if (cajaVacia && (nodoTexto.textContent ?? "").trim().length > 0) {
            const tardia = medirCajaTexto(g, nodoTexto, metaPrevia?.base ?? null);
            if (tardia && tardia.caja.w > 0 && tardia.caja.h > 0) {
              const cont = cajaContenedora(
                fondos,
                tardia.ax,
                tardia.ay,
                tardia.caja.w * tardia.caja.h,
              );
              metaTexto.current.set(id, cont ? { ...tardia, caja: cont } : tardia);
              let anchoTardio = 0;
              try {
                anchoTardio = (
                  nodoTexto as SVGTextContentElement
                ).getComputedTextLength();
              } catch {
                anchoTardio = 0;
              }
              const acc = defectosAcum.current;
              const entrada = acc?.textos[id];
              if (acc && entrada && anchoTardio > 0) {
                const fusion: DefectosPlantilla = {
                  cajas: acc.cajas,
                  textos: {
                    ...acc.textos,
                    [id]: { ...entrada, ancho: anchoTardio },
                  },
                };
                defectosAcum.current = fusion;
                defectosCb.current?.(fusion);
              }
            }
          }
        }
        // SPEC 2.1 paso 3: contorno del texto seleccionado (UI: excluido
        // del PDF vía data-ui; va a la raíz para no heredar el translate).
        if (textoSeleccionado === id) {
          const meta = metaTexto.current.get(id);
          const aj = porTexto.get(id);
          const ox = aj?.x ?? 0;
          const oy = aj?.y ?? 0;
          if (meta && meta.caja.w > 0 && meta.caja.h > 0) {
            const marco = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            marco.setAttribute("data-ui", "sel-texto");
            marco.setAttribute("x", String(meta.caja.x));
            marco.setAttribute("y", String(meta.caja.y));
            marco.setAttribute("width", String(meta.caja.w));
            marco.setAttribute("height", String(meta.caja.h));
            marco.setAttribute("fill", "none");
            marco.setAttribute("stroke", COLOR_SELECCION);
            marco.setAttribute("stroke-width", "2.5");
            marco.style.pointerEvents = "none";
            svg.appendChild(marco);
            // SPEC 2.1 paso 4: manija única en la esquina inferior derecha
            // del TEXTO (sigue a la tinta, no a la cara). Solo escala.
            // Sin tinta medible usa la esquina de la caja como fallback.
            if (aj?.tamanoBase != null) {
              const rectSvg = svg.getBoundingClientRect();
              const vbAncho = svg.viewBox.baseVal?.width || 0;
              const uSvgPorPx =
                rectSvg.width > 0 && vbAncho > 0 ? vbAncho / rectSvg.width : 1;
              const tinta = cajaTintaTexto(svg, id);
              const hx = tinta ? tinta.x + tinta.w : meta.caja.x + meta.caja.w + ox;
              const hy = tinta ? tinta.y + tinta.h : meta.caja.y + meta.caja.h + oy;
              const golpe = document.createElementNS("http://www.w3.org/2000/svg", "circle");
              golpe.setAttribute("data-ui", "manija");
              golpe.setAttribute("data-manija", id);
              golpe.setAttribute("cx", String(hx));
              golpe.setAttribute("cy", String(hy));
              // Área táctil ~24 px + cursor de escala diagonal.
              golpe.setAttribute("r", String(Math.max(8, 24 * uSvgPorPx)));
              golpe.setAttribute("fill", "none");
              golpe.setAttribute("pointer-events", "all");
              golpe.style.cursor = "nwse-resize";
              golpe.style.touchAction = "none";
              svg.appendChild(golpe);
              const punto = document.createElementNS("http://www.w3.org/2000/svg", "circle");
              punto.setAttribute("data-ui", "manija-punto");
              punto.setAttribute("cx", String(hx));
              punto.setAttribute("cy", String(hy));
              punto.setAttribute("r", "5");
              punto.setAttribute("fill", "#111");
              punto.setAttribute("stroke", "#fff");
              punto.setAttribute("stroke-width", "1.5");
              punto.style.pointerEvents = "none";
              svg.appendChild(punto);
            }
          }
        }
      }
    }

    if (primeraVez) {
      defectosEnviados.current = true;
      const iniciales: DefectosPlantilla = {
        cajas: cajasDef,
        textos: textosDef,
      };
      defectosAcum.current = iniciales;
      defectosCb.current?.(iniciales);
    }

    // Interacción del canvas (delega en la raíz): clic selecciona, arrastre
    // mueve la foto en unidades SVG. En táctil se deja pasar el scroll
    // vertical (pan-y), salvo en textos (paso 3: el gesto los mueve).
    // El gesto vive en arrastreRef (declarado arriba): un re-render a mitad
    // del gesto re-suscribe estos listeners sin perderlo.
    svg.style.touchAction = "pan-y";
    const abajo = (e: PointerEvent) => {
      if (!arrastrarCb.current && !seleccionarCb.current && !arrastrarTextoCb.current) return;
      // SPEC 2.1 paso 4: la manija tiene prioridad (está encima del texto).
      const manijaEl =
        e.target instanceof Element ? e.target.closest("[data-manija]") : null;
      const mid = manijaEl?.getAttribute("data-manija");
      if (mid && (e.pointerType !== "mouse" || e.button === 0)) {
        const meta = metaTexto.current.get(mid);
        const aj = porTexto.get(mid);
        const ox0 = aj?.x ?? 0;
        const oy0 = aj?.y ?? 0;
        if (meta && meta.caja.w > 0 && meta.caja.h > 0 && aj?.tamanoBase != null) {
          seleccionarTextoCb.current?.(mid);
          const p = aPunto(e.clientX, e.clientY);
          // Pivote en la esquina opuesta de la TINTA (coherente con una
          // manija que vive en la esquina del texto); fallback a la caja.
          const tinta = cajaTintaTexto(svg, mid);
          const fijoX = tinta ? tinta.x : meta.caja.x + ox0;
          const fijoY = tinta ? tinta.y : meta.caja.y + oy0;
          arrastreRef.current = {
            clase: "escala",
            textoId: mid,
            ultimoX: e.clientX,
            ultimoY: e.clientY,
            movido: false,
            fijoX,
            fijoY,
            dist0: Math.hypot(p.x - fijoX, p.y - fijoY),
            base0: aj.tamanoBase,
            min: aj.minTamano ?? 1,
            max: aj.maxTamano ?? aj.tamanoBase,
          };
        } else {
          seleccionarTextoCb.current?.(mid);
        }
        return;
      }
      const zidCercano = zonaDe(e.target);
      const tid = textoDe(e.target);
      // SPEC 2.2 paso 3: texto anidado en zona → gesto mixto (toque = texto,
      // arrastre = foto). Sin anidado, el texto ya gana solo.
      const zid = zidCercano ?? (tid ? zonaAncestroDe(e.target) : null);
      if (!zid && !tid) {
        // Fondo: un toque sin mover deselecciona zona y texto (SPEC 2.2).
        arrastreRef.current = { clase: "fondo", movido: false };
        return;
      }
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (zid && tid) {
        arrastreRef.current = { clase: "mixto", zonaId: zid, textoId: tid, ultimoX: e.clientX, ultimoY: e.clientY, movido: false };
      } else if (tid) {
        seleccionarTextoCb.current?.(tid);
        // El gesto es relativo a su inicio (x0/y0 + offset inicial): así el
        // recorte es exacto aunque React no haya pintado entre movimientos.
        const aj0 = porTexto.get(tid);
        arrastreRef.current = { clase: "texto", textoId: tid, ultimoX: e.clientX, ultimoY: e.clientY, movido: false, x0: e.clientX, y0: e.clientY, ox0: aj0?.x ?? 0, oy0: aj0?.y ?? 0, enviadoX: 0, enviadoY: 0 };
      } else if (zid) {
        arrastreRef.current = { clase: "zona", zonaId: zid, ultimoX: e.clientX, ultimoY: e.clientY, movido: false };
      }
    };
    // Recorta una posición ABSOLUTA (offset en unidades SVG) para que el
    // punto de ancla nunca salga de la caja del grupo. Sin caja medible
    // devuelve null (bloqueado).
    const recortarPosicionTexto = (id: string, x: number, y: number): { x: number; y: number } | null => {
      const meta = metaTexto.current.get(id);
      if (!meta || meta.caja.w <= 0 || meta.caja.h <= 0) return null;
      const minX = meta.caja.x - meta.ax;
      const maxX = meta.caja.x + meta.caja.w - meta.ax;
      const minY = meta.caja.y - meta.ay;
      const maxY = meta.caja.y + meta.caja.h - meta.ay;
      return {
        x: Math.min(Math.max(x, minX), maxX),
        y: Math.min(Math.max(y, minY), maxY),
      };
    };
    const mueve = (e: PointerEvent) => {
      if (!arrastreRef.current || arrastreRef.current.clase === "fondo") return;
      // SPEC 2.2 paso 3: gesto mixto sin mover aún = sigue siendo toque.
      if (arrastreRef.current.clase === "mixto") {
        if (
          Math.hypot(
            e.clientX - arrastreRef.current.ultimoX,
            e.clientY - arrastreRef.current.ultimoY,
          ) < 3
        ) {
          return;
        }
        // Con movimiento, el gesto pasa a mover la foto de la zona.
        arrastreRef.current = {
          clase: "zona",
          zonaId: arrastreRef.current.zonaId,
          ultimoX: arrastreRef.current.ultimoX,
          ultimoY: arrastreRef.current.ultimoY,
          movido: false,
        };
      }
      const dxPx = e.clientX - arrastreRef.current.ultimoX;
      const dyPx = e.clientY - arrastreRef.current.ultimoY;
      arrastreRef.current.ultimoX = e.clientX;
      arrastreRef.current.ultimoY = e.clientY;
      if (!arrastreRef.current.movido && Math.hypot(dxPx, dyPx) < 3) return;
      arrastreRef.current.movido = true;
      if (arrastreRef.current.clase === "zona") {
        if (arrastrarCb.current) {
          const d = aSvg(dxPx, dyPx);
          arrastrarCb.current(arrastreRef.current.zonaId, d.dx, d.dy);
        }
      } else if (arrastreRef.current.clase === "escala") {
        // SPEC 2.1 paso 4: escala desde la esquina opuesta fija (sin rotar).
        if (escalarTextoCb.current) {
          const p = aPunto(e.clientX, e.clientY);
          const dist = Math.hypot(p.x - arrastreRef.current.fijoX, p.y - arrastreRef.current.fijoY);
          const cociente = arrastreRef.current.dist0 > 0 ? dist / arrastreRef.current.dist0 : 1;
          let nuevo = arrastreRef.current.base0 * cociente;
          if (Number.isFinite(arrastreRef.current.min) && Number.isFinite(arrastreRef.current.max) && arrastreRef.current.min <= arrastreRef.current.max) {
            nuevo = Math.min(arrastreRef.current.max, Math.max(arrastreRef.current.min, nuevo));
          }
          if (Number.isFinite(nuevo)) {
            escalarTextoCb.current(arrastreRef.current.textoId, nuevo);
          }
        }
      } else {
        if (arrastrarTextoCb.current) {
          // Delta desde el inicio del gesto (no desde el último render):
          // el recorte del objetivo es exacto y nunca se acumula de más.
          const total = aSvg(e.clientX - arrastreRef.current.x0, e.clientY - arrastreRef.current.y0);
          const objetivo = recortarPosicionTexto(
            arrastreRef.current.textoId,
            arrastreRef.current.ox0 + total.dx,
            arrastreRef.current.oy0 + total.dy,
          );
          if (objetivo) {
            const dx = objetivo.x - arrastreRef.current.ox0 - arrastreRef.current.enviadoX;
            const dy = objetivo.y - arrastreRef.current.oy0 - arrastreRef.current.enviadoY;
            // Sin delta no hay cambio: evita renders en vacío (bloqueado).
            if (dx !== 0 || dy !== 0) {
              arrastreRef.current.enviadoX += dx;
              arrastreRef.current.enviadoY += dy;
              arrastrarTextoCb.current(arrastreRef.current.textoId, dx, dy);
            }
          }
        }
      }
    };
    const arriba = () => {
      if (arrastreRef.current && arrastreRef.current.clase === "fondo" && !arrastreRef.current.movido) {
        // SPEC 2.2 paso 3: el fondo deselecciona zona y texto.
        if (deseleccionarCb.current) deseleccionarCb.current();
        else seleccionarTextoCb.current?.(null);
      } else if (arrastreRef.current && arrastreRef.current.clase === "mixto" && !arrastreRef.current.movido) {
        // SPEC 2.2 paso 3: toque sin mover sobre texto (aunque viva en zona).
        seleccionarTextoCb.current?.(arrastreRef.current.textoId);
      } else if (arrastreRef.current && arrastreRef.current.clase === "zona" && !arrastreRef.current.movido) {
        seleccionarCb.current?.(arrastreRef.current.zonaId);
      }
      arrastreRef.current = null;
    };
    svg.addEventListener("pointerdown", abajo);
    svg.addEventListener("pointermove", mueve);
    svg.addEventListener("pointerup", arriba);
    svg.addEventListener("pointercancel", arriba);

    return () => {
      svg.removeEventListener("pointerdown", abajo);
      svg.removeEventListener("pointermove", mueve);
      svg.removeEventListener("pointerup", arriba);
      svg.removeEventListener("pointercancel", arriba);
      svg.querySelectorAll("[data-ui]").forEach((n) => n.remove());
    };
  }, [svgText, imagenes, textos, zonaSeleccionada, textoSeleccionado, naturales, svgRef, fuentesTick]);

  // SPEC 2.3 paso 2: solo archivos externos; drags internos (mover foto
  // o texto del SPEC 2.1, texto seleccionado) no traen `Files` y se ignoran.
  function traeArchivos(e: React.DragEvent): boolean {
    try {
      return Array.from(e.dataTransfer.types ?? []).includes("Files");
    } catch {
      return false;
    }
  }

  // Zona bajo el punto de suelta: grupo más cercano o zona ancestro si cae
  // sobre un texto anidado (misma lógica `zonaAncestroDe` del SPEC 2.2).
  function zonaBajoPunto(objetivo: EventTarget | null): string | null {
    const el = objetivo instanceof Element ? objetivo.closest("g[id]") : null;
    const zid = el?.getAttribute("id") ?? "";
    if (ZONA_RE.test(zid)) return zid;
    let n = objetivo instanceof Element ? objetivo.parentElement : null;
    while (n) {
      const id = n.getAttribute?.("id") ?? "";
      if (ZONA_RE.test(id)) return id;
      n = n.parentElement;
    }
    return null;
  }

  function alArrastrarSobre(e: React.DragEvent) {
    if (!traeArchivos(e)) return;
    // Solo permite el drop; no cambia ningún estilo (decisión del dueño).
    e.preventDefault();
  }

  function alSoltar(e: React.DragEvent) {
    if (!traeArchivos(e)) return;
    e.preventDefault();
    const zid = zonaBajoPunto(e.target);
    if (!zid || !cajasValidas.current.has(zid)) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    archivoExternoCb.current?.(zid, file);
  }

  return (
    <div
      ref={envolturaRef}
      className="min-w-0"
      onDragOver={alArrastrarSobre}
      onDrop={alSoltar}
    >
      <div dangerouslySetInnerHTML={{ __html: svgText }} />
    </div>
  );
}
