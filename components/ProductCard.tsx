import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { publicUrlFor } from "@/lib/storage";
import type { Product } from "@/db/schema";

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

  return (
    <li className="overflow-hidden rounded-lg border bg-white">
      <Link
        href={`/templates/${slug}`}
        className="block"
        aria-label={`${t("viewTemplate")}: ${title}`}
      >
        <div className="relative aspect-square bg-neutral-100">
          {photoKey ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={publicUrlFor(photoKey)}
              alt={title}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : null}
          {product.esGratis ? (
            <span className="absolute left-2 top-2 rounded bg-green-600 px-2 py-0.5 text-xs font-bold text-white">
              {t("free")}
            </span>
          ) : null}
        </div>
        <p className="truncate px-3 py-2 text-sm font-medium">{title}</p>
      </Link>
    </li>
  );
}
