"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AJUSTE_CENTRADO,
  ZOOM_MAX,
  ZOOM_MIN,
  limitarAjuste,
  origenMostrado,
  type AjusteImagen,
  type Caja,
  type TamNatural,
} from "@/lib/encuadre";

// components/editor/PanelImagen.tsx — Panel de imagen por zona (SPEC 02 Paso 5).
//
// Cargar desde el dispositivo (JPG/PNG/WebP, máx 10 MB, validado aquí; el
// servidor revalida en Paso 2), arrastrar para posicionar, zoom por rueda,
// pellizca y botones, reset al auto-encuadre. La subida a R2 ocurre al
// Guardar (shell, Paso 7): aquí se trabaja con objectURL local (sin CORS).
// La imagen nunca sale de su zona: clip del canvas + clamp de cobertura.

export const MAX_BYTES = 10 * 1024 * 1024;
const MIME_VALIDOS = ["image/jpeg", "image/png", "image/webp"] as const;

/** Valida en cliente. Devuelve el código de error i18n o null si vale. */
export function validarArchivoImagen(
  file: File,
): "tipo-no-valido" | "muy-grande" | null {
  const mime = (file.type || "").toLowerCase();
  const nombre = file.name.toLowerCase();
  const extOk = /\.(jpe?g|png|webp)$/.test(nombre);
  if (!((MIME_VALIDOS as readonly string[]).includes(mime) && extOk)) {
    return "tipo-no-valido";
  }
  if (file.size <= 0 || file.size > MAX_BYTES) return "muy-grande";
  return null;
}

type Props = {
  zonaId: string;
  /** objectURL/blob o proxy mismo-origen; null = zona vacía. */
  src: string | null;
  ajuste: AjusteImagen;
  /** Tamaño de la zona en unidades SVG (lo mide el canvas). */
  caja: Caja | null;
  /** Tamaño natural de la foto (lo mide el shell al cargar). */
  natural: TamNatural | null;
  onCambio: (zonaId: string, ajuste: AjusteImagen) => void;
  /** El shell crea el objectURL y guarda el blob para el Guardar. */
  onArchivo: (zonaId: string, file: File) => void;
};

const PASO_ZOOM = 0.2;

