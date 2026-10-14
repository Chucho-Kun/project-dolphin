// scripts/seed.ts — Carga idempotente del catálogo inicial (SPEC 01, Paso 10).
//
// Idempotencia: categorías por `slug_es`, productos por `code` (upsert).
// Correrlo dos veces deja el mismo número de filas.
//
// Uso: npm run db:seed   (toma DATABASE_URL del entorno o del .env local)
//
// NOTA FOTOS (opción 1 del Paso 10): las `foto_*_key` apuntan a
// `plantillas/<slug>-cerrada.jpg` y `plantillas/<slug>-abierta.jpg` en R2.
// Esas fotos las sube el dueño; hasta entonces las tarjetas muestran caja
// gris pero el flujo completo ya es verificable.

import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { categories, products } from "../db/schema";
import { sanitizeSvg, validarContratoSvg } from "../lib/svg";

if (!process.env.DATABASE_URL) {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const i = trimmed.indexOf("=");
      if (i < 0) continue;
      const key = trimmed.slice(0, i).trim();
      if (!(key in process.env)) {
        process.env[key] = trimmed
          .slice(i + 1)
          .trim()
          .replace(/^["']|["']$/g, "");
      }
    }
  }
}

const DATABASE_URL: string = process.env.DATABASE_URL ?? "";
if (!DATABASE_URL) {
  console.error("Falta DATABASE_URL (entorno o .env).");
  process.exit(1);
}

const CATEGORIES = [
  {
    slugEs: "cumpleanos",
    slugEn: "birthday",
    nombreEs: "Cumpleaños",
    nombreEn: "Birthday",
  },
  {
    slugEs: "bodas",
    slugEn: "weddings",
    nombreEs: "Bodas",
    nombreEn: "Weddings",
  },
  {
    slugEs: "figuras",
    slugEn: "figures",
    nombreEs: "Figuras y personajes",
    nombreEn: "Figures & characters",
  },
] as const;

type ProductSeed = {
  code: string;
  categorySlugEs: string;
  slugEs: string;
  slugEn: string;
  tituloEs: string;
  tituloEn: string;
  descripcionEs: string;
  descripcionEn: string;
  fotoCerradaKey: string;
  fotoAbiertaKey: string;
  plantillaSvgKey: string | null;
  dificultad: string;
  tiempoMin: number;
  materiales: string;
};

const photoKeys = (slugEs: string) => ({
  fotoCerradaKey: `plantillas/${slugEs}-cerrada.jpg`,
  fotoAbiertaKey: `plantillas/${slugEs}-abierta.jpg`,
});

const PRODUCTS: ProductSeed[] = [
  {
    code: "CMP-001",
    categorySlugEs: "cumpleanos",
    slugEs: "pastel-de-cumpleanos",
    slugEn: "birthday-cake",
    tituloEs: "Pastel de cumpleaños",
    tituloEn: "Birthday cake",
    descripcionEs:
      "Tarjeta pop-up con pastel de tres pisos que se levanta al abrir. Ideal para cumpleaños infantiles y adultos.",
    descripcionEn:
      "Pop-up card with a three-tier cake that rises when opened. Great for kids and adult birthdays.",
    ...photoKeys("pastel-de-cumpleanos"),
    plantillaSvgKey: null,
    dificultad: "fácil",
    tiempoMin: 20,
    materiales: "Cartulina, tijeras, pegamento en barra",
  },
  {
    code: "CMP-002",
    categorySlugEs: "cumpleanos",
    slugEs: "globos-de-fiesta",
    slugEn: "party-balloons",
    tituloEs: "Globos de fiesta",
    tituloEn: "Party balloons",
    descripcionEs:
      "Lluvia de globos en 3D al abrir la tarjeta. Personaliza los colores y el mensaje de portada.",
    descripcionEn:
      "Burst of 3D balloons when the card opens. Customize the colors and the cover message.",
    ...photoKeys("globos-de-fiesta"),
    plantillaSvgKey: null,
    dificultad: "fácil",
    tiempoMin: 15,
    materiales: "Cartulina, tijeras, pegamento en barra",
  },
  {
    code: "BOD-001",
    categorySlugEs: "bodas",
    slugEs: "ramo-de-boda",
    slugEn: "wedding-bouquet",
    tituloEs: "Ramo de boda",
    tituloEn: "Wedding bouquet",
    descripcionEs:
      "Ramo floral pop-up para invitaciones y recuerdos de boda. Acabado elegante con nombres y fecha personalizables.",
    descripcionEn:
      "Floral pop-up bouquet for wedding invitations and favors. Elegant finish with customizable names and date.",
    ...photoKeys("ramo-de-boda"),
    plantillaSvgKey: null,
    dificultad: "media",
    tiempoMin: 30,
    materiales: "Cartulina premium, cúter, pegamento, regla",
  },
  {
    // SPEC 02 piloto: diseño real validado en public/editor/FIG-001-A-BETA/.
    // 3 zonas + texto-editable-nombre en Roboto, A4 (210x297mm), sin scripts.
    code: "FIG-001-A-BETA",
    categorySlugEs: "figuras",
    slugEs: "figura-piloto-editor",
    slugEn: "pilot-figure-editor",
    tituloEs: "Figura piloto del editor",
    tituloEn: "Editor pilot figure",
    descripcionEs:
      "Plantilla piloto con tres zonas editables para probar el editor. Personaliza fotos y nombre.",
    descripcionEn:
      "Pilot template with three editable zones to try the editor. Customize photos and name.",
    ...photoKeys("figura-piloto-editor"),
    plantillaSvgKey: "plantillas/FIG-001-A-BETA/diseno.svg",
    dificultad: "fácil",
    tiempoMin: 20,
    materiales: "Cartulina, tijeras, pegamento en barra",
  },
];

