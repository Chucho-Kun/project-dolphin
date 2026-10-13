import { and, asc, eq, ne, notInArray } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { getDb } from "@/lib/db";
import { products, type Product } from "@/db/schema";
import ProductCard from "@/components/ProductCard";

type RelatedProductsProps = {
  currentId: string;
  categoryId: number;
  locale: string;
};

async function getRelated(
  currentId: string,
  categoryId: number,
): Promise<Product[]> {
  try {
    const db = getDb();
    const sameCategory = await db
      .select()
      .from(products)
      .where(
        and(eq(products.categoryId, categoryId), ne(products.id, currentId)),
      )
      .orderBy(asc(products.code))
      .limit(8);

    if (sameCategory.length >= 8) return sameCategory;

    const excludeIds = [currentId, ...sameCategory.map((p) => p.id)];
    const filler = await db
      .select()
      .from(products)
      .where(notInArray(products.id, excludeIds))
      .orderBy(asc(products.code))
      .limit(8 - sameCategory.length);

    return [...sameCategory, ...filler];
  } catch {
    return [];
  }
}

// SPEC 1.3: grid "También podría interesarte". Hasta 8 productos de la misma
// `category_id` excluyendo el actual, con relleno por `code` del resto del
// catálogo. Si el catálogo total disponible es `<= 1`, la sección se oculta.
// Cada card usa foto CDN de prueba y link real (vía `ProductCard`).
// Título por i18n (`product.relacionados.*`); se añade en el Paso 7 del plan.
export default async function RelatedProducts({
  currentId,
  categoryId,
  locale,
}: RelatedProductsProps) {
  const t = await getTranslations("product");
  const related = await getRelated(currentId, categoryId);

  // Sin otros productos disponibles (catálogo total <= 1): no renderizar.
  if (related.length === 0) return null;

  return (
    <section
      aria-label={t("relacionados.titulo")}
      className="mt-12 w-full max-w-full"
    >
      <h2 className="text-xl font-bold">{t("relacionados.titulo")}</h2>
      <ul className="mt-4 grid max-w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
        {related.map((product) => (
          <ProductCard key={product.id} product={product} locale={locale} />
        ))}
      </ul>
    </section>
  );
}
