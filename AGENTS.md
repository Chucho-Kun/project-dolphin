# AGENTS.md — Project Dolphin

Pop-up cards personalizables: galería estilo Pinterest → editor formulario → preview watermark → pago → PDF por email. Público MX/Latam ES. Presupuesto ~$10k MXN, 60 días.

## Estado del repo

SPEC 01 implementada en la rama `spec-01-fundacion-catalogo-bilingue`: scaffold Next.js 16 App Router + TS + Tailwind v4 + `next-intl` (`/es` default, `/en`), Drizzle + Postgres, R2, catálogo bilingüe con SEO y seed. Comandos reales:

- `npm run dev` / `npm run build` / `npm run start` / `npm run lint`
- `npm run db:generate` / `npm run db:migrate` / `npm run db:push` / `npm run db:studio` / `npm run db:seed`
- Deploy: Railway (Nixpacks, ver `railway.json`; el arranque aplica migraciones y expone `/api/health`).

## Fuente de verdad

- `docs/superpowers/specs/2026-10-07-pop-up-store-mvp-design.md` — spec aprobada (opción B, tienda con formulario). Ante conflicto con `brainstorm/`, la spec manda.
- Dielines pop-up ya validados en papel; fase D1-10 es digitalizar, no diseñar desde cero.

## Decisiones que no cambiar sin motivo

- Stack: Next.js App Router (SEO-first, landings indexables + JSON-LD Product), Postgres (Supabase/Neon), Storage S3/R2, pdf-lib en servidor, Resend.
- Pagos Fase 1 solo-MX con Mercado Pago (métodos instantáneos; OXXO desactivado). Precios MXN: Simple $49, Personalizable $79-99, Premium $149-189. `PaymentProvider` abstracta con flag `MOR_ENABLED=false`; no construir checkout dual día 1.
- PDF: 1 sola base A4-safe 300 DPI por diseño, área crítica a 15-18mm del borde (compatible Carta al 100%, sin escalado auto). Preview = PNG 800px con watermark; PDF alta calidad solo post-pago o post-opt-in (free). Webhook `payment.approved` es la única puerta a generación; `provider_payment_id` único (idempotencia).
- Descargas: sin links permanentes. Magic token (UUIDv4+secret, 15min) → URL firmada regenerada por request (15min), revocable. Re-login por email en cada descarga. Reapertura solo con token secreto, nunca `customization_id+email`.
- Editor: solo formulario (foto, nombre, fecha, mensaje ≤120 chars, color, fuentes Google OFL). Canvas solo lectura con zonas fijas; prohibido canvas libre / mover-escalar en MVP.
- Upscale IA solo fallback puntual vía OpenAI si DPI <150: consentimiento explícito, 1x por `customization_id`, rate-limit 5/día IP+email + captcha. Freebie: preview instant, PDF solo tras doble opt-in; limpieza pendientes a 7 días; max 3 gratis/IP/día + captcha.
- Catálogo MVP: solo pop-up cards, 8-10 productos + 1 gratis. Por producto: 2 fotos reales (cerrada/abierta); detalle/manos y video 15s diferidos tras 20 ventas.

## Convenciones al implementar

- Guest personaliza sin auth; `customization_json` en localStorage + DB. Email del comprador en metadatos PDF (disuasorio, sin DRM).
- Tablas previstas en spec §3: `products`, `customizations`, `orders`, `magic_tokens` — usar esos nombres/campos.
- Testing cuando exista código: Playwright happy-path (personalizar → pagar MP test-mode → descarga PDF válido; OXXO ausente; flag MoR OFF; flujo freebie opt-in) + unit pdf-lib (elipsis, foto ausente, fuentes embebidas) + manual imprimir+armar cada diseño en A4 y chequeo en Carta con regla 10cm.
- Fuera del MVP (no construir): marketplace, split-payments, canvas libre, 3D, suscripciones, IA generativa libre, licencia comercial como feature.
