# Project Dolphin — Tienda Pop-Up Cards Personalizables (MVP Spec)

Fecha: 2026-10-07
Estado: Aprobado en diseño conversacional (5/5 secciones)
Opción elegida: B — Tienda personalizable con formulario

## 0. Brief acordado

- **Idea:** plantillas PDF personalizables (pop-up / plegables) que el usuario edita con fotos/textos, previsualiza, paga y descarga para imprimir y armar en casa.
- **Flujo:** inspiración estilo Pinterest → plantilla → editar → preview → pago → descarga por email → compartir foto terminada.
- **Público MVP:** DIY / crafters / regalos personalizados, 20-45 años, con acceso a impresora o papelería. Quiere regalo emocional sin saber diseñar.
- **Éxito MVP (60 días):** tienda pequeña funcionando con checkout y descargas. Métrica primaria: ventas pagadas. Secundaria: embudo visita → personalizar → checkout → pago.
- **Restricciones:** ~$10,000 MXN, 2 meses, empezar desde cero, Next.js SEO-first, fullstack + diseño propio.
- **Catálogo MVP:** solo pop-up cards, 8-10 productos + 1 gratis por email.
- **Editor MVP:** formulario simple (foto, nombre, fecha, mensaje, color/fuente). Sin canvas libre.
- **Pagos:** Merchant of Record (Paddle / Lemon Squeezy / Polar) para venta global sin gestionar IVA por país.

Opciones descartadas:
- A (validación ultra-ligera sin editor) → se usa como táctica semana 1-2, no como MVP final.
- C (tienda curada multi-diseñador) → diferida. Esquema deja puerta abierta, sin construir split-payments.

## 1. Arquitectura y alcance MVP

Stack:
- Next.js App Router, `/`, `/pop-up-cards/[categoria]`, `/templates/[slug]` como landings indexables + JSON-LD Product.
- Postgres (Supabase / Neon) para productos, pedidos, personalizaciones JSON, emails.
- Storage S3 / R2 con URLs firmadas con expiración 48h.
- PDF en servidor con pdf-lib. Plantilla base 300 DPI + overlay JSON. Preview cliente PNG 800px con watermark. PDF alta calidad solo post-pago.
- MoR webhook `payment.succeeded` como única puerta a generación.
- Resend para entrega, recuperación y email día 7 “sube tu foto armada”.
- Sin auth obligatoria: guest personaliza, cuenta creada vía magic link al pagar. `customization_json` persistido en localStorage + DB.

En alcance:
- Home galería Pinterest, categorías, página producto con fotos reales + video 15s, editor formulario, checkout MoR, descarga, biblioteca re-descargable, admin mínimo, freebie por email.

Fuera del MVP:
- Marketplace automatizado, dashboard diseñadores, Stripe Connect, canvas libre Fabric/Konva, 3D Three.js, IA, suscripciones, afiliados, app móvil, reviews complejos, multidioma avanzado, integraciones impresión.

## 2. Componentes y editor

- `Galería Ideas (home)`: cards foto terminada → CTA “Personaliza este diseño”. Tracking click → producto.
- `Página Producto`: fotos cerrada / abierta / detalle / manos + video, dificultad / tiempo / materiales / tamaño Carta+A4, precio por tier:
  - Simple $2.99-3.99, Personalizable $4.99-6.99, Premium $7.99-12.99
  - Personal $3.99 ejemplo, Comercial $9.99 ejemplo (licencia futura, MVP solo personal + nota).
  - CTA “Probar este diseño” sin login.
- `Editor formulario (no canvas libre)`:
  - Subir foto + validación resolución mínima + recorte básico.
  - Campos: nombre, fecha, mensaje max 120 chars, selector color, fuente (solo Google Fonts OFL).
  - Canvas solo lectura pinta zonas fijas `{{photo_1}} {{title}} {{message}}`. Prohibido mover/escalar libre en MVP para mantener imprimibilidad.
- `Checkout / Descarga`: resumen + preview watermark + pagar MoR → webhook crea pedido → genera PDF alta + URL firmada + email + biblioteca magic link.
- `Admin mínimo`: CRUD productos, ver ventas, subir PDFs base + fotos. Sin dashboard diseñadores (manual por form futuro).

