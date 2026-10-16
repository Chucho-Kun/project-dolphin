"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import PlantillaSvg, {
  type DefectosPlantilla,
  type ImagenEnZona,
  type TextoEnPlantilla,
} from "./PlantillaSvg";
import PanelImagen, { validarArchivoImagen } from "./PanelImagen";
import PanelTexto from "./PanelTexto";
import {
  AJUSTE_CENTRADO,
  limitarAjuste,
  type AjusteImagen,
} from "@/lib/encuadre";
import {
  esperarFuentes,
  normalizarPosicionTexto,
  PISO_AUTO_SHRINK,
  resolverTexto,
  TECHO_ESCALA_TEXTO,
  type AjusteTexto,
  type ReferenciaTexto,
} from "@/lib/texto";
import {
  esFuenteValida,
  FUENTE_DEFAULT,
  normalizarFuente,
} from "@/lib/fuentes";
import {
  descargarPdfDeVariasPaginas,
  type PaginaPdf,
} from "@/lib/pdf";

// components/editor/EditorShell.tsx — Layout canvas+paneles (SPEC 02 Paso 7).
//
// Guardar: sube pendientes a R2, luego POST (token nuevo + link ?t=) o PUT
// (last-write-wins). Descargar: PDF directo del SVG visible, sin guardar.
// SPEC 2.5: multipágina (carta horizontal, 2 páginas). Estado independiente
// por página (`pagina` viaja en cada item; ausente ⇒ 1), selector 1/2,
// `svgRef` por página. Guardar serializa ambas páginas: el PUT reemplaza
// todo, guardar solo la visible borraría la otra.

export type FotoInicial = {
  zonaId: string;
  src: string;
  r2Key: string | null;
  x: number;
  y: number;
  escala: number;
  /** SPEC 2.5: página 1|2 (page.tsx ya la reparte). */
  pagina: number;
};

export type TextoInicial = {
  id: string;
  contenido: string;
  tamano: number;
  color: string;
  fuente: string;
  /** SPEC 2.5: página 1|2 (page.tsx ya la reparte). */
  pagina: number;
  // SPEC 2.1: opcionales (los ?t= viejos no los traen).
  x?: number;
  y?: number;
  // SPEC 2.4: peso opcional (ausente ⇒ 400).
  peso?: 400 | 700;
};

export type PaginaInicial = {
  pagina: number;
  /** Null si la página trae aviso (muestra aviso, nunca error). */
  svgText: string | null;
  anchoMm: number;
  altoMm: number;
  zonas: string[];
  textosIds: string[];
  motivoAviso:
    | "sin-svg"
    | "sin-medidas"
    | "sin-zonas"
    | "no-disponible"
    | null;
};

type Props = {
  productCode: string;
  locale: string;
  paginas: PaginaInicial[];
  fotosIniciales: FotoInicial[];
  textosIniciales: TextoInicial[];
  tokenInicial: string | null;
};

type FotoEstado = {
  src: string;
  file: File | null;
  r2Key: string | null;
  ajuste: AjusteImagen;
};

/** rgb(29, 29, 27) → #1d1d1b. La API solo acepta hex. */
function aHex(color: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color.toLowerCase();
  const m = color.match(
    /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i,
  );
  if (m) {
    const hex = [m[1], m[2], m[3]]
      .map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0"))
      .join("");
    return `#${hex}`;
  }
  return "#1d1d1b";
}

function cargarNatural(src: string): Promise<{ w: number; h: number } | null> {
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () =>
      ok({ w: img.naturalWidth || 0, h: img.naturalHeight || 0 });
    img.onerror = () => ok(null);
    img.src = src;
  });
}

/** Clave de aviso existente para un motivo (reusa strings, sin claves nuevas). */
function claveAviso(
  motivo: NonNullable<PaginaInicial["motivoAviso"]>,
): "avisoSinSvg" | "avisoSinMedidas" | "avisoSinZonas" | "avisoNoDisponible" {
  return motivo === "sin-svg"
    ? "avisoSinSvg"
    : motivo === "sin-medidas"
      ? "avisoSinMedidas"
      : motivo === "sin-zonas"
        ? "avisoSinZonas"
        : "avisoNoDisponible";
}

