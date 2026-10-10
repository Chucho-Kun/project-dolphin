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
import { categories, products } from "../db/schema";

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
    dificultad: "media",
    tiempoMin: 30,
    materiales: "Cartulina premium, cúter, pegamento, regla",
  },
];

async function main() {
  const client = postgres(DATABASE_URL, { max: 1 });
  const db = drizzle(client);

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
