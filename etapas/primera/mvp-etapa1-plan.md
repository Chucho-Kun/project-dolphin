# MVP ETAPA 1 — Plan de diseño y desarrollo

**Proyecto:** Project Dolphin — plantillas PDF de pop-up cards personalizables.
**Fecha:** 2026-10-09 · **Estado:** aprobado para desarrollo (grilling 09-oct).
**Dominio:** .com global · **Idiomas día 1:** ES + EN · **Modelo ETAPA 1:** todo gratis.

## 0. Cómo leer este documento

- Este plan **manda sobre la spec anterior** (`docs/superpowers/specs/2026-10-07-pop-up-store-mvp-design.md`)
  en todo lo relativo a modelo (gratis vs pagos), mercado (global vs MX-first) e idioma (EN+ES vs solo ES).
- Lo que la spec anterior sigue aportando y se **reutiliza sin cambios**: generación PDF con pdf-lib
  (base A4-safe 300 DPI, área crítica 15-18mm), preview PNG 800px con watermark, esquema de tablas
  (`products`, `customizations`, `orders`, `magic_tokens`), rate-limits anti-abuso y checklist de imprimibilidad.
- Fuente de requisitos funcionales: `brainstorm/arquitectura/MVP-basics.md` (11 puntos del flujo de usuario).

## 1. Visión y modelo por etapas

**ETAPA 1 (este documento):** sitio global en .com, todo GRATIS, en ES+EN. Objetivo: generar
tráfico orgánico y construir lista de emails. No hay checkout ni pagos.

**ETAPA 2 (diferida, no construir):** monetización — checkout (Mercado Pago MX + MoR global),
tiers de precio, webhook como puerta a generación de PDF premium. Se activa con criterios de salida (§10).

**Expansión (diferida):** tercer idioma y siguientes sobre el ecosistema de traducción (§6).

### Métricas de éxito ETAPA 1

- Primaria: **tráfico orgánico** (sesiones SEO + Pinterest + YouTube) y **emails captados**.
- Secundarias: embudo visita → personalizar → email registrado → descarga; plantillas descargadas por producto.
- La "venta pagada" **no** es métrica en ETAPA 1 (queda para ETAPA 2).

## 2. Alcance ETAPA 1 (flujo de usuario)

Flujo acordado (de `MVP-basics.md`):

1. Home estilo e-commerce: banner horizontal + grid de 4 columnas con fotos de productos, todos con badge **GRATIS**.
2. Click → página de producto con **URL amigable** (`/es/plantillas/[slug]`, `/en/templates/[slug]`):
   foto en grande, descripción, video de YouTube (cómo armarlo), botón **PERSONALIZAR**.
3. Editor básico: subir/reemplazar imagen de la plantilla, **ajustar imagen dentro de su zona fija**
   (zoom/recorte, ver §7 — prohibido mover/escalar libre), cambiar texto, tipografía y colores.
4. Botón **DESCARGAR** → modal:
   - **Caso 1, no registrado:** campo email + social login (Google y Facebook).
     Texto: "Crea tu cuenta y guarda tus plantillas".
   - **Caso 2, registrado:** "¿El diseño está listo para su descarga?" + ACEPTAR / CANCELAR.
5. El usuario **recibe el PDF en su correo** (además de descarga directa tras confirmar).
6. La cuenta guarda **historial de descargas** (desde DB).
7. Sección **MI CUENTA**: nombre/pseudónimo, idioma, país + datos que surjan en desarrollo.

Solo el dueño sube plantillas (sin marketplace, sin dashboard de diseñadores).

### Fuera de ETAPA 1 (no construir)

Pagos/checkout, canvas libre, 3D, suscripciones, app móvil, reviews complejos, IA generativa libre,
licencia comercial como feature, tercer idioma.

## 3. Arquitectura

**Stack mínimo ETAPA 1** (decisión grill: nada más entra al MVP):

| Pieza | Elección | Rol |
|---|---|---|
| App | Next.js App Router + React + TypeScript + Tailwind | Front SEO-first + editor + API routes |
| DB | PostgreSQL (Railway o Supabase/Neon) | Productos, customizaciones, cuentas, tokens |
| Storage | S3 / R2 (o volumen Railway al inicio) | Fotos, PDFs base, PDFs generados |
| Email | Resend | Entrega de PDF, verificación, nurture |
| Hosting | Railway | App + DB + jobs |
| Analítica/Ads | GA4 + GTM (+ Ads/Meta diferidos a tracción) | Medición embudo y tráfico |
| PDF | pdf-lib en servidor | Overlay foto+textos sobre base A4-safe |
| Diseño | Photoshop / Illustrator | Digitalizar dielines a 300 DPI |

