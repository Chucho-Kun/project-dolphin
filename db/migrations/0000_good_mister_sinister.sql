CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug_es" text NOT NULL,
	"slug_en" text NOT NULL,
	"nombre_es" text NOT NULL,
	"nombre_en" text NOT NULL,
	CONSTRAINT "categories_slug_es_unique" UNIQUE("slug_es"),
	CONSTRAINT "categories_slug_en_unique" UNIQUE("slug_en")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"category_id" integer NOT NULL,
	"slug_es" text NOT NULL,
	"slug_en" text NOT NULL,
	"titulo_es" text NOT NULL,
	"titulo_en" text NOT NULL,
	"descripcion_es" text NOT NULL,
	"descripcion_en" text NOT NULL,
	"foto_cerrada_key" text,
	"foto_abierta_key" text,
	"dificultad" text,
	"tiempo_min" integer,
	"materiales" text,
	"es_gratis" boolean DEFAULT true NOT NULL,
	CONSTRAINT "products_code_unique" UNIQUE("code"),
	CONSTRAINT "products_slug_es_unique" UNIQUE("slug_es"),
	CONSTRAINT "products_slug_en_unique" UNIQUE("slug_en")
);
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;