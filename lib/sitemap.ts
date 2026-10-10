import type { MetadataRoute } from "next";
import { getDb } from "@/lib/db";
import { absoluteUrl } from "@/lib/site";
import { categories, products } from "@/db/schema";
import type { Locale } from "@/i18n/routing";

export async function buildLocaleSitemap(
  locale: Locale,
): Promise<MetadataRoute.Sitemap> {
  const isEs = locale === "es";
  const entries: MetadataRoute.Sitemap = [
    { url: absoluteUrl(`/${locale}`) },
  ];

  try {
    const db = getDb();
    const cats = await db.select().from(categories);
    for (const c of cats) {
      entries.push({
        url: absoluteUrl(
          `/${locale}/templates/categoria/${isEs ? c.slugEs : c.slugEn}`,
        ),
      });
    }
    const prods = await db.select().from(products);
    for (const p of prods) {
      entries.push({
        url: absoluteUrl(
          `/${locale}/templates/${isEs ? p.slugEs : p.slugEn}`,
        ),
      });
    }
  } catch {
    // Sin DB disponible: el sitemap lista al menos el home.
  }

  return entries;
}
