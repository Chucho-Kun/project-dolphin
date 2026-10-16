import { notFound } from "next/navigation";
import {
  Dancing_Script,
  Inter,
  Lato,
  Montserrat,
  Open_Sans,
  Oswald,
  Playfair_Display,
  Poppins,
  Roboto,
  Roboto_Condensed,
} from "next/font/google";
import { eq } from "drizzle-orm";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/lib/db";
import { products, type Product } from "@/db/schema";
import type { Locale } from "@/i18n/routing";
import EditorShell, {
  type FotoInicial,
  type PaginaInicial,
  type TextoInicial,
} from "@/components/editor/EditorShell";
import {
  cargarPaginasPlantilla,
  cargarReapertura,
} from "@/lib/plantilla";

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

// Biblioteca cerrada SPEC 2.4: 10 familias OFL autohospedadas (WOFF2 del
// build, cero <link> a CDN en runtime). Las 10 se cargan siempre; el coste
// de descargar las no usadas se acepta en v1. Alcance solo a esta página
// para no tocar home/producto.
const roboto = Roboto({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  style: ["normal"],
  display: "swap",
});
const openSans = Open_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  style: ["normal"],
  display: "swap",
});
const lato = Lato({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  style: ["normal"],
  display: "swap",
});
const montserrat = Montserrat({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  style: ["normal"],
  display: "swap",
});
const robotoCondensed = Roboto_Condensed({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  style: ["normal"],
  display: "swap",
});
const oswald = Oswald({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  style: ["normal"],
  display: "swap",
});
const poppins = Poppins({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  style: ["normal"],
  display: "swap",
});
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  style: ["normal"],
  display: "swap",
});
const playfairDisplay = Playfair_Display({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  style: ["normal"],
  display: "swap",
});
const dancingScript = Dancing_Script({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  style: ["normal"],
  display: "swap",
});
const clasesFuentesEditor = [
  roboto.className,
  openSans.className,
  lato.className,
  montserrat.className,
  robotoCondensed.className,
  oswald.className,
  poppins.className,
  inter.className,
  playfairDisplay.className,
  dancingScript.className,
].join(" ");
// La interfaz queda en Roboto sans (el inline gana a las 10 clases para la
// UI; cada <text> del SVG conserva su familia por su propio inline).
const estiloInterfazEditor = { fontFamily: '"Roboto", sans-serif' } as const;

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
    <main
      className={`mx-auto max-w-3xl px-4 py-10 ${clasesFuentesEditor}`}
      style={estiloInterfazEditor}
    >
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

  // SPEC 2.5: páginas como array (p.1 siempre; p.2 solo si hay SVG).
  const paginas = await cargarPaginasPlantilla(product);
  const primera = paginas[0];
  if (!primera.ok) {
    const clave =
      primera.motivo === "sin-svg"
        ? "avisoSinSvg"
        : primera.motivo === "sin-medidas"
          ? "avisoSinMedidas"
          : primera.motivo === "sin-zonas"
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

  // SPEC 2.5: reparto por página (`zona-editable-1` existe en ambas; la clave
  // es pagina+zonaId). Ausente ⇒ 1 ya viene normalizado de cargarReapertura.
  const ajustesImg = new Map(
    (reapertura?.ajustesImagenes ?? []).map((a) => [
      `${a.pagina}:${a.zonaId}`,
      a,
    ]),
  );
  const fotosIniciales: FotoInicial[] = (reapertura?.imagenes ?? []).map(
    (e) => ({
      zonaId: e.zonaId,
      src: e.src,
      r2Key: e.r2Key,
      pagina: e.pagina,
      x: ajustesImg.get(`${e.pagina}:${e.zonaId}`)?.x ?? 0,
      y: ajustesImg.get(`${e.pagina}:${e.zonaId}`)?.y ?? 0,
      escala: ajustesImg.get(`${e.pagina}:${e.zonaId}`)?.escala ?? 1,
    }),
  );
  const textosIniciales: TextoInicial[] = (reapertura?.ajustesTextos ?? []).map(
    (a) => ({
      id: a.id,
      contenido: a.contenido,
      tamano: a.tamano,
      color: a.color,
      fuente: a.fuente,
      pagina: a.pagina,
      ...(typeof a.x === "number" ? { x: a.x } : {}),
      ...(typeof a.y === "number" ? { y: a.y } : {}),
      ...(a.peso === 700 ? { peso: 700 as const } : {}),
    }),
  );
  const paginasProp: PaginaInicial[] = paginas.map((p) =>
    p.ok
      ? {
          pagina: p.pagina,
          svgText: p.svg,
          anchoMm: p.anchoMm,
          altoMm: p.altoMm,
          zonas: p.zonas,
          textosIds: p.textos,
          motivoAviso: null,
        }
      : {
          pagina: p.pagina,
          svgText: null,
          anchoMm: 0,
          altoMm: 0,
          zonas: [],
          textosIds: [],
          motivoAviso: p.motivo,
        },
  );

  return (
    <main
      className={`mx-auto max-w-6xl px-4 py-10 ${clasesFuentesEditor}`}
      style={estiloInterfazEditor}
    >
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
        paginas={paginasProp}
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
