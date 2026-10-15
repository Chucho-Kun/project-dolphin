# AGENTS.md — Project Dolphin

Tienda de plantillas papercraft (pop-up cards). Next.js 16 App Router + TS + Tailwind v4 + `next-intl` (`/es` default, `/en`) + Drizzle + Postgres (Railway) + R2. Sin tests, sin CI, sin `opencode.json`.

## Specs (fuente de verdad)

`specs/` manda; `brainstorm/` y `docs/` son insumo. Estados: `01` Implemented · `1.1` Obsoleto (sustituido por 1.2) · `1.2` Implemented · `1.3` Implemented · `02-editor-basico` Implemented · `2.1` Implemented (alineación + mover/escalar texto). Siguiente: SPEC 03 (cuentas, historial, email) — aún sin archivo. Pagos/checkout fuera del MVP gratis.

## Comandos

- `npm run dev` / `npm run build` / `npm run start` / `npm run lint` (sin typecheck ni tests separados).
- `npm run db:generate` / `npm run db:migrate` / `npm run db:push` / `npm run db:studio` / `npm run db:seed` (seed idempotente por `code`; verificar corriendo 2x sin duplicar; subida SVG a R2 best-effort — sin credenciales sigue en modo local, no falla).
- Deploy Railway Nixpacks: arranque `npm run db:migrate && npm run start`, healthcheck `/api/health` (`railway.json`). Node fijado en `22.x` (`engines` + `.nvmrc`): Nixpacks usa Node 18 por defecto y Next 16 exige ≥20.9 — no quitar el pin.
- Verificación diseño/editor: `npm run build` + `npm run lint` en verde + capturas 360/768/1280 con `document.documentElement.scrollWidth <= window.innerWidth`.

## Arquitectura que hay que saber

- i18n: middleware en `proxy.ts` (convención Next 16, no `middleware.ts`); routing en `i18n/routing.ts` (`es` default). **Todo string visible en `messages/es.json` + `messages/en.json`**, nunca hardcodeado (`home.*`, `layout.*`, `product.*`, `editor.*`).
- Catálogo: ruta única `templates` con `slug_es`/`slug_en` (unicidad por columna); se resuelven ambas columnas al mismo `code` (`AAA-000`, inmutable, nunca en URLs salvo editor). Render dinámico (`force-dynamic`); DB vacía = estado vacío, nunca error.
- DB (`db/schema.ts`): `categories` + `products` (+ `plantilla_svg_key` nulleable: key R2 del SVG base) + `customizations` (`product_code` → `products.code`, `tokenSecreto` UUIDv4 único, `imagenes`/`ajustes` JSON, last-write-wins; PDF no se almacena).
- Editor (`app/[locale]/editor/[code]`, identidad = `code`; reapertura `?t=[token]` sin caducidad): SVG inline sanitizado (sin `<script>` ni `on*`), render 1:1 sin reescalado. Contrato SVG: `width`/`height` en **mm obligatorios** (+ `viewBox` 1:1), `id="zona-editable-N"` (rect marcador oculto, geometría vía `getBBox()`, imagen recortada con `<clipPath>`, nunca sale de la zona), `<g id="texto-editable-<clave>">` (clave semántica), guías/márgenes A4-safe incluidos en el archivo. Sin SVG o sin mm → aviso, no error. Texto auto-shrink [60 %,100 %] del default, luego elipsis indicada; fuentes solo lista fija OFL (inicial `Roboto`). SPEC 2.1: texto con alineación + drag/mover y escala; campos `alineacion/x/y` opcionales para abrir diseños viejos sin error.
- APIs: `app/api/uploads` (imagen JPG/PNG/WebP ≤10 MB cliente+servidor → R2, rate-limit best-effort en memoria 20/día/IP), `app/api/customizations` (POST/PUT/GET por token), `app/api/r2/[...key]`. PDF 100 % cliente con `jsPDF` (provisional, reversible a servidor): raster 300 DPI → página = medidas declaradas ±1 mm; funciona sin guardar; impresión física al 100 % verificada con regla.
- Env: `DATABASE_URL`, `R2_ACCOUNT_ID/_ACCESS_KEY_ID/_SECRET_ACCESS_KEY/_BUCKET`, `NEXT_PUBLIC_CDN_URL`, `NEXT_PUBLIC_SITE_URL` (ver `.env.example`; `lib/env.ts` exige las requeridas). Piloto: `public/editor/FIG-001-A-BETA/diseno-piloto.svg`.

## Provisionales (no "arreglar"; se reemplazan en otro spec)

Marcadores `FOTO_PRUEBA_CDN` (CDN + fallback local `/images/product-example.webp`, sin `next/image` remoto), `PRECIOS_PROVISIONALES`, conteos sidebar decorativos, reseñas muestra con etiqueta + `data-muestra="true"` y **sin `AggregateRating` en JSON-LD**, JSON-LD sin `image` de prueba, footer/botones pendientes con `#` o `aria-disabled`. No copiar identidad de terceros: `grep -ri etsy` debe dar vacío en el diff.
