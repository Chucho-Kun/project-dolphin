import { notFound } from "next/navigation";
import { Roboto } from "next/font/google";
import { eq } from "drizzle-orm";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/lib/db";
import { products, type Product } from "@/db/schema";
import type { Locale } from "@/i18n/routing";
import EditorShell from "@/components/editor/EditorShell";
import { cargarPlantillaSvg, cargarReapertura } from "@/lib/plantilla";

// SPEC 02 Paso 7: la página entrega datos al shell (canvas + paneles).
// Sin SVG configurado, o con SVG sin medidas físicas, muestra aviso visible,
// nunca error.
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

// Fuente fija del editor (SPEC 02: lista OFL inicial = Roboto). Alcance solo
// a esta página para no tocar home/producto (criterio del spec).
const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

function Aviso({
  titulo,
  descripcion,
  volver,
  volverHref,
}: {
  titulo: string;
  descripcion: string;
  volver: string;
  volverHref: string;
}) {
  return (
    <main className={`mx-auto max-w-3xl px-4 py-10 ${roboto.className}`}>
      <h1 className="text-2xl font-bold">{titulo}</h1>
      <p className="mt-3 text-neutral-700">{descripcion}</p>
      <Link href={volverHref} className="mt-6 inline-block text-sm underline">
        {volver}
      </Link>
    </main>
  );
}

export default async function EditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; code: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { locale, code } = await params;
  const { t: token } = await searchParams;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("editor");

  const product = await findProductByCode(code);
  if (!product) notFound();

  const isEs = locale === "es";
  const slug = isEs ? product.slugEs : product.slugEn;
  const volverHref = `/templates/${slug}`;
  const title = isEs ? product.tituloEs : product.tituloEn;

  const plantilla = await cargarPlantillaSvg(product);
  if (!plantilla.ok) {
    const clave =
      plantilla.motivo === "sin-svg"
        ? "avisoSinSvg"
        : plantilla.motivo === "sin-medidas"
          ? "avisoSinMedidas"
          : plantilla.motivo === "sin-zonas"
            ? "avisoSinZonas"
            : "avisoNoDisponible";
    return (
      <Aviso
        titulo={t(`${clave}Titulo`)}
        descripcion={t(`${clave}Desc`, { code: product.code })}
        volver={t("backToTemplate")}
        volverHref={volverHref}
      />
    );
  }

  const reapertura =
    typeof token === "string" && token.length > 0
      ? await cargarReapertura(token)
      : null;

  const ajustesImg = new Map(
    (reapertura?.ajustesImagenes ?? []).map((a) => [a.zonaId, a]),
  );
  const fotosIniciales = (reapertura?.imagenes ?? []).map((e) => ({
    zonaId: e.zonaId,
    src: e.src,
    r2Key: e.r2Key,
    x: ajustesImg.get(e.zonaId)?.x ?? 0,
    y: ajustesImg.get(e.zonaId)?.y ?? 0,
    escala: ajustesImg.get(e.zonaId)?.escala ?? 1,
  }));
  const textosIniciales = reapertura?.ajustesTextos ?? [];

  return (
    <main className={`mx-auto max-w-6xl px-4 py-10 ${roboto.className}`}>
      <p className="font-mono text-xs text-neutral-500">{product.code}</p>
      <h1 className="mt-1 text-3xl font-bold">{title}</h1>
      {reapertura === null && typeof token === "string" && token.length > 0 ? (
        <p role="status" className="mt-3 rounded bg-amber-100 px-3 py-2 text-sm">
          {t("enlaceInvalido")}
        </p>
      ) : null}
      <EditorShell
        key={code}
        productCode={product.code}
        locale={locale}
        svgText={plantilla.svg}
        anchoMm={plantilla.anchoMm}
        altoMm={plantilla.altoMm}
        zonas={plantilla.zonas}
        textosIds={plantilla.textos}
        fotosIniciales={fotosIniciales}
        textosIniciales={textosIniciales}
        tokenInicial={typeof token === "string" && reapertura ? token : null}
      />
      <Link href={volverHref} className="mt-6 inline-block text-sm underline">
        {t("backToTemplate")}
      </Link>
    </main>
  );
}
