import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq, or } from "drizzle-orm";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/lib/db";
import { absoluteUrl } from "@/lib/site";
import { products, type Product } from "@/db/schema";
import type { Locale } from "@/i18n/routing";
import ProductGallery from "@/components/ProductGallery";
import ProductInfo from "@/components/ProductInfo";
import ProductReviews from "@/components/ProductReviews";
import RelatedProducts from "@/components/RelatedProducts";
import {
  FOTO_FALLBACK_LOCAL,
  FOTO_PRUEBA_CDN,
} from "@/components/ProductImage";

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

  // SPEC 1.3 (temporal): foto única de prueba repetida. Se reemplaza por
  // fotos reales R2 en otro spec.
  const fotos = [FOTO_PRUEBA_CDN];

  // SPEC 1.3: el JSON-LD omite `image` cuando solo hay foto de prueba y
  // nunca lleva `AggregateRating` de muestra.
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: title,
    description,
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
        <div className="min-w-0">
          <ProductGallery
            fotos={fotos}
            alt={title}
            fallbackSrc={FOTO_FALLBACK_LOCAL}
            prevLabel={t("galeria.anterior")}
            nextLabel={t("galeria.siguiente")}
            thumbnailLabels={fotos.map((_, index) =>
              t("galeria.miniatura", { n: index + 1 }),
            )}
          />
        </div>

        <div className="min-w-0">
          <ProductInfo
            title={title}
            description={description}
            code={product.code}
            esGratis={product.esGratis}
          />
        </div>
      </div>

      <ProductReviews />

      <RelatedProducts
        currentId={product.id}
        categoryId={product.categoryId}
        locale={locale}
      />
    </main>
  );
}