export default function EditorShell({
  productCode,
  locale,
  paginas,
  fotosIniciales,
  textosIniciales,
  tokenInicial,
}: Props) {
  const t = useTranslations("editor");
  // SPEC 2.5: un svgRef por página (objetos estables entre renders; el PDF
  // los lee en el clic, nunca durante el render).
  const [svgRefPorPagina] = useState<
    Record<number, { current: SVGSVGElement | null }>
  >(() => {
    const base: Record<number, { current: SVGSVGElement | null }> = {};
    for (const p of paginas) base[p.pagina] = { current: null };
    return base;
  });
  // SPEC 2.2 paso 4: foco del diálogo (al abrir → ×; Escape → canvas).
  const cerrarRef = useRef<HTMLButtonElement | null>(null);
  const lienzoRef = useRef<HTMLDivElement | null>(null);

  // SPEC 2.5: página visible (1|2). Al cambiar se limpia la selección.
  const [paginaActual, setPaginaActual] = useState<number>(
    paginas[0]?.pagina ?? 1,
  );
  const datosActual: PaginaInicial | undefined = paginas.find(
    (p) => p.pagina === paginaActual,
  );
  const textosIdsActuales = datosActual?.textosIds ?? [];

  const [fotosPorPagina, setFotosPorPagina] = useState<
    Record<number, Record<string, FotoEstado>>
  >(() => {
    const base: Record<number, Record<string, FotoEstado>> = {};
    for (const f of fotosIniciales) {
      if (!base[f.pagina]) base[f.pagina] = {};
      base[f.pagina][f.zonaId] = {
        src: f.src,
        file: null,
        r2Key: f.r2Key,
        ajuste: { x: f.x, y: f.y, escala: f.escala },
      };
    }
    return base;
  });
  const [textosPorPagina, setTextosPorPagina] = useState<
    Record<number, Record<string, AjusteTexto>>
  >(() => {
    const base: Record<number, Record<string, AjusteTexto>> = {};
    for (const tx of textosIniciales) {
      // SPEC 2.4 paso 5: alias legado "Roboto" → "roboto"; desconocida o
      // ausente ⇒ "roboto"; peso ausente ⇒ 400 (se omite, el default manda).
      const fuenteId =
        typeof tx.fuente === "string" && esFuenteValida(tx.fuente)
          ? normalizarFuente(tx.fuente)
          : FUENTE_DEFAULT;
      if (!base[tx.pagina]) base[tx.pagina] = {};
      base[tx.pagina][tx.id] = {
        contenido: tx.contenido,
        tamano: tx.tamano,
        color: tx.color,
        fuente: fuenteId,
        // SPEC 2.1: restaura posición si el ?t= la trae.
        ...(typeof tx.x === "number" && Number.isFinite(tx.x) ? { x: tx.x } : {}),
        ...(typeof tx.y === "number" && Number.isFinite(tx.y) ? { y: tx.y } : {}),
        ...(tx.peso === 700 ? { peso: 700 as const } : {}),
      };
    }
    return base;
  });
  // Estado de la página visible (el resto se conserva intacto en memoria).
  const fotos = fotosPorPagina[paginaActual] ?? {};
  const textos = textosPorPagina[paginaActual] ?? {};
  const [defectosPorPagina, setDefectosPorPagina] = useState<
    Record<number, DefectosPlantilla | null>
  >({});
  const defectos = defectosPorPagina[paginaActual] ?? null;
  // SPEC 2.2: sin selección inicial; el hint manda hasta el primer toque.
  const [zonaSeleccionada, setZonaSeleccionada] = useState<string | null>(null);
  // SPEC 2.1 paso 3: texto seleccionado en el canvas (contorno + gestos).
  const [textoSeleccionado, setTextoSeleccionado] = useState<string | null>(null);
  const [naturalesPorPagina, setNaturalesPorPagina] = useState<
    Record<number, Record<string, { w: number; h: number }>>
  >({});
  const naturales = naturalesPorPagina[paginaActual] ?? {};
  const [token, setToken] = useState<string | null>(tokenInicial);
  const [guardando, setGuardando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  // SPEC 2.3 paso 3: error del drop (el `error` interno de PanelImagen solo
  // lo alimenta el <input>; sin prop el error del drop no tiene por dónde
  // entrar). Se limpia al cargar válido, cambiar de selección o cerrar.
  const [falloDrop, setFalloDrop] = useState<{
    zonaId: string;
    codigo: "tipo-no-valido" | "muy-grande";
  } | null>(null);
  // SPEC 2.4 paso 4: remide el auto-shrink con la fuente real (tras load).
  const [fuentesTick, setFuentesTick] = useState(0);
  const firmaFuentesTextos = textosIdsActuales
    .map((id) => {
      const b = textos[id];
      return `${id}:${b?.fuente ?? "roboto"}:${b?.peso ?? 400}`;
    })
    .join("|");
  useEffect(() => {
    let vivo = true;
    esperarFuentes(
      textosIdsActuales.map((id) => ({
        fuente: textos[id]?.fuente ?? "roboto",
        peso: textos[id]?.peso,
      })),
    ).then(() => {
      if (vivo) setFuentesTick((c) => c + 1);
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaFuentesTextos]);

  // Tamaños naturales de cada foto (para el clamp de cobertura).
  useEffect(() => {
    let vivo = true;
    for (const [zid, f] of Object.entries(fotos)) {
      if (naturales[zid] || !f.src) continue;
      cargarNatural(f.src).then((tam) => {
        if (vivo && tam && tam.w > 0) {
          setNaturalesPorPagina((prev) => {
            const dePagina = prev[paginaActual] ?? {};
            if (dePagina[zid]) return prev;
            return {
              ...prev,
              [paginaActual]: { ...dePagina, [zid]: tam },
            };
          });
        }
      });
    }
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paginaActual, Object.values(fotos).map((f) => f.src).join("|")]);

  // Revoca objectURLs al reemplazar o desmontar (todas las páginas).
  const fotosRef = useRef(fotosPorPagina);
  useEffect(() => {
    fotosRef.current = fotosPorPagina;
  });
  useEffect(() => {
    return () => {
      for (const porZona of Object.values(fotosRef.current)) {
        for (const f of Object.values(porZona)) {
          if (f.src.startsWith("blob:")) {
            try {
              URL.revokeObjectURL(f.src);
            } catch {
              /* noop */
            }
          }
        }
      }
    };
  }, []);

  function textoBasePara(pagina: number, id: string): AjusteTexto {
    const ajustados = textosPorPagina[pagina] ?? {};
    const medido = defectosPorPagina[pagina]?.textos[id];
    return (
      ajustados[id] ?? {
        contenido: medido?.contenido ?? "",
        tamano: medido?.tamano ?? 16,
        color: medido?.color ? aHex(medido.color) : "#1d1d1b",
        fuente: FUENTE_DEFAULT,
      }
    );
  }
  function textoBase(id: string): AjusteTexto {
    return textoBasePara(paginaActual, id);
  }

  // Lo que pinta cada canvas: fotos + textos ya resueltos (shrink aplicado).
  // SPEC 2.5: por página (la oculta también pinta: el PDF la rasteriza).
  // fuentesTick fuerza re-resolver con la métrica real tras cargar fuentes
  // (SPEC 2.4 paso 4); no se lee en el cuerpo a propósito.
  const canvasPorPagina: Record<
    number,
    {
      imagenes: ImagenEnZona[];
      textos: TextoEnPlantilla[];
      referencias: Record<string, ReferenciaTexto>;
    }
  > =
    useMemo(() => {
    const salida: Record<
      number,
      {
        imagenes: ImagenEnZona[];
        textos: TextoEnPlantilla[];
        referencias: Record<string, ReferenciaTexto>;
      }
    > = {};
    for (const pg of paginas) {
      if (pg.motivoAviso) continue;
      const defs = defectosPorPagina[pg.pagina] ?? null;
      const fts = fotosPorPagina[pg.pagina] ?? {};
      const txs = textosPorPagina[pg.pagina] ?? {};
      const refs: Record<string, ReferenciaTexto> = {};
      if (defs) {
        for (const [id, d] of Object.entries(defs.textos)) {
          refs[id] = {
            tamanoDefault: d.tamano,
            anchoSlot: d.ancho,
            peso: d.peso,
            estilo: d.estilo,
          };
        }
      }
      const basePara = (id: string): AjusteTexto => {
        const medido = defs?.textos[id];
        return (
          txs[id] ?? {
            contenido: medido?.contenido ?? "",
            tamano: medido?.tamano ?? 16,
            color: medido?.color ? aHex(medido.color) : "#1d1d1b",
            fuente: FUENTE_DEFAULT,
          }
        );
      };
      salida[pg.pagina] = {
        imagenes: Object.entries(fts).map(([zonaId, f]) => ({
          zonaId,
          src: f.src,
          x: f.ajuste.x,
          y: f.ajuste.y,
          escala: f.ajuste.escala,
        })),
        textos: pg.textosIds.map((id) => {
          const base = basePara(id);
          const ref = refs[id] ?? null;
          const r = resolverTexto(base, ref);
          const pos = normalizarPosicionTexto(base);
          const tamDefault = ref?.tamanoDefault ?? null;
          return {
            id,
            contenido: r.mostrado,
            tamano: r.tamanoEfectivo,
            color: base.color,
            fuente: base.fuente,
            // SPEC 2.4 paso 4: el peso viaja al canvas (el default 400 lo
            // pone el Paso 5; aquí solo se propaga lo que trae el ajuste).
            peso: base.peso,
            x: pos.x,
            y: pos.y,
            // SPEC 2.1 paso 4: base + rango de la manija.
            tamanoBase: base.tamano,
            minTamano:
              tamDefault != null && tamDefault > 0
                ? Math.round(PISO_AUTO_SHRINK * tamDefault)
                : undefined,
            maxTamano:
              tamDefault != null && tamDefault > 0
                ? Math.round(TECHO_ESCALA_TEXTO * tamDefault)
                : undefined,
          };
        }),
        referencias: refs,
      };
    }
    return salida;
    // fuentesTick no se lee en el cuerpo: fuerza re-resolver con la métrica
    // real tras cargar fuentes (SPEC 2.4 paso 4).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    paginas,
    fotosPorPagina,
    textosPorPagina,
    defectosPorPagina,
    fuentesTick,
  ]);

  const imagenesCanvas = canvasPorPagina[paginaActual]?.imagenes ?? [];
  const textosCanvas = canvasPorPagina[paginaActual]?.textos ?? [];
  const referencias = canvasPorPagina[paginaActual]?.referencias ?? {};

  function imagenesCanvasPara(pagina: number): ImagenEnZona[] {
    return canvasPorPagina[pagina]?.imagenes ?? [];
  }

  function textosCanvasPara(pagina: number): TextoEnPlantilla[] {
    return canvasPorPagina[pagina]?.textos ?? [];
  }

  /** Handler de defectos con página explícita (no depende del visible). */
  function crearDefectosHandler(pagina: number) {
    return (d: DefectosPlantilla) =>
      setDefectosPorPagina((prev) => {
        if (prev[pagina] === d) return prev;
        return { ...prev, [pagina]: d };
      });
  }

  /** SPEC 2.5: cambiar de página limpia la selección (no cruza de página). */
  function cambiarPagina(pagina: number) {
    if (pagina === paginaActual) return;
    setPaginaActual(pagina);
    setZonaSeleccionada(null);
    setTextoSeleccionado(null);
    setFalloDrop(null);
  }

  /** Cambio de un texto desde su panel (SPEC 2.1). */
  function cambiarTexto(id: string, parcial: Partial<AjusteTexto>) {
    const final: AjusteTexto = { ...textoBase(id), ...parcial };
    setTextosPorPagina((prev) => ({
      ...prev,
      [paginaActual]: { ...(prev[paginaActual] ?? {}), [id]: final },
    }));
  }

  function cambiarAjuste(zonaId: string, ajuste: AjusteImagen) {
    setFotosPorPagina((prev) => {
      const dePagina = prev[paginaActual] ?? {};
      const f = dePagina[zonaId];
      if (!f) return prev;
      return {
        ...prev,
        [paginaActual]: {
          ...dePagina,
          [zonaId]: {
            ...f,
            ajuste: limitarAjuste(
              ajuste,
              naturales[zonaId] ?? null,
              defectos?.cajas[zonaId]
                ? {
                    w: defectos.cajas[zonaId].w,
                    h: defectos.cajas[zonaId].h,
                  }
                : null,
            ),
          },
        },
      };
    });
  }

  function alArrastrarZona(zonaId: string, dx: number, dy: number) {
    const f = fotos[zonaId];
    if (!f) {
      setZonaSeleccionada(zonaId);
      setTextoSeleccionado(null);
      return;
    }
    // SPEC 2.2: arrastrar la foto elige su zona (sustituye el panel).
    setZonaSeleccionada(zonaId);
    setTextoSeleccionado(null);
    cambiarAjuste(zonaId, { ...f.ajuste, x: f.ajuste.x + dx, y: f.ajuste.y + dy });
  }

  /** SPEC 2.1 paso 3: el canvas ya recortó el delta a la caja del grupo. */
  function alArrastrarTexto(id: string, dx: number, dy: number) {
    // SPEC 2.2: arrastrar el texto lo elige (sustituye el panel).
    setTextoSeleccionado(id);
    setZonaSeleccionada(null);
    // Base del render actual; el updater acumula aunque React no haya
    // pintado entre gestos (prev gana si ya existe).
    const base = textoBase(id);
    setTextosPorPagina((prev) => {
      const dePagina = prev[paginaActual] ?? {};
      const actual = dePagina[id] ?? base;
      const pos = normalizarPosicionTexto(actual);
      return {
        ...prev,
        [paginaActual]: {
          ...dePagina,
          [id]: { ...actual, x: pos.x + dx, y: pos.y + dy },
        },
      };
    });
  }

  function alArchivo(zonaId: string, file: File) {
    setZonaSeleccionada(zonaId);
    setTextoSeleccionado(null);
    // SPEC 2.3 paso 3: cargar válido limpia el error del drop.
    setFalloDrop(null);
    const anterior = fotos[zonaId];
    if (anterior?.src.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(anterior.src);
      } catch {
        /* noop */
      }
    }
    const src = URL.createObjectURL(file);
    setFotosPorPagina((prev) => {
      const dePagina = prev[paginaActual] ?? {};
      return {
        ...prev,
        [paginaActual]: {
          ...dePagina,
          [zonaId]: {
            src,
            file,
            r2Key: dePagina[zonaId]?.r2Key ?? null,
            ajuste: { ...AJUSTE_CENTRADO },
          },
        },
      };
    });
    cargarNatural(src).then((tam) => {
      if (tam && tam.w > 0) {
        setNaturalesPorPagina((prev) => ({
          ...prev,
          [paginaActual]: { ...(prev[paginaActual] ?? {}), [zonaId]: tam },
        }));
      }
    });
  }

  // SPEC 2.3 paso 3: drop externo. Misma vía que el botón: válido →
  // `alArchivo` (reemplaza y resetea encuadre) + selecciona; inválido →
  // fija `falloDrop` + selecciona. Solo el primer archivo (el canvas ya
  // tomó `files[0]` e ignoró el resto).
  function alArchivoExterno(zonaId: string, file: File) {
    const fallo = validarArchivoImagen(file);
    if (!fallo) {
      alArchivo(zonaId, file);
      return;
    }
    setZonaSeleccionada(zonaId);
    setTextoSeleccionado(null);
    setFalloDrop({ zonaId, codigo: fallo });
  }

  // SPEC 2.3 paso 4: quitar la foto (ex-Restablecer). Revoca el blob si lo
  // hay, borra foto y natural (si no, una foto nueva reutilizaría el tamaño
  // natural de la anterior), mantiene la zona seleccionada. Si la foto ya
  // estaba guardada, su `r2Key` queda huérfana (se excluye del próximo
  // Guardar; sin borrado en R2).
  function alQuitarFoto(zonaId: string) {
    const anterior = fotos[zonaId];
    if (anterior?.src.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(anterior.src);
      } catch {
        /* noop */
      }
    }
    setFotosPorPagina((prev) => {
      const dePagina = prev[paginaActual] ?? {};
      if (!dePagina[zonaId]) return prev;
      const siguiente = { ...dePagina };
      delete siguiente[zonaId];
      return { ...prev, [paginaActual]: siguiente };
    });
    setNaturalesPorPagina((prev) => {
      const dePagina = prev[paginaActual] ?? {};
      if (!dePagina[zonaId]) return prev;
      const siguiente = { ...dePagina };
      delete siguiente[zonaId];
      return { ...prev, [paginaActual]: siguiente };
    });
    setZonaSeleccionada(zonaId);
    setTextoSeleccionado(null);
    setFalloDrop((prev) => (prev?.zonaId === zonaId ? null : prev));
  }

  /** SPEC 2.1 paso 5: vuelve a x=0, y=0 y base del SVG. */
  function restablecerTexto(id: string) {
    const d = defectos?.textos[id];
    setTextosPorPagina((prev) => {
      const dePagina = prev[paginaActual] ?? {};
      const actual = dePagina[id];
      if (!actual) return prev;
      const siguiente: AjusteTexto = { ...actual };
      delete siguiente.x;
      delete siguiente.y;
      if (d && d.tamano > 0) siguiente.tamano = d.tamano;
      return { ...prev, [paginaActual]: { ...dePagina, [id]: siguiente } };
    });
  }

  /** SPEC 2.1 paso 4: el canvas ya recortó la base al rango enviado. */
  function alEscalarTexto(id: string, tamano: number) {
    if (!Number.isFinite(tamano)) return;
    const tamDefault = referencias[id]?.tamanoDefault ?? null;
    const techo =
      tamDefault != null && tamDefault > 0
        ? TECHO_ESCALA_TEXTO * tamDefault
        : tamano;
    cambiarTexto(id, { tamano: Math.min(techo, Math.max(1, tamano)) });
  }

  async function guardar() {
    setError(null);
    setCopiado(false);
    setGuardando(true);
    try {
      // SPEC 2.5: serializa ambas páginas (el PUT last-write-wins reemplaza
      // todo: guardar solo la visible borraría la otra). `uploads` sin
      // cambios: la key con UUID ya es única entre páginas.
      const imagenesPayload: {
        zonaId: string;
        r2Key: string;
        pagina: number;
      }[] = [];
      const fotosTrasSubida: Record<number, Record<string, FotoEstado>> = {
        ...fotosPorPagina,
      };
      for (const pg of paginas) {
        if (pg.motivoAviso) continue;
        const estadoFotos = { ...(fotosTrasSubida[pg.pagina] ?? {}) };
        for (const zid of pg.zonas) {
          const f = estadoFotos[zid];
          if (!f) continue;
          let r2Key = f.r2Key;
          if (f.file) {
            const forma = new FormData();
            forma.append("file", f.file);
            forma.append("productCode", productCode);
            forma.append("zonaId", zid);
            const res = await fetch("/api/uploads", {
              method: "POST",
              body: forma,
            });
            if (res.status === 429) throw new Error("limite");
            if (!res.ok) throw new Error("red");
            const datos = (await res.json()) as { key: string };
            r2Key = datos.key;
            if (f.src.startsWith("blob:")) {
              try {
                URL.revokeObjectURL(f.src);
              } catch {
                /* noop */
              }
            }
            estadoFotos[zid] = {
              src: `/api/r2/${r2Key}`,
              file: null,
              r2Key,
              ajuste: f.ajuste,
            };
          }
          if (r2Key) imagenesPayload.push({ zonaId: zid, r2Key, pagina: pg.pagina });
        }
        fotosTrasSubida[pg.pagina] = estadoFotos;
      }
      // 2. Guarda ajustes (last-write-wins por token, ambas páginas).
      const cuerpo = {
        productCode,
        imagenes: imagenesPayload,
        ajustes: {
          imagenes: paginas.flatMap((pg) =>
            pg.motivoAviso
              ? []
              : Object.entries(fotosTrasSubida[pg.pagina] ?? {}).map(
                  ([zonaId, f]) => ({
                    zonaId,
                    x: f.ajuste.x,
                    y: f.ajuste.y,
                    escala: f.ajuste.escala,
                    pagina: pg.pagina,
                  }),
                ),
          ),
          textos: paginas.flatMap((pg) =>
            pg.motivoAviso
              ? []
              : pg.textosIds.map((id) => ({
                  id,
                  ...textoBasePara(pg.pagina, id),
                  pagina: pg.pagina,
                })),
          ),
        },
      };
      let tok = token;
      if (tok) {
        const res = await fetch("/api/customizations", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tokenSecreto: tok, ...cuerpo }),
        });
        if (!res.ok) throw new Error("red");
      } else {
        const res = await fetch("/api/customizations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cuerpo),
        });
        if (!res.ok) throw new Error("red");
        const datos = (await res.json()) as { tokenSecreto: string };
        tok = datos.tokenSecreto;
        setToken(tok);
        try {
          window.history.replaceState(
            null,
            "",
            `/${locale}/editor/${productCode}?t=${tok}`,
          );
        } catch {
          /* noop */
        }
      }
      setFotosPorPagina(fotosTrasSubida);
    } catch (e) {
      setError(e instanceof Error && e.message === "limite" ? "errorLimite" : "errorRed");
    } finally {
      setGuardando(false);
    }
  }

  async function descargar() {
    setError(null);
    // SPEC 2.5 paso 7: PDF único con todas las páginas (cada una con sus
    // medidas declaradas). Solo páginas cargadas (sin aviso).
    const paraPdf: PaginaPdf[] = [];
    for (const pg of paginas) {
      if (pg.motivoAviso || !pg.svgText) continue;
      const svg = svgRefPorPagina[pg.pagina]?.current;
      if (!svg) {
        setError("errorPdf");
        return;
      }
      paraPdf.push({ svg, anchoMm: pg.anchoMm, altoMm: pg.altoMm });
    }
    if (paraPdf.length === 0) {
      setError("errorPdf");
      return;
    }
    setDescargando(true);
    try {
      await descargarPdfDeVariasPaginas(paraPdf, `${productCode}.pdf`);
    } catch {
      setError("errorPdf");
    } finally {
      setDescargando(false);
    }
  }

  async function copiarEnlace(enlace: string) {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  // SPEC 2.5: Guardar serializa ambas páginas, así que espera a medirlas
  // todas (sin medir, los textos caerían al tamano fallback de 16).
  const listo =
    !datosActual?.motivoAviso &&
    paginas
      .filter((p) => !p.motivoAviso)
      .every((p) => defectosPorPagina[p.pagina] != null);
  // Una página con aviso no se serializa: si el servidor guardara datos de
  // ella, el PUT los borraría. Se bloquea Guardar hasta que cargue.
  const algunaAviso = paginas.some((p) => p.motivoAviso);
  const enlace = token ? `/${locale}/editor/${productCode}?t=${token}` : null;
  // SPEC 2.2: el flotante solo refleja la selección del canvas.
  const areaVisible: string | null = textoSeleccionado ?? zonaSeleccionada;
  /** Cierra el flotante limpiando la selección; los ajustes se conservan. */
  function cerrarPanel() {
    setTextoSeleccionado(null);
    setZonaSeleccionada(null);
    // SPEC 2.3 paso 3: cerrar limpia el error del drop.
    setFalloDrop(null);
  }
  // SPEC 2.2 paso 4: al abrir el flotante el foco va al × (solo al abrir,
  // no al cambiar de área); Escape lo cierra y devuelve el foco al canvas.
  const abiertoAntes = useRef(false);
  useEffect(() => {
    const abierto = areaVisible != null;
    if (abierto && !abiertoAntes.current) cerrarRef.current?.focus();
    abiertoAntes.current = abierto;
  }, [areaVisible]);
  useEffect(() => {
    if (areaVisible == null) return;
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cerrarPanel();
        lienzoRef.current?.focus();
      }
    };
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, [areaVisible]);
  // Etiqueta del diálogo: misma que el panel mostrado.
  const etiquetaPanel =
    textoSeleccionado != null
      ? t("panelTexto.titulo", {
          clave: textoSeleccionado.replace("texto-editable-", ""),
        })
      : zonaSeleccionada != null
        ? t("panelImagen.titulo", {
            zona: zonaSeleccionada.replace("zona-editable-", ""),
          })
        : "";

  const acciones = (
    <section
      aria-label={t("shell.acciones")}
      className="flex flex-wrap items-center gap-2 rounded border border-neutral-200 bg-white p-3"
    >
      <button
        type="button"
        onClick={guardar}
        disabled={guardando || !listo || algunaAviso}
        className="rounded bg-black px-4 py-2.5 font-bold text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {t(guardando ? "shell.guardando" : "shell.guardar")}
      </button>
      <button
        type="button"
        onClick={descargar}
        disabled={descargando || !listo}
        className="rounded border border-neutral-300 bg-white px-4 py-2.5 font-bold hover:bg-neutral-50 disabled:opacity-50"
      >
        {t(descargando ? "shell.descargando" : "shell.descargar")}
      </button>

      {enlace ? (
        <div className="rounded bg-green-50 px-3 py-2 text-sm">
          <p>{t("shell.enlaceListo")}</p>
          <p className="mt-1 font-mono break-all text-xs">{enlace}</p>
          <button
            type="button"
            onClick={() => copiarEnlace(`${window.location.origin}${enlace}`)}
            className="mt-2 rounded border border-neutral-300 bg-white px-3 py-1 text-sm"
          >
            {t(copiado ? "shell.copiado" : "shell.copiar")}
          </button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="rounded bg-red-100 px-3 py-2 text-sm text-red-800">
          {t(`shell.${error}`)}
        </p>
      ) : null}
    </section>
  );

  return (
    <div className="mt-6 flex min-w-0 flex-col gap-6">
      {/* SPEC 2.2 paso 1: acciones siempre visibles en barra sticky arriba. */}
      <div className="sticky top-0 z-30 bg-white/95 py-2 backdrop-blur">
        {acciones}
      </div>
      {/* SPEC 2.5: selector de página (solo si hay 2; etiqueta en el Paso 8). */}
      {paginas.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {paginas.map((pg) => (
            <button
              key={pg.pagina}
              type="button"
              onClick={() => cambiarPagina(pg.pagina)}
              aria-pressed={pg.pagina === paginaActual}
              className={
                pg.pagina === paginaActual
                  ? "rounded bg-black px-4 py-2 text-sm font-bold text-white"
                  : "rounded border border-neutral-300 bg-white px-4 py-2 text-sm font-bold hover:bg-neutral-50"
              }
            >
              {t("pagina.etiqueta", { n: pg.pagina })}
            </button>
          ))}
        </div>
      ) : null}
      <div
        ref={lienzoRef}
        tabIndex={-1}
        className="relative min-w-0 outline-none"
      >
        {/* SPEC 2.5: ambas páginas montadas (cada una con su svgRef para el
            PDF del Paso 7). La inactiva va invisible pero con layout: con
            display:none no mediría (getBBox) ni rasterizaría. */}
        {paginas.map((pg) =>
          pg.motivoAviso ? (
            pg.pagina === paginaActual ? (
              <p
                key={pg.pagina}
                role="status"
                className="rounded bg-amber-100 px-3 py-2 text-sm"
              >
                {t(`${claveAviso(pg.motivoAviso)}Titulo`)} —{" "}
                {t(`${claveAviso(pg.motivoAviso)}Desc`, {
                  code: productCode,
                })}
              </p>
            ) : null
          ) : pg.svgText ? (
            <div
              key={pg.pagina}
              aria-hidden={pg.pagina !== paginaActual}
              className={
                pg.pagina === paginaActual
                  ? "min-w-0"
                  : "invisible absolute top-0 left-0 -z-10 h-0 w-full overflow-hidden"
              }
            >
              <PlantillaSvg
                svgText={pg.svgText}
                imagenes={
                  pg.pagina === paginaActual
                    ? imagenesCanvas
                    : imagenesCanvasPara(pg.pagina)
                }
                textos={
                  pg.pagina === paginaActual
                    ? textosCanvas
                    : textosCanvasPara(pg.pagina)
                }
                zonaSeleccionada={
                  pg.pagina === paginaActual ? zonaSeleccionada : null
                }
                onSeleccionarZona={(z) => {
                  // SPEC 2.2: elegir un área sustituye el panel.
                  setZonaSeleccionada(z);
                  setTextoSeleccionado(null);
                  // SPEC 2.3 paso 3: cambiar de selección limpia el drop.
                  setFalloDrop(null);
                }}
                onArrastrarZona={alArrastrarZona}
                textoSeleccionado={
                  pg.pagina === paginaActual ? textoSeleccionado : null
                }
                onSeleccionarTexto={(id) => {
                  setTextoSeleccionado(id);
                  if (id != null) setZonaSeleccionada(null);
                  // SPEC 2.3 paso 3: cambiar de selección limpia el drop.
                  setFalloDrop(null);
                }}
                onDeseleccionar={cerrarPanel}
                onArrastrarTexto={alArrastrarTexto}
                onEscalarTexto={alEscalarTexto}
                onArchivoExterno={alArchivoExterno}
                onDefectos={crearDefectosHandler(pg.pagina)}
                svgRef={svgRefPorPagina[pg.pagina]}
              />
            </div>
          ) : null,
        )}
      </div>

      {/* SPEC 2.2 paso 2: sin selección, hint; con selección, flotante. */}
      {areaVisible == null ? (
        <p role="status" className="rounded border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-600">
          {t("panel.hint")}
        </p>
      ) : (
        <div
          role="dialog"
          aria-label={etiquetaPanel}
          className="fixed bottom-4 left-1/2 z-40 max-h-[60vh] w-[min(92vw,24rem)] -translate-x-1/2 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-3 shadow-xl lg:bottom-auto lg:left-auto lg:right-4 lg:top-1/2 lg:w-80 lg:max-h-[80vh] lg:translate-x-0 lg:-translate-y-1/2"
        >
          <div className="mb-2 flex justify-end">
            <button
              ref={cerrarRef}
              type="button"
              onClick={cerrarPanel}
              aria-label={t("panel.cerrar")}
              className="rounded border border-neutral-300 bg-white px-2.5 py-1 text-sm font-bold hover:bg-neutral-50"
            >
              ×
            </button>
          </div>
          {textoSeleccionado != null ? (
            <PanelTexto
              key={`${paginaActual}:${textoSeleccionado}`}
              textoId={textoSeleccionado}
              ajuste={textoBase(textoSeleccionado)}
              referencia={referencias[textoSeleccionado] ?? null}
              onCambio={cambiarTexto}
              onRestablecer={restablecerTexto}
            />
          ) : zonaSeleccionada != null ? (
            <PanelImagen
              key={`${paginaActual}:${zonaSeleccionada}`}
              zonaId={zonaSeleccionada}
              src={fotos[zonaSeleccionada]?.src ?? null}
              ajuste={fotos[zonaSeleccionada]?.ajuste ?? { ...AJUSTE_CENTRADO }}
              caja={
                defectos?.cajas[zonaSeleccionada]
                  ? {
                      w: defectos.cajas[zonaSeleccionada].w,
                      h: defectos.cajas[zonaSeleccionada].h,
                    }
                  : null
              }
              natural={naturales[zonaSeleccionada] ?? null}
              onCambio={cambiarAjuste}
              onArchivo={alArchivo}
              falloDrop={
                falloDrop?.zonaId === zonaSeleccionada ? falloDrop.codigo : null
              }
              onQuitar={alQuitarFoto}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
