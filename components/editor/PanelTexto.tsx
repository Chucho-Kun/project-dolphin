"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  FUENTES_EDITOR,
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

// components/editor/PanelTexto.tsx — Panel de textos (SPEC 02 Paso 6).
//
// Edita contenido, tamaño, color y fuente (lista fija OFL) de cada
// `texto-editable-<clave>`; lo no marcado no es editable (el panel solo se
// monta por clave marcada). Auto-shrink [60 %, 100 %] del default: al piso
// trunca con elipsis y lo indica de forma visible.

type Props = {
  textoId: string;
  ajuste: AjusteTexto;
  /** Default + slot medidos en el SVG vivo (el shell los provee). */
  referencia: ReferenciaTexto | null;
  onCambio: (id: string, ajuste: AjusteTexto) => void;
  /** SPEC 2.1 paso 5: restablece posición, alineación y base del SVG. */
  onRestablecer: (id: string) => void;
};

export default function PanelTexto({ textoId, ajuste, referencia, onCambio, onRestablecer }: Props) {
  const t = useTranslations("editor");
  const clave = textoId.replace("texto-editable-", "");
  const etiqueta = t("panelTexto.titulo", { clave });

  const resuelto = useMemo(
    () => resolverTexto(ajuste, referencia),
    [ajuste, referencia],
  );

  const tamanoDefault = referencia?.tamanoDefault ?? null;
  const piso = tamanoDefault != null ? Math.round(PISO_AUTO_SHRINK * tamanoDefault) : 8;
  // SPEC 2.1 paso 4: el slider comparte la base con la manija (techo 250 %).
  const techo =
    tamanoDefault != null ? Math.round(TECHO_ESCALA_TEXTO * tamanoDefault) : 72;
  const porcentaje =
    tamanoDefault != null && tamanoDefault > 0
      ? Math.round((resuelto.tamanoEfectivo / tamanoDefault) * 100)
      : null;

  function cambiar(parcial: Partial<AjusteTexto>) {
    const siguiente = { ...ajuste, ...parcial };
    if (tamanoDefault != null) {
      siguiente.tamano = Math.min(
        TECHO_ESCALA_TEXTO * tamanoDefault,
        Math.max(1, siguiente.tamano),
      );
    }
    onCambio(textoId, siguiente);
  }

  // SPEC 2.4 paso 3: selectores por texto (familia + peso). Sin preview: la
  // muestra es el propio canvas. Legado "Roboto" se muestra como "roboto".
  const fuenteId = esFuenteValida(ajuste.fuente)
    ? normalizarFuente(ajuste.fuente)
    : FUENTE_DEFAULT;
  const pesoValor = ajuste.peso === 700 ? "700" : "400";

  return (
    <section aria-label={etiqueta} className="rounded border border-neutral-200 p-3">
      <h3 className="text-sm font-bold">{etiqueta}</h3>

      <label className="mt-2 block text-sm">
        {t("panelTexto.contenido")}
        <input
          type="text"
          value={ajuste.contenido}
          maxLength={500}
          onChange={(e) => cambiar({ contenido: e.target.value })}
          className="mt-1 block w-full rounded border border-neutral-300 px-2 py-1.5"
        />
      </label>

      <label className="mt-2 block text-sm">
        {t("panelTexto.tamano")}
        <span className="ml-2 text-neutral-600 tabular-nums">
          {Math.round(resuelto.tamanoEfectivo)} px
          {porcentaje != null ? ` (${porcentaje} %)` : null}
        </span>
        <input
          type="range"
          min={piso}
          max={Math.max(techo, piso + 1)}
          step={1}
          value={Math.min(Math.max(Math.round(ajuste.tamano), piso), Math.max(techo, piso + 1))}
          disabled={tamanoDefault == null}
          onChange={(e) => cambiar({ tamano: Number(e.target.value) })}
          className="mt-1 block w-full"
        />
      </label>

      <div className="mt-2 flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          {t("panelTexto.color")}
          <span className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(ajuste.color) ? ajuste.color : "#111111"}
              onChange={(e) => cambiar({ color: e.target.value })}
              className="h-9 w-12 cursor-pointer rounded border border-neutral-300 bg-white"
            />
            <span className="font-mono text-xs uppercase">{ajuste.color}</span>
          </span>
        </label>

        <label className="block text-sm">
          {t("panelTexto.fuente")}
          <select
            value={fuenteId}
            onChange={(e) => cambiar({ fuente: e.target.value })}
            className="mt-1 block rounded border border-neutral-300 bg-white px-2 py-1.5"
          >
            {FUENTES_EDITOR.map((f) => (
              <option key={f.id} value={f.id}>
                {f.familia}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          {t("panelTexto.peso")}
          <select
            value={pesoValor}
            onChange={(e) =>
              cambiar({ peso: e.target.value === "700" ? 700 : 400 })
            }
            className="mt-1 block rounded border border-neutral-300 bg-white px-2 py-1.5"
          >
            <option value="400">{t("panelTexto.pesoRegular")}</option>
            <option value="700">{t("panelTexto.pesoBold")}</option>
          </select>
        </label>
      </div>

      {resuelto.truncado ? (
        <p role="status" className="mt-2 rounded bg-amber-100 px-3 py-2 text-sm">
          {t("panelTexto.truncado")}
        </p>
      ) : (
        <p className="mt-2 text-xs text-neutral-500">
          {t("panelTexto.ayuda", { piso: Math.round(PISO_AUTO_SHRINK * 100) })}
        </p>
      )}

      <button
        type="button"
        onClick={() => onRestablecer(textoId)}
        className="mt-2 rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50"
      >
        {t("panelTexto.restablecer")}
      </button>
    </section>
  );
}
