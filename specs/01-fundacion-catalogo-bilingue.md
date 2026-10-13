# SPEC 01 — Fundación bilingüe + catálogo

> **Estado:** Implementado
> **Depende de:** ninguna (primera de la serie)
> **Fecha:** 2026-10-09
> **Objetivo:** Dejar en producción el sitio bilingüe ES/EN con el catálogo de plantillas servido desde Postgres, listo para construir el editor encima.

## Por qué existe este spec

El MVP se dividió en specs implementables por separado (decisión del 09-oct). Este es el primero: fundación técnica más catálogo público. El editor (datos en `brainstorm/editor/funcionalidad-editor-basico.md`) va en el SPEC 02. Cuentas, descarga y email van en el SPEC 03.

## Alcance

**Dentro:**

- Scaffold Next.js App Router + TypeScript + Tailwind + Drizzle, con `next-intl` y routing `/es/...` + `/en/...` (segmento único, ver Decisiones).
- Postgres en Railway + conexión desde la app. Storage S3/R2 para fotos desde el día 1.
- Tablas `categories` y `products` con contenido bilingüe por columnas (`slug_es/slug_en`, `titulo_es/titulo_en`, `descripcion_es/descripcion_en`) y código canónico `AAA-000`.
- Home: banner horizontal + grid de 4 columnas con badge GRATIS.
- Página de producto por slug localizado: foto grande, descripción, botón PERSONALIZAR (lleva a placeholder del editor del SPEC 02).
- Página de categoría.
- SEO base: sitemap por locale, `hreflang` es↔en + `x-default`, canonical por locale, JSON-LD `Product` marcado como gratis.
- `messages/es.json` + `messages/en.json` como única fuente de strings UI, con switcher de locale.
- GA4 + GTM instrumentado desde el scaffold.
- Script de seed versionado + 2-3 plantillas reales cargadas.
- Deploy en Railway bajo el dominio .com.

**Fuera de alcance (para futuros specs):**

- Editor básico: SPEC 02 (ya decidido: A4-safe, auto-shrink de texto, mover+zoom en zona fija).
- Cuentas, modal de descarga, envío de PDF, MI CUENTA e historial: SPEC 03.
- Tablas `users`, `customizations`, `orders`, `magic_tokens`: SPEC 02/03.
- Admin CRUD de productos (la carga es por seed + script).
- Pagos, checkout, tercer idioma, traducción automática embebida.
- Videos de YouTube y pauta (contenido, no código).

## Modelo de datos

```ts
// db/schema.ts (Drizzle) — solo lo que crea este spec
categories = { id, slug_es unique, slug_en unique, nombre_es, nombre_en }
products = {
  id: uuid, code: text unique,          // AAA-000, asignado por el dueño al diseñar
  category_id -> categories.id,
  slug_es unique, slug_en unique,
  titulo_es, titulo_en, descripcion_es, descripcion_en,
  foto_cerrada_key, foto_abierta_key,  // claves S3/R2
  dificultad, tiempo_min, materiales,
  es_gratis: boolean default true,
}
```

Convenciones:

- `code` es inmutable una vez publicado. Nunca aparece como PK en URLs (la URL usa el slug).
- Contenido traducible en columnas por locale, nunca hardcodeado en el front.
- Este spec no crea datos de usuario. Sin `users`, sin sesiones.

## Plan de implementación

