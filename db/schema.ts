import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  uuid,
} from "drizzle-orm/pg-core";

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  slugEs: text("slug_es").notNull().unique(),
  slugEn: text("slug_en").notNull().unique(),
  nombreEs: text("nombre_es").notNull(),
  nombreEn: text("nombre_en").notNull(),
});

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  // Código canónico AAA-000, asignado por el dueño al diseñar.
  // Inmutable una vez publicado. Nunca aparece como PK en URLs (la URL usa el slug).
  code: text("code").notNull().unique(),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categories.id),
  slugEs: text("slug_es").notNull().unique(),
  slugEn: text("slug_en").notNull().unique(),
  tituloEs: text("titulo_es").notNull(),
  tituloEn: text("titulo_en").notNull(),
  descripcionEs: text("descripcion_es").notNull(),
  descripcionEn: text("descripcion_en").notNull(),
  // Claves en R2 (ver lib/storage.ts). Nulleables: el producto puede
  // existir antes de subir sus fotos.
  fotoCerradaKey: text("foto_cerrada_key"),
  fotoAbiertaKey: text("foto_abierta_key"),
  dificultad: text("dificultad"),
  tiempoMin: integer("tiempo_min"),
  materiales: text("materiales"),
  esGratis: boolean("es_gratis").notNull().default(true),
});

export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