**Excluidos del MVP** (aunque estén en el inventario del equipo): Express, Apollo/GraphQL, PHP,
MongoDB, n8n. Re-evaluar solo si ETAPA 2 los justifica (p. ej. n8n para nurture).

### Tablas (heredadas de la spec, vigentes)

`products`, `customizations`, `orders` (se usa para descargas gratis en ETAPA 1: `provider='free'`),
`magic_tokens` + tabla `users` (OAuth/email — nueva, requerida por MI CUENTA e historial).

## 4. Rutas y SEO-first

- Landings indexables: `/[locale]/` (home), `/[locale]/pop-up-cards/[categoria]`,
  `/[locale]/templates/[slug]` (ES: `/es/plantillas/[slug]`).
- JSON-LD `Product` por plantilla (precio: marcar como gratis / `offers` sin precio en ETAPA 1).
- Sitemap por locale + `hreflang` cruzado es↔en (§6). Canonical autocontenida por locale.
- Editor y MI CUENTA en `noindex` (no aportan SEO, evitan thin content).
- Imágenes: AVIF/WebP responsivas, `alt` descriptivo en cada idioma, fotos reales cerrada/abierta por producto.

## 5. Tráfico orgánico (objetivo primario)

1. **SEO on-page ES+EN:** keywords transaccionales/informativas por idioma
   ("pop up card template printable" / "plantilla tarjeta pop up para imprimir"), contenido único por locale
   (no traducción espejo palabra por palabra donde dañe intención de búsqueda).
2. **YouTube:** video de armado por producto (decisión pendiente §9: 1 por categoría al inicio).
   Descripción con link a la URL amigable de la plantilla.
3. **Pinterest:** 3 pins por producto por idioma; tableros por ocasión (cumpleaños, bodas, San Valentín…).
4. **Reels manos** (celular, fondo fijo) reciclando el material de YouTube.
5. **Email/nurture:** doble opt-in para el freebie (preview instant, PDF tras clic inbox — heredado de la spec),
   email día 7 "sube tu foto armada" para UGC/galería.

## 6. Estrategia i18n EN+ES día 1

### Principio

Todo el **contenido incurre en costo ×2** (páginas, emails, metadatos, `alt`, videos/descripciones).
El ecosistema debe hacer que el idioma 3 sea agregar archivos, no refactorizar.

### Decisiones

- **Routing por subdirectorio:** `/es/...` (default) y `/en/...`. Recomendación técnica: `next-intl`
  (App Router, switch de locale con re-render instantáneo, mensajes por locale).
- **Prohibido widget de traducción automática** (tipo Google Translate embebido): rompe hreflang,
  duplica/contamina indexación y daña calidad. El "cambio en tiempo real" = switcher de locale,
  no auto-traducción.
- **Ecosistema de traducción** (construir en ETAPA 1):
  - `messages/es.json`, `messages/en.json` (única fuente de strings UI; prohibido hardcodear texto).
  - Contenido CMS-like en DB con campo por locale (`products`: `slug_es/slug_en`, `titulo_*`, `descripcion_*`).
  - Emails Resend con templates ×2 (versión ES y EN según `users.locale`).
  - Convención de claves documentada para que el idioma 3 = copiar `en.json` + traducir + migration de columnas.
- **No se traduce día 1:** interior técnico de PDFs (líneas de corte/doblez e instrucciones de impresión
  se mantienen bilingües en una sola base A4-safe), logs/admin interno.

### SEO multilingüe

- `hreflang="es"` / `hreflang="en"` + `x-default` (→ `/es`, mercado inicial más fuerte).
- Sitemaps separados por locale registrados en Search Console como dos propiedades de seguimiento.
- Slugs localizados (`/es/plantillas/tarjeta-cumpleanos` ↔ `/en/templates/birthday-card`), enlazados entre sí.

## 7. Editor (límites que protegen la imprimibilidad)

- Formulario + canvas **solo lectura** con zonas fijas `{{photo_1}} {{title}} {{message}}`.
- Ajuste de imagen permitido: **zoom/recorte dentro de su zona** (crop-box fijo). Decisión grill pendiente
  de confirmación final: NO mover/escalar/rotar libre — rompería dielines validados en papel.
- Campos: foto (validación DPI <150 = aviso, no bloqueo), nombre, fecha, mensaje ≤120 caracteres,
  color, tipografía (solo Google Fonts OFL, embebidas en el PDF).
