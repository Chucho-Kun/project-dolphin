"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

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
};

export type CajaZona = { x: number; y: number; w: number; h: number };

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

function numero(attr: string | null): number {
  const n = Number(attr);
  return Number.isFinite(n) ? n : 0;
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
}: Props) {
  const envolturaRef = useRef<HTMLDivElement>(null);
  const [naturales, setNaturales] = useState<Record<string, { w: number; h: number }>>({});
  const defectosEnviados = useRef(false);
  const defectosCb = useRef(onDefectos);
  const arrastrarCb = useRef(onArrastrarZona);
  const seleccionarCb = useRef(onSeleccionarZona);
  useEffect(() => {
    defectosCb.current = onDefectos;
    arrastrarCb.current = onArrastrarZona;
    seleccionarCb.current = onSeleccionarZona;
  });

  // Tamaños naturales de las imágenes (para el encuadre cover).
  useEffect(() => {
    let vivo = true;
    for (const img of imagenes) {
      if (!img.src || naturales[img.zonaId]) continue;
      const sonda = new Image();
      sonda.onload = () => {
        if (!vivo) return;
        const w = sonda.naturalWidth || 1;
        const h = sonda.naturalHeight || 1;
        setNaturales((prev) =>
          prev[img.zonaId] ? prev : { ...prev, [img.zonaId]: { w, h } },
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
    const zonaDe = (objetivo: EventTarget | null): string | null => {
      const el = objetivo instanceof Element ? objetivo.closest("g[id]") : null;
      const zid = el?.getAttribute("id") ?? "";
      return ZONA_RE.test(zid) ? zid : null;
    };

    for (const g of grupos) {
      const id = g.getAttribute("id") ?? "";
      if (ZONA_RE.test(id)) {
        g.style.cursor = "pointer";

        // Geometría: primer hijo de forma; se copia al clip y se oculta el marcador.
        const forma = Array.from(g.children).find((h) =>
          /^(rect|path|circle|ellipse|polygon)$/i.test(h.tagName),
        ) as SVGElement | undefined;
        let caja: { x: number; y: number; w: number; h: number } | null = null;
        if (forma) {
          if (forma.tagName.toLowerCase() === "rect") {
            caja = {
              x: numero(forma.getAttribute("x")),
              y: numero(forma.getAttribute("y")),
              w: numero(forma.getAttribute("width")),
              h: numero(forma.getAttribute("height")),
            };
          } else {
            try {
              const b = (forma as SVGGraphicsElement).getBBox();
              caja = { x: b.x, y: b.y, w: b.width, h: b.height };
            } catch {
              caja = null;
            }
          }
          // Oculta el marcador (aporta geometría, no se ve ni se imprime).
          for (const hijo of Array.from(g.children)) {
            if (
              /^(rect|path|circle|ellipse|polygon)$/i.test((hijo as Element).tagName) &&
              !(hijo as Element).hasAttribute("data-foto")
            ) {
              (hijo as SVGElement).style.display = "none";
            }
          }
        }
        // Limpia foto anterior de este render.
        g.querySelectorAll("[data-foto]").forEach((n) => n.remove());
        if (primeraVez && caja && caja.w > 0 && caja.h > 0) {
          cajasDef[id] = { x: caja.x, y: caja.y, w: caja.w, h: caja.h };
        }

        // Clip por zona.
        const clipId = `clip-${id}`;
        defs.querySelector(`#${CSS.escape(clipId)}`)?.remove();
        if (caja && caja.w > 0 && caja.h > 0) {
          const clip = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
          clip.setAttribute("id", clipId);
          const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          rect.setAttribute("x", String(caja.x));
          rect.setAttribute("y", String(caja.y));
          rect.setAttribute("width", String(caja.w));
          rect.setAttribute("height", String(caja.h));
          clip.appendChild(rect);
          defs.appendChild(clip);

          // Foto recortada a la zona (nunca se sale: clip-path).
          const ajuste = porZona.get(id);
          if (ajuste?.src) {
            const nat = naturales[id];
            const foto = document.createElementNS("http://www.w3.org/2000/svg", "image");
            foto.setAttribute("data-foto", id);
            foto.setAttribute("clip-path", `url(#${clipId})`);
            foto.setAttribute("preserveAspectRatio", "none");
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

          // Contorno de selección propio (UI: excluido del PDF vía data-ui).
          const sel = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          sel.setAttribute("data-ui", "seleccion");
          sel.setAttribute("x", String(caja.x));
          sel.setAttribute("y", String(caja.y));
          sel.setAttribute("width", String(caja.w));
          sel.setAttribute("height", String(caja.h));
          sel.setAttribute("fill", "none");
          sel.setAttribute("stroke", zonaSeleccionada === id ? "#111" : "#999");
          sel.setAttribute("stroke-width", zonaSeleccionada === id ? "3" : "1.5");
          sel.setAttribute("stroke-dasharray", zonaSeleccionada === id ? "none" : "8 6");
          sel.style.pointerEvents = "none";
          g.appendChild(sel);
        }
      } else if (id.startsWith("texto-editable-")) {
        const nodoTexto = g.querySelector("text");
        if (primeraVez && nodoTexto) {
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
            tamano:
              parseFloat(nodoTexto.getAttribute("font-size") ?? "") ||
              parseFloat(cs.fontSize) ||
              16,
            ancho,
            peso: cs.fontWeight || "400",
            estilo: cs.fontStyle || "normal",
            color: nodoTexto.getAttribute("fill") || cs.fill || "",
          };
        }
        const ajuste = porTexto.get(id);
        if (nodoTexto && ajuste) {
          nodoTexto.textContent = ajuste.contenido;
          if (ajuste.tamano != null) nodoTexto.setAttribute("font-size", String(ajuste.tamano));
          if (ajuste.color) nodoTexto.setAttribute("fill", ajuste.color);
          if (ajuste.fuente) nodoTexto.setAttribute("font-family", `${ajuste.fuente}, sans-serif`);
        }
      }
    }

    if (primeraVez) {
      defectosEnviados.current = true;
      defectosCb.current?.({ cajas: cajasDef, textos: textosDef });
    }

    // Interacción del canvas (delega en la raíz): clic selecciona, arrastre
    // mueve la foto en unidades SVG. En táctil se deja pasar el scroll
    // vertical (pan-y); el arrastre fino vive en el panel.
    svg.style.touchAction = "pan-y";
    let arrastre: { zonaId: string; ultimoX: number; ultimoY: number; movido: boolean } | null = null;
    const abajo = (e: PointerEvent) => {
      if (!arrastrarCb.current && !seleccionarCb.current) return;
      const zid = zonaDe(e.target);
      if (!zid) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      arrastre = { zonaId: zid, ultimoX: e.clientX, ultimoY: e.clientY, movido: false };
    };
    const mueve = (e: PointerEvent) => {
      if (!arrastre) return;
      const dxPx = e.clientX - arrastre.ultimoX;
      const dyPx = e.clientY - arrastre.ultimoY;
      arrastre.ultimoX = e.clientX;
      arrastre.ultimoY = e.clientY;
      if (!arrastre.movido && Math.hypot(dxPx, dyPx) < 3) return;
      arrastre.movido = true;
      if (arrastrarCb.current) {
        const d = aSvg(dxPx, dyPx);
        arrastrarCb.current(arrastre.zonaId, d.dx, d.dy);
      }
    };
    const arriba = () => {
      if (arrastre && !arrastre.movido) seleccionarCb.current?.(arrastre.zonaId);
      arrastre = null;
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
  }, [svgText, imagenes, textos, zonaSeleccionada, naturales, svgRef]);

  return (
    <div ref={envolturaRef} className="min-w-0">
      <div dangerouslySetInnerHTML={{ __html: svgText }} />
    </div>
  );
}
