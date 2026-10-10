import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/lib/db";
import { products, type Product } from "@/db/schema";
import type { Locale } from "@/i18n/routing";

// Placeholder del editor (SPEC 02). El editor real se construye en el SPEC 02;
// esta página solo reserva la ruta a la que apunta el botón PERSONALIZAR.
export const dynamic = "force-dynamic";

async function findProductByCode(code: string): Promise<Product | null> {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(products)
      .where(eq(products.code, code))
      .limit(1);
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export default async function EditorPlaceholderPage({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}) {
  const { locale, code } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("editor");

  const product = await findProductByCode(code);
  if (!product) notFound();

  const isEs = locale === "es";
  const slug = isEs ? product.slugEs : product.slugEn;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <p className="text-xs font-mono text-neutral-500">{product.code}</p>
      <h1 className="mt-1 text-3xl font-bold">{t("placeholderTitle")}</h1>
      <p className="mt-3 text-neutral-700">
        {t("placeholderDesc", { code: product.code })}
      </p>
      <Link
        href={`/templates/${slug}`}
        className="mt-6 inline-block text-sm underline"
      >
        {t("backToTemplate")}
      </Link>
    </main>
  );
}
