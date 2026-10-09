import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getDb } from "@/lib/db";
import { absoluteUrl } from "@/lib/site";
import { products, type Product } from "@/db/schema";
import type { Locale } from "@/i18n/routing";
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

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <section className="rounded-xl bg-neutral-100 px-6 py-10 text-center">
        <h1 className="text-3xl font-bold">{t("bannerTitle")}</h1>
        <p className="mx-auto mt-2 max-w-2xl text-neutral-600">
          {t("bannerSubtitle")}
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">{t("title")}</h2>
        <p className="mt-1 text-sm text-neutral-600">{t("subtitle")}</p>

        {items.length === 0 ? (
          <p className="mt-6 rounded border p-4 text-sm">{t("empty")}</p>
        ) : (
          <ul className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {items.map((p) => (
              <ProductCard key={p.id} product={p} locale={locale} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
