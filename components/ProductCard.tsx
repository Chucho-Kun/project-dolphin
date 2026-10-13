import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { publicUrlFor } from "@/lib/storage";
import ProductImage from "@/components/ProductImage";
import type { Product } from "@/db/schema";

// Provisional hasta el spec de precios: la tabla `products` no tiene
// columnas de precio, así que todas las cards muestran estos valores.
const PRECIOS_PROVISIONALES = {
  porDefecto: { mx: 116.32, anterior_mx: 155.09, descuento: "25 %" },
} as const;

export default async function ProductCard({
  product,
  locale,
}: {
  product: Product;
  locale: string;
}) {
  const t = await getTranslations("home");
  const isEs = locale === "es";
  const title = isEs ? product.tituloEs : product.tituloEn;
  const slug = isEs ? product.slugEs : product.slugEn;
  const photoKey = product.fotoAbiertaKey ?? product.fotoCerradaKey;

  const precio = PRECIOS_PROVISIONALES.porDefecto;
  // Imagen local de prueba según el spec (cards sin foto en R2).
  const fallbackSrc = "/images/product-example.webp";
  const photoSrc =
    photoKey != null ? publicUrlFor(photoKey) : fallbackSrc;

  return (
    <li className="dolphin-card">
      <Link
        href={`/templates/${slug}`}
        className="block"
        aria-label={`${t("viewTemplate")}: ${title}`}
      >
        <div className="relative aspect-square bg-neutral-100">
          <ProductImage src={photoSrc} fallbackSrc={fallbackSrc} alt={title} />
          {product.esGratis ? (
            <span className="absolute left-2 top-2 rounded bg-green-600 px-2 py-0.5 text-xs font-bold text-white">
              {t("free")}
            </span>
          ) : null}
        </div>
        <div className="px-3 py-2">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="dolphin-price mt-1 text-sm">
            MX${precio.mx.toFixed(2)}
          </p>
          <p className="mt-0.5 text-xs text-neutral-600">
            <span className="dolphin-price-old">
              MX${precio.anterior_mx.toFixed(2)}
            </span>{" "}
            ({precio.descuento} de descuento)
          </p>
        </div>
      </Link>
    </li>
  );
}
