import {
  boolean,
  integer,
  json,
  pgTable,
  serial,
  text,
  timestamp,
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
  // SPEC 02: key R2 del SVG base de la plantilla. Null = editor con aviso.
  plantillaSvgKey: text("plantilla_svg_key"),
  dificultad: text("dificultad"),
  tiempoMin: integer("tiempo_min"),
  materiales: text("materiales"),
  esGratis: boolean("es_gratis").notNull().default(true),
});

export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;

// SPEC 02 — personalizaciones de invitados (sin cuentas).
// `productCode` es el `code` canónico AAA-000 (FK a products.code).
// `tokenSecreto` (UUIDv4) viaja solo como `?t=` para reapertura sin caducidad.
// El PDF no se almacena: se genera en el cliente en cada descarga.
// Last-write-wins por token: un PUT reemplaza imagenes+ajustes.
export type CustomizationImagen = {
  zonaId: string;
  r2Key: string;
};

export type CustomizationAjusteImagen = {
  zonaId: string;
  x: number;
  y: number;
  escala: number;
};

export type CustomizationAjusteTexto = {
  id: string;
  contenido: string;
  tamano: number;
  color: string;
  fuente: string;
  // SPEC 2.1: alineación + desplazamiento. Opcionales en lectura para que
  // los diseños guardados antes del spec abran sin error (defaults en
  // lib/texto.ts; la alineación ausente la resuelve el canvas desde el SVG).
  alineacion?: "izquierda" | "centro" | "derecha";
  x?: number;
  y?: number;
  // SPEC 2.4: peso opcional (ausente ⇒ 400; diseños viejos abren en Regular).
  peso?: 400 | 700;
};

export type CustomizationAjustes = {
  imagenes: CustomizationAjusteImagen[];
  textos: CustomizationAjusteTexto[];
};

export const customizations = pgTable("customizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  productCode: text("product_code")
    .notNull()
    .references(() => products.code),
  tokenSecreto: text("token_secreto").notNull().unique(),
  imagenes: json("imagenes").$type<CustomizationImagen[]>().notNull(),
  ajustes: json("ajustes").$type<CustomizationAjustes>().notNull(),
  creadoEn: timestamp("creado_en").notNull().defaultNow(),
  actualizadoEn: timestamp("actualizado_en").notNull().defaultNow(),
});

export type Customization = typeof customizations.$inferSelect;