1. Scaffold Next.js (App Router, TS, Tailwind) + `next-intl` con locales `es` (default) y `en`, `middleware.ts` con detección y redirect. Verificación: `/es` y `/en` responden con el home vacío en el idioma correcto.
2. Alta de Postgres en Railway + S3/R2 (bucket + credenciales) + variables de entorno documentadas en `.env.example`. Verificación: la app conecta y lista buckets sin error.
3. Migración inicial + `db/schema.ts` con `categories` y `products`. Verificación: `drizzle-kit push` aplica limpio en una DB vacía.
4. `messages/es.json` + `messages/en.json` con los strings del home/catálogo + switcher de locale que conserva la página. Verificación: cambiar de idioma no pierde la ruta y ningún texto queda hardcodeado.
5. Home `app/[locale]/page.tsx`: banner + grid 4 columnas + badge GRATIS leyendo de Postgres. Verificación: con DB vacía muestra estado vacío, no error.
6. Página `app/[locale]/templates/[slug]/page.tsx`: resuelve el slug en ambos locales, foto grande, descripción, JSON-LD `Product` gratis, botón PERSONALIZAR a placeholder. Verificación: slug ES y EN resuelven al mismo producto.
7. Página de categoría `app/[locale]/templates/[categoria]/page.tsx` (categoría por slug localizado). Verificación: filtra solo productos de esa categoría en cada idioma.
8. SEO: sitemaps por locale, `hreflang` cruzado + `x-default` → `/es`, canonical autocontenida. Verificación: inspección del `<head>` en ambas versiones.
9. Componente `lib/analytics.tsx` con GA4 + GTM (IDs por env). Verificación: pageview registrado en modo debug.
10. `scripts/seed.ts` idempotente (por `code`) + carga de 2-3 plantillas reales con fotos. Verificación: correrlo dos veces no duplica.
11. Deploy en Railway + dominio .com apuntando a `/es` como default. Verificación: el sitio responde en producción en ambos idiomas.

## Criterios de aceptación

- [ ] `/es` y `/en` responden 200 en producción con el contenido en su idioma.
- [ ] El switcher cambia de idioma conservando home, categoría y producto.
- [ ] Cada producto abre con su slug ES y su slug EN, y ambos muestran el mismo `code`.
- [ ] El `<head>` de cada página incluye `hreflang` es/en, `x-default` y canonical propia.
- [ ] El sitemap de cada locale lista home, categorías y productos publicados.
- [ ] El JSON-LD `Product` de cada plantilla marca el producto como gratis.
- [ ] Con DB de productos vacía, home y categoría muestran estado vacío sin errores.
- [ ] Correr el seed dos veces deja el mismo número de filas.
- [ ] GA4 registra pageviews de home, categoría y producto.
- [ ] Ningún string visible de UI vive fuera de `messages/*.json`.

## Decisiones

- **Sí:** dividir el MVP en specs (01 fundación+catálogo, 02 editor, 03 cuentas+descarga). Un spec único tocaba 5 áreas y no era implementable por pasos.
- **Sí:** Railway Postgres. App y DB en el mismo proveedor: menos piezas y menos costo.
- **Sí:** S3/R2 desde el día 1 (no volumen Railway). Las fotos son el activo del negocio y migran mal después.
- **Sí:** Drizzle + migraciones SQL versionadas. Sin codegen pesado para este modelo.
- **Sí:** segmento de ruta único (`templates`) con slugs traducidos. Segmentos localizados duplican código con el mismo valor SEO.
- **Sí:** GA4+GTM en el 01. El embudo orgánico se mide desde el día 1.
- **Sí:** carga por seed + script idempotente, sin admin UI. Solo el dueño sube plantillas.
- **Sí:** 2-3 plantillas reales como seed. Estructura vacía no permite validar el flujo entero.
- **Registrado para SPEC 02:** base A4-safe (descarta "solo Carta"), auto-shrink de texto libre, imagen mover+zoom dentro de zona fija, `AAA-000` como código canónico.
- **No:** traducir interiores técnicos de PDFs ni admin interno en esta etapa.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Slugs ES/EN colisionan entre sí | Unicidad por columna (`slug_es`, `slug_en`) + resolución que prueba ambas |
| Fotos pesadas frenan el home | Subida en AVIF/WebP responsivas; el seed valida pesos antes de publicar |
| `next-intl` + páginas estáticas rompe el switch | Todo el catálogo en render dinámico con cache por slug; verificado en el paso 6 |

## Lo que **no** está en este spec

- Editor, canvas, toolbar, preview, guardado de personalizaciones (SPEC 02).
- Registro, login social, descarga, email, historial, MI CUENTA (SPEC 03).
- Checkout, precios, pagos (ETAPA 2, fuera del MVP gratis).
- Admin visual, tercer idioma, videos, pauta publicitaria.

Cada uno de esos, si llega, va en su propio spec.
