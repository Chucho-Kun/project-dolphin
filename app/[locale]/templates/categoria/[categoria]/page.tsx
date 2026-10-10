import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { asc, eq, or } from "drizzle-orm";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/lib/db";
import { absoluteUrl } from "@/lib/site";
import { categories, products, type Category, type Product } from "@/db/schema";
import type { Locale } from "@/i18n/routing";
import ProductCard from "@/components/ProductCard";

export const dynamic = "force-dynamic";

async function findCategoryBySlug(slug: string): Promise<Category | null> {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(categories)
      .where(or(eq(categories.slugEs, slug), eq(categories.slugEn, slug)))
      .limit(1);
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

async function getCategoryProducts(categoryId: number): Promise<Product[]> {
  try {
    const db = getDb();
    return await db
      .select()
      .from(products)
      .where(eq(products.categoryId, categoryId))
      .orderBy(asc(products.code));
  } catch {
    return [];
  }
}

type PageParams = { locale: string; categoria: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { locale, categoria } = await params;
  const category = await findCategoryBySlug(categoria);
  if (!category) return {};
  const name = locale === "es" ? category.nombreEs : category.nombreEn;
  const esUrl = absoluteUrl(`/es/templates/categoria/${category.slugEs}`);
  const enUrl = absoluteUrl(`/en/templates/categoria/${category.slugEn}`);
  return {
    title: `${name} | Project Dolphin`,
    alternates: {
      canonical: locale === "es" ? esUrl : enUrl,
      languages: { es: esUrl, en: enUrl, "x-default": esUrl },
    },
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { locale, categoria } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("category");

  const category = await findCategoryBySlug(categoria);
  if (!category) notFound();

  const items = await getCategoryProducts(category.id);
  const name = locale === "es" ? category.nombreEs : category.nombreEn;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <Link href="/" className="text-sm text-neutral-600 hover:underline">
        {t("backToHome")}
      </Link>

      <h1 className="mt-2 text-3xl font-bold">{name}</h1>
      <p className="mt-1 text-sm text-neutral-600">
        {t("templateCount", { count: items.length })}
      </p>

      {items.length === 0 ? (
        <p className="mt-6 rounded border p-4 text-sm">{t("empty")}</p>
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {items.map((p) => (
            <ProductCard key={p.id} product={p} locale={locale} />
          ))}
        </ul>
      )}
    </main>
  );
}
