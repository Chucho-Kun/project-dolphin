import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getDb } from "@/lib/db";
import { absoluteUrl } from "@/lib/site";
import { products, type Product } from "@/db/schema";
import type { Locale } from "@/i18n/routing";
import HeroBanner from "@/components/HeroBanner";
import CategorySidebar from "@/components/CategorySidebar";
import ProductCard from "@/components/ProductCard";

export const dynamic = "force-dynamic";

async function getProducts(): Promise<Product[]> {
  try {
    const db = getDb();
    return await db.select().from(products).orderBy(asc(products.code));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "home" });
  return {
    title: `${t("title")} | Project Dolphin`,
    description: t("subtitle"),
    alternates: {
      canonical: absoluteUrl(`/${locale}`),
      languages: {
        es: absoluteUrl("/es"),
        en: absoluteUrl("/en"),
        "x-default": absoluteUrl("/es"),
      },
    },
  };
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("home");
  const items = await getProducts();
  const destacados = items.slice(0, 4);

  return (
    <>
      <HeroBanner />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col gap-8 md:flex-row">
          <CategorySidebar />
          <div className="min-w-0 flex-1">
            {items.length === 0 ? (
              <p className="mt-6 rounded border p-4 text-sm">{t("empty")}</p>
            ) : (
              <>
                <section aria-labelledby="destacados-titulo">
                  <h2 id="destacados-titulo" className="text-xl font-semibold">
                    {t("destacados.titulo")}
                  </h2>
                  <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {destacados.map((p) => (
                      <ProductCard key={p.id} product={p} locale={locale} />
                    ))}
                  </ul>
                </section>
                <section aria-labelledby="todos-titulo" className="mt-10">
                  <h2 id="todos-titulo" className="text-xl font-semibold">
                    {t("todos.titulo")}
                  </h2>
                  <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {items.map((p) => (
                      <ProductCard key={p.id} product={p} locale={locale} />
                    ))}
                  </ul>
                </section>
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