- Upscale IA: solo fallback con consentimiento explícito, 1× por `customization_id`,
  rate-limit 5/día IP+email + captcha (heredado de la spec; costo OpenAI con cap).
- Preview = PNG 800px con watermark diagonal. PDF final solo post email-verificado/descarga confirmada.

## 8. Cuentas, descarga y anti-abuso

- **Email obligatorio para descargar** (social Google/Facebook o registro email + verificación).
  El PDF se envía al correo y queda en el historial de MI CUENTA.
- Sin links permanentes: token de descarga (UUIDv4+secret, 15 min) → URL firmada regenerada por request
  (15 min), revocable (heredado de la spec).
- Anti-abuso ETAPA 1: captcha en descarga, max 3 gratis/IP/día, limpieza de pendientes sin verificar a 7 días,
  email del usuario en metadatos del PDF (disuasorio, sin DRM).
- Legal mínimo: checkbox "tengo derechos de la foto", términos de licencia personal, fuentes OFL.

## 9. Puntos abiertos del grilling (decidir en desarrollo)

| # | Tema | Recomendación | Si se elige lo contrario… |
|---|---|---|---|
| 1 | Alcance del "ajustar imagen" | Solo zoom/recorte en zona fija | Mover libre exige re-validar imprimibilidad por diseño |
| 2 | Videos YouTube | 1 por **categoría** al inicio (reutilizable) + 1 por producto tras tracción | 8-10 videos día 1 come la fase D1-10 de digitalización |
| 3 | Switch de idioma | `next-intl` con switcher | Auto-traducción embebida queda prohibida (daña SEO) |
| 4 | Fotos por producto | 2 reales (cerrada/abierta); detalle/manos diferidos | Retrasa lanzamiento |

## 10. Plan de trabajo y criterios de salida

### Fases (60 días, ajustado a ETAPA 1 gratis + i18n)

- **D1-10:** marca .com + digitalizar 5 PDFs base A4-safe + scaffold Next.js con i18n (`next-intl`,
  routing `/es` `/en`, `messages/*.json`) + landings ES+EN con 2 fotos por producto.
- **D11-20:** catálogo + editor formulario (crop fijo) + generación PDF server + cuentas (email + Google/Facebook).
- **D21-30:** modal descarga (2 casos) + envío PDF por Resend (templates ES+EN) + MI CUENTA + historial.
- **D31-45:** 10 productos + 1 gratis destacado + videos YouTube (según decisión §9.2) + hreflang/sitemaps/JSON-LD.
- **D46-60:** Pinterest (3 pins/producto/idioma) + Reels + pauta experimental pequeña → medir embudo orgánico.

### Criterios de salida de ETAPA 1 (disparan ETAPA 2 pagos)

- Tráfico orgánico sostenido + lista de emails con open-rate sano + funnel visita→descarga medido,
  o hito operativo (p. ej. ~20-30 descargas/día recurrentes o 1.000 emails verificados — fijar número en D30).
- Sin cumplir criterios: no se construye checkout (evita quemar presupuesto).

### Testing ETAPA 1

- Playwright: personalizar → modal email/social → descarga abre PDF válido; flujo freebie opt-in ES y EN;
  locale switch conserva página; hreflang presente.
- Unit pdf-lib: elipsis en texto largo, foto ausente = error claro, fuentes embebidas.
- Manual: imprimir + armar cada diseño en A4 y chequeo en Carta al 100% + regla 10cm.

## 11. Presupuesto orientativo (~$10k MXN)

Dominio .com ~$500 · infra (Railway+Storage) ~$1.000 · Resend/herramientas ~$500 · mockups/fotos ~$500 ·
OAuth/cuentas ~$0 (propio) · OpenAI upscale cap ~$500 (rate-limitado) · contenido/pauta experimental
~$3.000 en tandas pequeñas · promos ~$1.000 · reserva ~$2.500. **Ojo i18n:** duplica esfuerzo de contenido
(textos, emails, SEO); la reserva cubre desvíos de traducción/doblaje de videos.

## 12. Tareas de reconciliación documental (al iniciar desarrollo)

1. Enmendar `AGENTS.md`: modelo gratis ETAPA 1, global EN+ES, stack mínimo, este plan como fuente de verdad de etapa.
2. Congelar la spec 2026-10-07 como referencia técnica (PDF, tablas, anti-abuso), no como definición de producto.
3. Fijar en D30 el número exacto del criterio de salida (§10).