Reapertura: `customization_id + email` permite reeditar textos y recomprar sin re-subir todo.

## 3. Flujo de datos y generación PDF

Flujo feliz:
Visita → Producto visto → Personalizar iniciado → Checkout → Pago OK → Generar PDF → Email + Descarga → UGC.

Tablas:
- `products(id, slug, categoria, precio_cents, moneda, archivos_base, fotos, video, dificultad, tiempo_min, materiales, es_gratis)`
- `customizations(id, product_id, email, json{font,color,textos,photo_key}, preview_url, created_at)`
- `orders(id, email, product_id, customization_id, mor_payment_id unique, status, download_url, expira_en)`

Generación PDF:
- Base validada físicamente 1 vez por diseño (imprimir + armar). Incluye sangrado, corte línea sólida, doblez línea punteada, página 1 instrucciones “imprimir al 100% sin ajustar”.
- Servidor con pdf-lib incrusta foto + textos con fuentes embebidas. Rechaza foto <150 DPI efectivo con mensaje claro antes de cobrar si es posible, o antes de generar si ya pagó (re-pedir foto, no reembolsar directo).
- Preview = PNG baja + watermark diagonal. PDF final nunca expuesto pre-webhook.
- Idempotencia: `mor_payment_id` único. Verificación firma webhook. Reintento cola simple. No regenerar si order existe.

## 4. Errores, impresión y riesgos

- Impresión: Carta + A4 únicos. Guía impresa en PDF. Validación foto en cliente.
- Pagos: guest, precios USD + display local vía MoR. `payment.failed` conserva personalización. Mensaje + reintento.
- Abuso: rate-limit previews, URLs cortas, email comprador en metadatos PDF (disuasorio, sin DRM pesado).
- Legal MVP: términos licencia personal, checkbox “tengo derechos de la foto”, solo fuentes OFL. Comercial/Extended solo como texto futuro, no como feature.
- Mecánica pop-up: si no cierra bien en papel, no se publica. Soporte = 1 FAQ + 1 video armado por categoría.
- Riesgos aceptados: piratería PDF (mitigado con precio bajo + personalización), chargebacks digitales (MoR ayuda con evidencia), marketplace vacío (evitado al no hacer marketplace en MVP).

## 5. Testing, métricas y plan 60 días

Testing:
- Playwright happy-path: personalizar → pagar test-mode → descargar abre PDF válido.
- Unit pdf-lib: texto largo trunca con elipsis, foto ausente = error claro, fuentes embebidas presentes.
- Manual: imprimir + armar cada 1 de las 10 plantillas en Carta y A4.

Métricas:
- Primaria: nº transacciones pagadas. Meta inicial: 20-30 ventas para validar.
- Embudo: visita → personalizar >10%, personalizar → checkout >30%, checkout → pago. Diagnosticar:
  - visitas sin personalización = producto/preview/precio.
  - personalización sin pago = confianza/checkout/método pago.

Plan 60 días:
- D1-10: marca + 5 PDFs propios + landing.
- D11-20: catálogo + checkout MoR test.
- D21-30: editor formulario + PDF server.
- D31-45: pulir + llegar a 10 productos + freebie email.
- D46-60: Pinterest 3 pins/producto + Reels manos + ads $3k MXN en tandas $300 → medir.

Presupuesto ~$10k MXN:
dominio $500, infra $1000, email/herramientas $500, mockups $500, pruebas pago $500, ads experimental $3000, promos $1000, reserva $3000. No gastar ads de golpe.

## Self-review

- Placeholders: ninguno. Precios, tablas, tiers y plan definidos.
- Consistencia: editor formulario-simple en §2 coincide con pdf-lib overlay §3 y con exclusión canvas libre §1. MoR en §1 y §3 coincide. Solo pop-up en brief y catálogo.
- Alcance: cabe en un plan. C como extensión manual futura, no incluida.
- Ambigüedad: MoR exacto (Paddle vs Lemon) se deja a implementación por comisiones test, sin bloquear. Licencia comercial solo informativa en MVP para evitar alcance fiscal extra.