export default function PanelImagen({
  zonaId,
  src,
  ajuste,
  caja,
  natural,
  onCambio,
  onArchivo,
}: Props) {
  const t = useTranslations("editor");
  const entradaRef = useRef<HTMLInputElement>(null);
  const vistaRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<"tipo-no-valido" | "muy-grande" | null>(null);
  const puntos = useRef(new Map<number, { x: number; y: number }>());
  const arrastre = useRef<{ px: number; py: number } | null>(null);
  const basePellizca = useRef<{ dist: number; escala: number } | null>(null);

  const numeroZona = zonaId.replace("zona-editable-", "");
  const etiqueta = t("panelImagen.titulo", { zona: numeroZona });

  // Miniatura con la misma matemática del canvas (escala k fija, sin medir).
  let k = 1;
  let mini: { x: number; y: number; w: number; h: number } | null = null;
  let tamMini: { w: number; h: number } | null = null;
  if (caja && caja.w > 0 && caja.h > 0 && natural) {
    k = 160 / Math.max(caja.w, caja.h);
    mini = origenMostrado(natural, caja, ajuste);
    tamMini = { w: caja.w * k, h: caja.h * k };
  }
  const factorMini = k;

  function cambiar(parcial: Partial<AjusteImagen>) {
    onCambio(zonaId, limitarAjuste({ ...ajuste, ...parcial }, natural, caja));
  }

  function elegir() {
    entradaRef.current?.click();
  }

  function alElegirArchivo(file: File | undefined) {
    if (!file) return;
    const fallo = validarArchivoImagen(file);
    setError(fallo);
    if (fallo) return;
    onArchivo(zonaId, file);
  }

  // Rueda = zoom (oyente nativo no pasivo para frenar el scroll).
  useEffect(() => {
    const el = vistaRef.current;
    if (!el || !src) return;
    function rueda(e: WheelEvent) {
      e.preventDefault();
      onCambio(
        zonaId,
        limitarAjuste(
          { ...ajuste, escala: ajuste.escala - e.deltaY * 0.0015 },
          natural,
          caja,
        ),
      );
    }
    el.addEventListener("wheel", rueda, { passive: false });
    return () => el.removeEventListener("wheel", rueda);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, zonaId, ajuste.escala, ajuste.x, ajuste.y, natural, caja]);

  function punteroAbajo(e: React.PointerEvent) {
    if (!src) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    puntos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (puntos.current.size === 1) {
      arrastre.current = { px: e.clientX, py: e.clientY };
      basePellizca.current = null;
    } else if (puntos.current.size === 2) {
      const [a, b] = [...puntos.current.values()];
      basePellizca.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        escala: ajuste.escala,
      };
      arrastre.current = null;
    }
  }

  function punteroMueve(e: React.PointerEvent) {
    if (!puntos.current.has(e.pointerId)) return;
    puntos.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (puntos.current.size === 2) {
      // Pellizca: zoom proporcional.
      const [a, b] = [...puntos.current.values()];
      const base = basePellizca.current;
      if (a && b && base && base.dist > 0) {
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        onCambio(
          zonaId,
          limitarAjuste(
            { ...ajuste, escala: base.escala * (dist / base.dist) },
            natural,
            caja,
          ),
        );
      }
      return;
    }
    const ini = arrastre.current;
    if (!ini) return;
    const dxSvg = (e.clientX - ini.px) / factorMini;
    const dySvg = (e.clientY - ini.py) / factorMini;
    onCambio(
      zonaId,
      limitarAjuste(
        { ...ajuste, x: ajuste.x + dxSvg, y: ajuste.y + dySvg },
        natural,
        caja,
      ),
    );
    arrastre.current = { px: e.clientX, py: e.clientY };
  }

  function punteroArriba(e: React.PointerEvent) {
    puntos.current.delete(e.pointerId);
    if (puntos.current.size < 2) basePellizca.current = null;
    if (puntos.current.size === 0) arrastre.current = null;
  }

  return (
    <section aria-label={etiqueta} className="rounded border border-neutral-200 p-3">
      <h3 className="text-sm font-bold">{etiqueta}</h3>

      <input
        ref={entradaRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        aria-label={t("panelImagen.cargar")}
        onChange={(e) => {
          alElegirArchivo(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {src && mini && tamMini ? (
        <div
          ref={vistaRef}
          className="relative mt-2 cursor-grab touch-none overflow-hidden rounded bg-neutral-100 active:cursor-grabbing"
          style={{ width: tamMini.w, height: tamMini.h, maxWidth: "100%" }}
          onPointerDown={punteroAbajo}
          onPointerMove={punteroMueve}
          onPointerUp={punteroArriba}
          onPointerCancel={punteroArriba}
          role="application"
          aria-label={t("panelImagen.arrastrar")}
          title={t("panelImagen.arrastrar")}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            draggable={false}
            className="absolute max-w-none"
            style={{
              left: mini.x * k,
              top: mini.y * k,
              width: mini.w * k,
              height: mini.h * k,
            }}
          />
        </div>
      ) : (
        <p className="mt-2 rounded border border-dashed border-neutral-300 px-3 py-4 text-sm text-neutral-500">
          {t("panelImagen.vacia")}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={elegir}
          className="rounded bg-black px-3 py-1.5 text-sm font-bold text-white hover:bg-neutral-800"
        >
          {t("panelImagen.cargar")}
        </button>
        <button
          type="button"
          disabled={!src}
          onClick={() => cambiar({ escala: ajuste.escala - PASO_ZOOM })}
          aria-label={t("panelImagen.alejar")}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm font-bold disabled:opacity-40"
        >
          −
        </button>
        <span className="text-sm tabular-nums" aria-live="polite">
          {Math.round(ajuste.escala * 100)} %
        </span>
        <button
          type="button"
          disabled={!src}
          onClick={() => cambiar({ escala: ajuste.escala + PASO_ZOOM })}
          aria-label={t("panelImagen.acercar")}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm font-bold disabled:opacity-40"
        >
          +
        </button>
        <button
          type="button"
          disabled={!src}
          onClick={() => onCambio(zonaId, { ...AJUSTE_CENTRADO })}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-40"
        >
          {t("panelImagen.restablecer")}
        </button>
      </div>

      <p className="mt-2 text-xs text-neutral-500">
        {t("panelImagen.ayuda", { min: ZOOM_MIN, max: ZOOM_MAX })}
      </p>

      {error ? (
        <p role="alert" className="mt-2 rounded bg-red-100 px-3 py-2 text-sm text-red-800">
          {t(error === "muy-grande" ? "panelImagen.errorTamano" : "panelImagen.errorTipo")}
        </p>
      ) : null}
    </section>
  );
}