// SVG sintético mínimo marcado TEMPORAL (SPEC 02): solo si el dueño
// no entrega el SVG real. Desbloquea el trabajo sin adivinar el diseño.
function svgTemporal(): string {
  return sanitizeSvg(
    `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 595.28 841.89">
  <!-- TEMPORAL: fixture sintético hasta recibir el SVG real del dueño -->
  <rect x="50" y="50" width="495.28" height="741.89" fill="none" stroke="#999" stroke-dasharray="8 8"/>
  <g id="zona-editable-1"><rect x="100" y="300" width="200" height="200" fill="#eee"/></g>
  <g id="texto-editable-nombre"><text x="100" y="200" font-family="Roboto, sans-serif" font-size="32" fill="#111">TEMPORAL</text></g>
</svg>`,
  );
}

function leerSvgPiloto(): { key: string; svg: string } {
  const key = "plantillas/FIG-001-A-BETA/diseno.svg";
  const ruta = path.resolve(
    process.cwd(),
    "public/editor/FIG-001-A-BETA/diseno-piloto.svg",
  );
  try {
    if (fs.existsSync(ruta)) {
      const crudo = fs.readFileSync(ruta, "utf8");
      const limpio = sanitizeSvg(crudo);
      const contrato = validarContratoSvg(limpio);
      if (contrato.ok) return { key, svg: limpio };
      console.warn(
        `SVG piloto sin contrato completo (${contrato.errores.join(",")}); se usa igual tras sanitizar.`,
      );
      return { key, svg: limpio };
    }
  } catch (error) {
    console.warn(
      `No se pudo leer el SVG piloto: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  console.warn("SVG piloto ausente: se usa fixture TEMPORAL.");
  return { key, svg: svgTemporal() };
}

async function subirSvgAR2(key: string, svg: string): Promise<void> {
  // Best-effort: sin credenciales R2 o sin red, el seed sigue y el editor
  // lee el SVG local como respaldo. No falla el seed por R2.
  if (
    !process.env.R2_ACCOUNT_ID ||
    !process.env.R2_ACCESS_KEY_ID ||
    !process.env.R2_SECRET_ACCESS_KEY ||
    !process.env.R2_BUCKET
  ) {
    console.warn("R2 sin credenciales: se omite la subida del SVG (modo local).");
    return;
  }
  try {
    const { getStorageClient, getBucket } = await import("../lib/storage");
    const s3 = getStorageClient();
    await s3.send(
      new PutObjectCommand({
        Bucket: getBucket(),
        Key: key,
        Body: Buffer.from(svg, "utf8"),
        ContentType: "image/svg+xml",
      }),
    );
    console.log(`SVG subido a R2: ${key}`);
  } catch (error) {
    console.warn(
      `R2 no disponible, se continúa en modo local: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function main() {
  const client = postgres(DATABASE_URL, { max: 1 });
  const db = drizzle(client);

  // SPEC 02: el SVG piloto se sanitiza y se sube a R2 (best-effort) antes
  // de referenciarlo desde products.plantilla_svg_key.
  const piloto = leerSvgPiloto();
  await subirSvgAR2(piloto.key, piloto.svg);

  const categoryIds = new Map<string, number>();
  for (const c of CATEGORIES) {
    const rows = await db
      .insert(categories)
      .values({
        slugEs: c.slugEs,
        slugEn: c.slugEn,
        nombreEs: c.nombreEs,
        nombreEn: c.nombreEn,
      })
      .onConflictDoUpdate({
        target: categories.slugEs,
        set: {
          slugEn: c.slugEn,
          nombreEs: c.nombreEs,
          nombreEn: c.nombreEn,
        },
      })
      .returning({ id: categories.id });
    categoryIds.set(c.slugEs, rows[0].id);
  }

  for (const p of PRODUCTS) {
    const categoryId = categoryIds.get(p.categorySlugEs);
    if (!categoryId) throw new Error(`Categoría sin id: ${p.categorySlugEs}`);
    await db
      .insert(products)
      .values({
        code: p.code,
        categoryId,
        slugEs: p.slugEs,
        slugEn: p.slugEn,
        tituloEs: p.tituloEs,
        tituloEn: p.tituloEn,
        descripcionEs: p.descripcionEs,
        descripcionEn: p.descripcionEn,
        fotoCerradaKey: p.fotoCerradaKey,
        fotoAbiertaKey: p.fotoAbiertaKey,
        plantillaSvgKey: p.plantillaSvgKey,
        dificultad: p.dificultad,
        tiempoMin: p.tiempoMin,
        materiales: p.materiales,
        esGratis: true,
      })
      .onConflictDoUpdate({
        target: products.code,
        set: {
          categoryId,
          slugEs: p.slugEs,
          slugEn: p.slugEn,
          tituloEs: p.tituloEs,
          tituloEn: p.tituloEn,
          descripcionEs: p.descripcionEs,
          descripcionEn: p.descripcionEn,
          fotoCerradaKey: p.fotoCerradaKey,
          fotoAbiertaKey: p.fotoAbiertaKey,
          plantillaSvgKey: p.plantillaSvgKey,
          dificultad: p.dificultad,
          tiempoMin: p.tiempoMin,
          materiales: p.materiales,
          esGratis: true,
        },
      });
  }

  const [{ n: catRows }] =
    await client`select count(*)::int as n from categories`;
  const [{ n: prodRows }] =
    await client`select count(*)::int as n from products`;

  console.log(`Seed OK — categories: ${catRows}, products: ${prodRows}`);
  await client.end();
}

main().catch((error) => {
  console.error("Seed falló:", error instanceof Error ? error.message : error);
  process.exit(1);
});
