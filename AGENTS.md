# AGENTS.md — Project Dolphin

Tienda de plantillas papercraft (pop-up cards). Next.js 16 App Router + TS + Tailwind v4 + `next-intl` (`/es` default, `/en`) + Drizzle + Postgres (Railway) + R2. Sin tests, sin CI, sin `opencode.json`.

## Specs (fuente de verdad)

`specs/` manda; `brainstorm/` y `docs/` son insumo. Implementados: `01`, `1.2`, `1.3`, `02-editor-basico`, `2.1` (alineación + mover/escalar texto). `1.1` obsoleto (sustituido por 1.2). SPEC 03 (cuentas, historial, email) aún sin archivo. Pagos/checkout fuera del MVP gratis.

## Comandos

- `npm run dev` / `npm run build` / `npm run start` / `npm run lint` (sin typecheck ni tests separados).
- DB: `npm run db:generate` → `db/migrations/`; `db:migrate` en deploy, `db:push` solo local; `db:studio`; `db:seed` idempotente por `code`/`slug_es` (verificar corriendo 2x sin duplicar). El seed parsea `.env` a mano si falta `DATABASE_URL` y sube el SVG piloto a R2 en best-effort — sin credenciales sigue en modo local, no falla.
- Deploy Railway Nixpacks: arranque `npm run db:migrate && npm run start`, healthcheck `/api/health` (`railway.json`). Node fijado en `22.x` (`engines` + `.nvmrc`): Nixpacks usa Node 18 por defecto y Next 16 exige ≥20.9 — no quitar el pin.
- Verificación diseño/editor: `npm run build` + `npm run lint` en verde + capturas 360/768/1280 con `document.documentElement.scrollWidth <= window.innerWidth`.

## Arquitectura que hay que saber

- i18n: middleware en `proxy.ts` (convención Next 16, no `middleware.ts`; excluye `api|_next|.*\..*`); routing en `i18n/routing.ts` (`es` default). **Todo string visible en `messages/es.json` + `messages/en.json`**, nunca hardcodeado (`home.*`, `layout.*`, `product.*`, `editor.*`). Códigos de error de API estables para i18n (`limite-diario`, `muy-grande`, `tipo-no-valido`, … en `editor.*`).
- Catálogo bajo `templates`: `[slug]` (resuelve `slug_es`/`slug_en` al mismo `code` `AAA-000`, inmutable, nunca en URLs salvo editor) + `categoria/[categoria]`. Todo lo que toca DB lleva `force-dynamic`; DB vacía = estado vacío, nunca error.
- DB (`db/schema.ts`): `categories` + `products` (+ `plantilla_svg_key` nulleable: key R2 del SVG base) + `customizations` (`product_code` → `products.code`, `tokenSecreto` UUIDv4 único, `imagenes`/`ajustes` JSON, last-write-wins; PDF no se almacena).
- Editor (`app/[locale]/editor/[code]`, identidad = `code`; reapertura `?t=[token]` sin caducidad): SVG inline sanitizado (`lib/svg.ts`: sin `<script>`/`<foreignObject>`/`<iframe>` ni `on*` ni `javascript:`). Contrato SVG: `width`/`height` en **mm obligatorios** (+ `viewBox` 1:1), `id="zona-editable-N"` (rect marcador oculto, geometría vía `getBBox()`, imagen recortada con `<clipPath>`, nunca sale de la zona), `<g id="texto-editable-<clave>">` (clave semántica). Sin SVG o sin mm → aviso, no error. Texto auto-shrink [60 %,100 %] del default, luego elipsis indicada; fuentes solo lista fija OFL (inicial `Roboto`). SPEC 2.1: texto con alineación + drag/mover y escala; `alineacion/x/y` opcionales para abrir diseños viejos sin error.
- APIs: `app/api/uploads` (JPG/PNG/WebP ≤10 MB cliente+servidor **con chequeo de firma mágica**, exige `productCode` existente + `zonaId` con formato `zona-editable-N`, rate-limit best-effort en memoria 20/día/IP contado tras subir), `app/api/customizations` (POST/PUT/GET por token), `app/api/r2/[...key]`. PDF 100 % cliente con `jsPDF` (provisional, reversible a servidor): raster 300 DPI → página = medidas declaradas ±1 mm; funciona sin guardar; impresión física al 100 % verificada con regla.
- Env: `DATABASE_URL`, `R2_ACCOUNT_ID/_ACCESS_KEY_ID/_SECRET_ACCESS_KEY/_BUCKET` (región siempre `auto`, endpoint `https://<ACCOUNT>.r2.cloudflarestorage.com`), `NEXT_PUBLIC_CDN_URL`, `NEXT_PUBLIC_SITE_URL` (ver `.env.example`; `lib/env.ts` exige las requeridas con `required()`). Piloto: `public/editor/FIG-001-A-BETA/diseno-piloto.svg`.

## Provisionales (no "arreglar"; se reemplazan en otro spec)

Marcadores `FOTO_PRUEBA_CDN` (CDN + fallback local `/images/product-example.webp`, sin `next/image` remoto), `PRECIOS_PROVISIONALES`, conteos sidebar decorativos, reseñas muestra con etiqueta + `data-muestra="true"` y **sin `AggregateRating` en JSON-LD**, JSON-LD sin `image` de prueba, footer/botones pendientes con `#` o `aria-disabled`. No copiar identidad de terceros: `grep -ri etsy` debe dar vacío en el diff.
