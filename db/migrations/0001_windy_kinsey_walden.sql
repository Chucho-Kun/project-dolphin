CREATE TABLE "customizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_code" text NOT NULL,
	"token_secreto" text NOT NULL,
	"imagenes" json NOT NULL,
	"ajustes" json NOT NULL,
	"creado_en" timestamp DEFAULT now() NOT NULL,
	"actualizado_en" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customizations_token_secreto_unique" UNIQUE("token_secreto")
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "plantilla_svg_key" text;--> statement-breakpoint
ALTER TABLE "customizations" ADD CONSTRAINT "customizations_product_code_products_code_fk" FOREIGN KEY ("product_code") REFERENCES "public"."products"("code") ON DELETE no action ON UPDATE no action;