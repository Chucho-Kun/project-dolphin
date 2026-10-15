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
  normalizarPosicionTexto,
  PISO_AUTO_SHRINK,
  resolverTexto,
  TECHO_ESCALA_TEXTO,
  type AjusteTexto,
  type ReferenciaTexto,
} from "@/lib/texto";
import { descargarPdfDelSvg } from "@/lib/pdf";

// components/editor/EditorShell.tsx — Layout canvas+paneles (SPEC 02 Paso 7).
//
// Guardar: sube pendientes a R2, luego POST (token nuevo + link ?t=) o PUT
// (last-write-wins). Descargar: PDF directo del SVG visible, sin guardar.

export type FotoInicial = {
  zonaId: string;
  src: string;
  r2Key: string | null;
  x: number;
  y: number;
  escala: number;
};

export type TextoInicial = {
  id: string;
  contenido: string;
  tamano: number;
  color: string;
  fuente: string;
  // SPEC 2.1: opcionales (los ?t= viejos no los traen).
  x?: number;
  y?: number;
};

type Props = {
  productCode: string;
  locale: string;
  svgText: string;
  anchoMm: number;
  altoMm: number;
  zonas: string[];
  textosIds: string[];
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

export default function EditorShell({
  productCode,
  locale,
  svgText,
  anchoMm,
  altoMm,
  zonas,
  textosIds,
  fotosIniciales,
  textosIniciales,
  tokenInicial,
}: Props) {
  const t = useTranslations("editor");
  const svgRef = useRef<SVGSVGElement | null>(null);
  // SPEC 2.2 paso 4: foco del diálogo (al abrir → ×; Escape → canvas).
  const cerrarRef = useRef<HTMLButtonElement | null>(null);
  const lienzoRef = useRef<HTMLDivElement | null>(null);

  const [fotos, setFotos] = useState<Record<string, FotoEstado>>(() => {
    const base: Record<string, FotoEstado> = {};
    for (const f of fotosIniciales) {
      base[f.zonaId] = {
        src: f.src,
        file: null,
        r2Key: f.r2Key,
        ajuste: { x: f.x, y: f.y, escala: f.escala },
      };
    }
    return base;
  });
  const [textos, setTextos] = useState<Record<string, AjusteTexto>>(() => {
    const base: Record<string, AjusteTexto> = {};
    for (const tx of textosIniciales) {
      base[tx.id] = {
        contenido: tx.contenido,
        tamano: tx.tamano,
        color: tx.color,
        fuente: tx.fuente,
        // SPEC 2.1: restaura posición si el ?t= la trae.
        ...(typeof tx.x === "number" && Number.isFinite(tx.x) ? { x: tx.x } : {}),
        ...(typeof tx.y === "number" && Number.isFinite(tx.y) ? { y: tx.y } : {}),
      };
    }
    return base;
  });
  const [defectos, setDefectos] = useState<DefectosPlantilla | null>(null);
  // SPEC 2.2: sin selección inicial; el hint manda hasta el primer toque.
  const [zonaSeleccionada, setZonaSeleccionada] = useState<string | null>(null);
  // SPEC 2.1 paso 3: texto seleccionado en el canvas (contorno + gestos).
  const [textoSeleccionado, setTextoSeleccionado] = useState<string | null>(null);
  const [naturales, setNaturales] = useState<Record<string, { w: number; h: number }>>({});
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

  // Tamaños naturales de cada foto (para el clamp de cobertura).
  useEffect(() => {
    let vivo = true;
    for (const [zid, f] of Object.entries(fotos)) {
      if (naturales[zid] || !f.src) continue;
      cargarNatural(f.src).then((tam) => {
        if (vivo && tam && tam.w > 0) {
          setNaturales((prev) => (prev[zid] ? prev : { ...prev, [zid]: tam }));
        }
      });
    }
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Object.values(fotos).map((f) => f.src).join("|")]);

  // Revoca objectURLs al reemplazar o desmontar.
  const fotosRef = useRef(fotos);
  useEffect(() => {
    fotosRef.current = fotos;
  });
  useEffect(() => {
    return () => {
      for (const f of Object.values(fotosRef.current)) {
        if (f.src.startsWith("blob:")) {
          try {
            URL.revokeObjectURL(f.src);
          } catch {
            /* noop */
          }
        }
      }
    };
  }, []);

  const referencias: Record<string, ReferenciaTexto> = useMemo(() => {
    const base: Record<string, ReferenciaTexto> = {};
    if (!defectos) return base;
    for (const [id, d] of Object.entries(defectos.textos)) {
      base[id] = {
        tamanoDefault: d.tamano,
        anchoSlot: d.ancho,
        peso: d.peso,
        estilo: d.estilo,
      };
    }
    return base;
  }, [defectos]);

  function textoBase(id: string): AjusteTexto {
    const d = defectos?.textos[id];
    return (
      textos[id] ?? {
        contenido: d?.contenido ?? "",
        tamano: d?.tamano ?? 16,
        color: d?.color ? aHex(d.color) : "#1d1d1b",
        fuente: "Roboto",
      }
    );
  }

  // Lo que pinta el canvas: fotos + textos ya resueltos (shrink aplicado).
  const imagenesCanvas: ImagenEnZona[] = useMemo(
    () =>
      Object.entries(fotos).map(([zonaId, f]) => ({
        zonaId,
        src: f.src,
        x: f.ajuste.x,
        y: f.ajuste.y,
        escala: f.ajuste.escala,
      })),
    [fotos],
  );
  const firmaTextos = textosIds.join("|");
  const textosCanvas: TextoEnPlantilla[] = useMemo(
    () =>
      textosIds.map((id) => {
        const base = textoBase(id);
        const ref = referencias[id] ?? null;
        const r = resolverTexto(base, ref);
        const pos = normalizarPosicionTexto(base);
        const tamDefault = ref?.tamanoDefault ?? null;
        return {
          id,
          contenido: r.mostrado,
          tamano: r.tamanoEfectivo,
          color: base.color,
          fuente: base.fuente,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [firmaTextos, textos, referencias, defectos],
  );

  /** Cambio de un texto desde su panel (SPEC 2.1). */
  function cambiarTexto(id: string, parcial: Partial<AjusteTexto>) {
    const final: AjusteTexto = { ...textoBase(id), ...parcial };
    setTextos((prev) => ({ ...prev, [id]: final }));
  }

  function cambiarAjuste(zonaId: string, ajuste: AjusteImagen) {
    setFotos((prev) => {
      const f = prev[zonaId];
      if (!f) return prev;
      return {
        ...prev,
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
    setTextos((prev) => {
      const actual = prev[id] ?? base;
      const pos = normalizarPosicionTexto(actual);
      return { ...prev, [id]: { ...actual, x: pos.x + dx, y: pos.y + dy } };
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
    setFotos((prev) => ({
      ...prev,
      [zonaId]: {
        src,
        file,
        r2Key: prev[zonaId]?.r2Key ?? null,
        ajuste: { ...AJUSTE_CENTRADO },
      },
    }));
    cargarNatural(src).then((tam) => {
      if (tam && tam.w > 0) {
        setNaturales((prev) => ({ ...prev, [zonaId]: tam }));
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
    setFotos((prev) => {
      if (!prev[zonaId]) return prev;
      const siguiente = { ...prev };
      delete siguiente[zonaId];
      return siguiente;
    });
    setNaturales((prev) => {
      if (!prev[zonaId]) return prev;
      const siguiente = { ...prev };
      delete siguiente[zonaId];
      return siguiente;
    });
    setZonaSeleccionada(zonaId);
    setTextoSeleccionado(null);
    setFalloDrop((prev) => (prev?.zonaId === zonaId ? null : prev));
  }

  /** SPEC 2.1 paso 5: vuelve a x=0, y=0 y base del SVG. */
  function restablecerTexto(id: string) {
    const d = defectos?.textos[id];
    setTextos((prev) => {
      const actual = prev[id];
      if (!actual) return prev;
      const siguiente: AjusteTexto = { ...actual };
      delete siguiente.x;
      delete siguiente.y;
      if (d && d.tamano > 0) siguiente.tamano = d.tamano;
      return { ...prev, [id]: siguiente };
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
      // 1. Sube a R2 solo las fotos nuevas (las guardadas conservan su key).
      const imagenesPayload: { zonaId: string; r2Key: string }[] = [];
      const fotosTrasSubida: Record<string, FotoEstado> = { ...fotos };
      for (const zid of zonas) {
        const f = fotos[zid];
        if (!f) continue;
        let r2Key = f.r2Key;
        if (f.file) {
          const forma = new FormData();
          forma.append("file", f.file);
          forma.append("productCode", productCode);
          forma.append("zonaId", zid);
          const res = await fetch("/api/uploads", { method: "POST", body: forma });
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
          fotosTrasSubida[zid] = {
            src: `/api/r2/${r2Key}`,
            file: null,
            r2Key,
            ajuste: f.ajuste,
          };
        }
        if (r2Key) imagenesPayload.push({ zonaId: zid, r2Key });
      }
      // 2. Guarda ajustes (last-write-wins por token).
      const cuerpo = {
        productCode,
        imagenes: imagenesPayload,
        ajustes: {
          imagenes: Object.entries(fotosTrasSubida).map(([zonaId, f]) => ({
            zonaId,
            x: f.ajuste.x,
            y: f.ajuste.y,
            escala: f.ajuste.escala,
          })),
          textos: textosIds.map((id) => ({ id, ...textoBase(id) })),
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
      setFotos(fotosTrasSubida);
    } catch (e) {
      setError(e instanceof Error && e.message === "limite" ? "errorLimite" : "errorRed");
    } finally {
      setGuardando(false);
    }
  }

  async function descargar() {
    setError(null);
    const svg = svgRef.current;
    if (!svg) {
      setError("errorPdf");
      return;
    }
    setDescargando(true);
    try {
      await descargarPdfDelSvg(svg, anchoMm, altoMm, `${productCode}.pdf`);
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

  const listo = defectos != null;
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
        disabled={guardando || !listo}
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
      <div ref={lienzoRef} tabIndex={-1} className="min-w-0 outline-none">
        <PlantillaSvg
          svgText={svgText}
          imagenes={imagenesCanvas}
          textos={textosCanvas}
          zonaSeleccionada={zonaSeleccionada}
          onSeleccionarZona={(z) => {
            // SPEC 2.2: elegir un área sustituye el panel (exclusión mutua).
            setZonaSeleccionada(z);
            setTextoSeleccionado(null);
            // SPEC 2.3 paso 3: cambiar de selección limpia el error del drop.
            setFalloDrop(null);
          }}
          onArrastrarZona={alArrastrarZona}
          textoSeleccionado={textoSeleccionado}
          onSeleccionarTexto={(id) => {
            setTextoSeleccionado(id);
            if (id != null) setZonaSeleccionada(null);
            // SPEC 2.3 paso 3: cambiar de selección limpia el error del drop.
            setFalloDrop(null);
          }}
          onDeseleccionar={cerrarPanel}
          onArrastrarTexto={alArrastrarTexto}
          onEscalarTexto={alEscalarTexto}
          onArchivoExterno={alArchivoExterno}
          onDefectos={setDefectos}
          svgRef={svgRef}
        />
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
              key={textoSeleccionado}
              textoId={textoSeleccionado}
              ajuste={textoBase(textoSeleccionado)}
              referencia={referencias[textoSeleccionado] ?? null}
              onCambio={cambiarTexto}
              onRestablecer={restablecerTexto}
            />
          ) : zonaSeleccionada != null ? (
            <PanelImagen
              key={zonaSeleccionada}
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
