import { getTranslations } from "next-intl/server";

// SPEC 1.3: bloque de reseñas como MUESTRA ETIQUETADA. Mantiene el estado
// vacío real + etiqueta visible + 3 reseñas fijas por i18n. Lleva
// `data-muestra="true"` y queda excluido de `AggregateRating`/rich snippets.
// Textos de UI salen de `messages/{es,en}.json` (claves `product.resenas.*`,
// `product.muestra.*`); se añaden en el Paso 7 del plan.
export default async function ProductReviews() {
  const t = await getTranslations("product");

  const resenas = ["r1", "r2", "r3"].map((id) => ({
    id,
    nombre: t(`resenas.${id}.nombre`),
    fecha: t(`resenas.${id}.fecha`),
    texto: t(`resenas.${id}.texto`),
    producto: t(`resenas.${id}.producto`),
  }));

  return (
    <section
      data-muestra="true"
      aria-label={t("resenas.titulo")}
      className="mt-12 w-full max-w-full"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold">{t("resenas.titulo")}</h2>
        <span className="inline-block rounded-full border border-amber-500 bg-amber-50 px-3 py-0.5 text-xs font-semibold text-amber-800">
          {t("muestra.etiqueta")}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="flex items-center gap-2">
          <span aria-hidden="true" className="text-lg text-amber-500">
            ★★★★★
          </span>
          <span className="font-bold">4.8 (316)</span>
        </p>
        <button
          type="button"
          aria-disabled="true"
          title={t("info.proximamente")}
          className="cursor-not-allowed rounded-lg border border-neutral-300 bg-white px-4 py-1.5 text-sm font-semibold text-neutral-500"
        >
          {t("resenas.ordenar")} ▾
        </button>
      </div>

      <p className="mt-3 text-sm text-neutral-600">{t("resenas.vacio")}</p>

      <ul className="mt-4 grid max-w-full gap-4 md:grid-cols-3">
        {resenas.map((resena) => (
          <li
            key={resena.id}
            className="dolphin-card min-w-0 max-w-full px-4 py-3"
          >
            <p aria-hidden="true" className="text-amber-500">
              ★★★★★
            </p>
            <p className="mt-2 break-words text-sm text-neutral-800">
              {resena.texto}
            </p>
            <p className="mt-3 text-sm font-semibold">{resena.nombre}</p>
            <p className="text-xs text-neutral-500">
              {resena.fecha} · {resena.producto}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
