import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

// Provisional hasta el spec de precios: reutiliza los valores del SPEC 1.2.
// La tabla `products` no tiene columnas de precio.
const PRECIOS_PROVISIONALES = {
  porDefecto: { mx: 116.32, anterior_mx: 155.09, descuento: "25 %" },
} as const;

type ProductInfoProps = {
  title: string;
  description: string;
  code: string;
  esGratis: boolean;
};

// SPEC 1.3: columna de información del producto (solo visual salvo
// `Editar diseño`, que es un Link real al editor del `code` actual).
// `Añadir al carrito` y wishlist son solo visuales: no navegan ni lanzan error.
// Textos de UI salen de `messages/{es,en}.json` (claves `product.info.*`,
// `product.detalles.*`); se añaden en el Paso 7 del plan.
export default async function ProductInfo({
  title,
  description,
  code,
  esGratis,
}: ProductInfoProps) {
  const t = await getTranslations("product");
  const precio = PRECIOS_PROVISIONALES.porDefecto;

  const archivos = [
    t("detalles.archivoPdf"),
    t("detalles.archivoSvg"),
    t("detalles.archivoDxf"),
    t("detalles.archivoInstrucciones"),
  ];

  return (
    <div className="w-full max-w-full">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="dolphin-price text-2xl">
          MX${precio.mx.toFixed(2)}
        </p>
        <p className="text-sm text-neutral-600">
          <span className="dolphin-price-old">
            MX${precio.anterior_mx.toFixed(2)}
          </span>{" "}
          <span className="font-semibold text-green-700">
            -{precio.descuento}
          </span>
        </p>
      </div>
      <p className="mt-1 text-xs text-neutral-600">{t("info.oferta")}</p>

      <h1 className="mt-3 wrap-break-words text-3xl font-bold">{title}</h1>
      <p className="mt-2 wrap-break-words text-neutral-700">{description}</p>

      <p className="mt-3 text-sm text-neutral-600">
        {t("info.vendidoPor")}{" "}
        <span className="font-semibold text-neutral-800">Dolphin</span>
      </p>

      {esGratis ? (
        <p className="mt-3">
          <span className="inline-block rounded bg-green-600 px-2 py-0.5 text-xs font-bold text-white">
            {t("free")}
          </span>
        </p>
      ) : null}

      <div className="mt-5 flex max-w-full flex-wrap items-center gap-3">
        <Link
          href={`/editor/${code}`}
          className="inline-block rounded-lg bg-black px-6 py-3 font-bold text-white hover:bg-neutral-800"
        >
          {t("info.editar")}
        </Link>
        <button
          type="button"
          aria-disabled="true"
          title={t("info.proximamente")}
          className="cursor-not-allowed rounded-lg border border-neutral-300 bg-neutral-100 px-6 py-3 font-bold text-neutral-500"
        >
          {t("info.anadirCarrito")}
        </button>
        <button
          type="button"
          aria-disabled="true"
          title={t("info.proximamente")}
          aria-label={t("info.favorito")}
          className="flex h-12 w-12 cursor-not-allowed items-center justify-center rounded-full border border-neutral-300 bg-white text-xl text-neutral-500"
        >
          <span aria-hidden="true">♡</span>
        </button>
      </div>

      <p className="mt-4">
        <span className="inline-block rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-semibold text-neutral-700">
          PDF + SVG + DXF
        </span>
      </p>

      <details className="dolphin-card mt-6 max-w-full px-4 py-3">
        <summary className="cursor-pointer font-semibold">
          {t("detalles.titulo")}
        </summary>
        <p className="mt-2 wrap-break-words text-sm text-neutral-700">
          {description}
        </p>
        <p className="mt-3 text-sm font-semibold">
          {t("detalles.archivosTitulo")}
        </p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-neutral-700">
          {archivos.map((archivo) => (
            <li key={archivo}>{archivo}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
