import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq, or } from "drizzle-orm";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/lib/db";
import { publicUrlFor } from "@/lib/storage";
import { absoluteUrl } from "@/lib/site";
import { products, type Product } from "@/db/schema";
import type { Locale } from "@/i18n/routing";

export const dynamic = "force-dynamic";

async function findProductBySlug(slug: string): Promise<Product | null> {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(products)
      .where(or(eq(products.slugEs, slug), eq(products.slugEn, slug)))
      .limit(1);
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

type PageParams = { locale: string; slug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const product = await findProductBySlug(slug);
  if (!product) return {};
  const isEs = locale === "es";
  const esUrl = absoluteUrl(`/es/templates/${product.slugEs}`);
  const enUrl = absoluteUrl(`/en/templates/${product.slugEn}`);
  return {
    title: `${isEs ? product.tituloEs : product.tituloEn} | Project Dolphin`,
    description: isEs ? product.descripcionEs : product.descripcionEn,
    alternates: {
      canonical: isEs ? esUrl : enUrl,
      languages: { es: esUrl, en: enUrl, "x-default": esUrl },
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("product");

  const product = await findProductBySlug(slug);
  if (!product) notFound();

  const isEs = locale === "es";
  const title = isEs ? product.tituloEs : product.tituloEn;
  const description = isEs ? product.descripcionEs : product.descripcionEn;
  const photoKey = product.fotoAbiertaKey ?? product.fotoCerradaKey;
  const photoUrl = photoKey ? publicUrlFor(photoKey) : null;

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: title,
    description,
    ...(photoUrl && photoUrl.startsWith("http") ? { image: photoUrl } : {}),
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "MXN",
      availability: "https://schema.org/InStock",
    },
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Link href="/" className="text-sm text-neutral-600 hover:underline">
        {t("backToCatalog")}
      </Link>

      <div className="mt-4 grid gap-8 md:grid-cols-2">
        <div className="relative overflow-hidden rounded-xl bg-neutral-100">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt={title}
              className="aspect-square w-full object-cover"
            />
          ) : null}
          {product.esGratis ? (
            <span className="absolute left-3 top-3 rounded bg-green-600 px-2 py-1 text-xs font-bold text-white">
              {t("free")}
            </span>
          ) : null}
        </div>

        <div>
          <p className="text-xs font-mono text-neutral-500">{product.code}</p>
          <h1 className="mt-1 text-3xl font-bold">{title}</h1>
          <p className="mt-3 text-neutral-700">{description}</p>

          <dl className="mt-6 space-y-2 text-sm">
            {product.dificultad ? (
              <div className="flex gap-2">
                <dt className="font-semibold">{t("difficulty")}:</dt>
                <dd>{product.dificultad}</dd>
              </div>
            ) : null}
            {product.tiempoMin !== null ? (
              <div className="flex gap-2">
                <dt className="font-semibold">{t("assemblyTime")}:</dt>
                <dd>{t("minutes", { min: product.tiempoMin })}</dd>
              </div>
            ) : null}
            {product.materiales ? (
              <div className="flex gap-2">
                <dt className="font-semibold">{t("materials")}:</dt>
                <dd>{product.materiales}</dd>
              </div>
            ) : null}
          </dl>

          <Link
            href={`/editor/${product.code}`}
            className="mt-8 inline-block rounded-lg bg-black px-6 py-3 font-bold text-white hover:bg-neutral-800"
          >
            {t("customize")}
          </Link>
        </div>
      </div>
    </main>
  );
}
