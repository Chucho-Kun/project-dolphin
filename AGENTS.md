# AGENTS.md — Project Dolphin

Tienda de plantillas papercraft (pop-up cards). Next.js 16 App Router + TS + Tailwind v4 + `next-intl` (`/es` default, `/en`) + Drizzle + Postgres (Railway) + R2.

## Qué spec sigue

Fuente de verdad: `specs/` (la serie manda; `brainstorm/` y `docs/superpowers/` son insumo, no norma).

- `01-fundacion-catalogo-bilingue.md` — **Implemented** (scaffold, i18n, `categories`+`products`, SEO, seed, deploy).
- `1.1-diseno-visual-estilo-ferredip.md` — **Obsoleto** (sustituido por 1.2).
- `1.2-home-estilo-etsy-3djoy.md` — **Implemented** (home estilo Etsy/3DJoy, header/hero/sidebar/footer).
- `1.3-diseno-secciones-producto.md` — **Implemented** (página producto en 3 secciones + foto CDN de prueba). Rama activa: `spec-1.3-diseno-secciones-producto`.
- **Siguiente: SPEC 02 editor básico** — no tiene archivo aún; hay que redactarlo desde `brainstorm/editor/funcionalidad-editor-basico.md` (base A4-safe, auto-shrink de texto, imagen mover+zoom en zona fija, `code` canónico). Después SPEC 03 (cuentas, descarga, email). Pagos/checkout están fuera del MVP gratis (SPEC 01 §"Lo que no está").

## Comandos

- `npm run dev` / `npm run build` / `npm run start` / `npm run lint`
- `npm run db:generate` / `npm run db:migrate` / `npm run db:push` / `npm run db:studio` / `npm run db:seed` (seed idempotente por `code`; correr 2x no duplica)
- Deploy Railway Nixpacks: arranque `npm run db:migrate && npm run start`, healthcheck `/api/health` (ver `railway.json`).
- Specs con solo diseño se verifican con `npm run build` + `npm run lint` en verde + capturas 360/768/1280 comprobando `document.documentElement.scrollWidth <= window.innerWidth` (Playwright MCP si está disponible, si no manual).

## Convenciones que un agente rompería sin ayuda

- i18n: el middleware vive en `proxy.ts` (convención Next 16, no `middleware.ts`). Routing `es` default en `i18n/routing.ts`. **Todo string visible solo en `messages/es.json` + `messages/en.json`**, nunca hardcodeado; claves nuevas por spec (`home.*`, `layout.*`, `product.*`).
- Rutas: segmento único `templates` con slugs traducidos (`slug_es`/`slug_en`, unicidad por columna). La resolución prueba ambas columnas; ES y EN resuelven al mismo `code`. `code` (`AAA-000`) es inmutable y nunca va en URLs. Catálogo en render dinámico (`force-dynamic`), con estado vacío si la DB está vacía — nunca error.
- DB: solo existen `categories` y `products` (`db/schema.ts`). Foto R2 (`foto_cerrada_key`/`foto_abierta_key`) nulleable. **Los specs de diseño prohíben migraciones, cambios en `db/`/`lib/db.ts`, rutas API y dependencias nuevas** — el diff debe limitarse a componentes, `app/`, `messages/` y `globals.css`.
- Provisionales marcados (reemplazo en otro spec, no "arreglar" aquí): `FOTO_PRUEBA_CDN` (`https://cdn.ferredip.com.mx/fotos/product-example.webp`, fallback local obligatorio `/images/product-example.webp`, sin `next/image` remoto); `PRECIOS_PROVISIONALES` hardcodeados (verde + tachado + 25 %); conteos del sidebar hardcodeados (decorativos); reseñas de muestra con etiqueta visible + `data-muestra="true"` y **sin `AggregateRating` en JSON-LD**; JSON-LD sin `image` de prueba; footer y botones pendientes con links a `#` o `aria-disabled` (nunca navegar ni error).
- No copiar identidad de terceros: `grep -ri etsy` debe dar vacío en el diff; vendedor/textos siempre Dolphin.
- `app/[locale]/editor/[code]` existe como placeholder; `Editar diseño` enlaza ahí por `code` real.
