# Project Dolphin — Tienda Pop-Up Cards Personalizables (MVP Spec)

Fecha: 2026-10-07
Revisión grill: 2026-10-07 (MX-first + bloque2: A4-safe, 2 fotos, free diferido, re-login)
Estado: Aprobado en diseño conversacional (5/5 secciones) + parches grill
Opción elegida: B — Tienda personalizable con formulario

## 0. Brief acordado

- **Idea:** plantillas PDF personalizables (pop-up / plegables) que el usuario edita con fotos/textos, previsualiza, paga y descarga para imprimir y armar en casa.
- **Flujo:** inspiración estilo Pinterest → plantilla → editar → preview → pago → descarga por email → compartir foto terminada.
- **Público MVP:** DIY / crafters / regalos personalizados MX/Latam español, 20-45 años, con acceso a impresora o papelería. Quiere regalo emocional sin saber diseñar.
- **Éxito MVP (60 días):** tienda pequeña funcionando con checkout y descargas. Métrica primaria: ventas pagadas. Secundaria: embudo visita → personalizar → checkout → pago.
- **Restricciones:** ~$10,000 MXN, 2 meses, empezar desde cero, Next.js SEO-first, fullstack + diseño propio. Dielines propios ya validados en papel (fase D1-10 es digitalizar, no diseñar desde cero).
- **Catálogo MVP:** solo pop-up cards, 8-10 productos + 1 gratis por email.
- **Editor MVP:** formulario simple (foto, nombre, fecha, mensaje, color/fuente). Sin canvas libre. Upscale IA solo como fallback limitado (ver §3-§4).
- **Pagos (decisión grill MX-first phased):** Fase 1 solo-MX con Mercado Pago (tarjeta/wallet instantáneo, OXXO desactivado). Precios en MXN. MoR (Paddle / Lemon Squeezy / Polar) queda como feature-flag apagado con interfaz `PaymentProvider` abstracta; se enciende solo si >20 ventas MX o al expandir global. No construir híbrido día 1.

Opciones descartadas:
- A (validación ultra-ligera sin editor) → se usa como táctica semana 1-2, no como MVP final.
- C (tienda curada multi-diseñador) → diferida. Esquema deja puerta abierta, sin construir split-payments.

## 1. Arquitectura y alcance MVP

Stack:
- Next.js App Router, `/`, `/pop-up-cards/[categoria]`, `/templates/[slug]` como landings indexables + JSON-LD Product.
- Postgres (Supabase / Neon) para productos, pedidos, personalizaciones JSON, emails, magic_tokens.
- Storage S3 / R2 con URLs firmadas cortas (15min) regeneradas por request. Nada de PDF permanente compartible. Biblioteca = magic token que regenera firmada bajo demanda, revocable.
- PDF en servidor con pdf-lib. 1 sola base A4-safe 300 DPI + overlay JSON (1 set por plantilla, no 20). Área crítica a 15-18mm del borde para que imprima en Carta al 100% sin recorte. Preview cliente PNG 800px con watermark. PDF alta calidad solo post-pago o post-verificación email (free).
- Pagos: interfaz `PaymentProvider` abstracta. Fase 1: Mercado Pago webhook `payment.approved` como única puerta a generación. OXXO y pagos offline desactivados para mantener promesa “descarga inmediata”. MoR (Paddle/Lemon/Polar) implementado solo como flag `MOR_ENABLED=false`, sin doble checkout en MVP.
- Resend para entrega, recuperación y email día 7 “sube tu foto armada”. Freebie con doble opt-in: preview instant, PDF solo tras clic inbox.
- Sin auth obligatoria: guest personaliza. Re-login por email en cada descarga (decisión grill: fricción aceptada). `customization_json` persistido en localStorage + DB. Reapertura solo con token secreto, no solo `customization_id+email` enumerable.

En alcance:
- Home galería Pinterest, categorías, página producto con 2 fotos reales (cerrada/abierta) MVP + video 15s diferido tras 20 ventas, editor formulario, checkout Mercado Pago MX, descarga con re-login, biblioteca re-descargable con token, admin mínimo, freebie por email verificado.

Fuera del MVP:
- Marketplace automatizado, dashboard diseñadores, Stripe Connect, canvas libre Fabric/Konva, 3D Three.js, suscripciones, afiliados, app móvil, reviews complejos, multidioma avanzado, integraciones impresión.
- IA generativa libre. Única excepción: upscale foto puntual vía OpenAI cuando DPI <150, con consentimiento + límites (ver §3-§4). Sin upscale libre ni generación de diseños.

## 2. Componentes y editor

- `Galería Ideas (home)`: cards foto terminada → CTA “Personaliza este diseño”. Tracking click → producto.
- `Página Producto`: 2 fotos reales MVP (cerrada / abierta) + detalle/manos y video 15s diferidos tras 20 ventas, dificultad / tiempo / materiales / tamaño A4-safe (compatible Carta al 100%), precio por tier en MXN (Fase 1 MP):
  - Simple $49, Personalizable $79-99, Premium $149-189
  - Personal incluido, Comercial/Extended solo como texto futuro, MVP solo personal + nota. Test A/B $79 vs $99 en D46-60.
  - Equiv. USD solo informativo para MoR futuro ($2.99-12.99). No mostrar USD en checkout MX.
  - CTA “Probar este diseño” sin login.
- `Editor formulario (no canvas libre)`:
  - Subir foto + validación resolución mínima (DPI efectivo <150 = warn) + recorte básico.
  - Upscale fallback: si falla DPI, ofrecer 1 intento vía OpenAI con checkbox “Acepto enviar mi foto a OpenAI para mejorarla” + disclaimer “IA puede alterar ligeramente rostros/texturas”. Usuario decide continuar con upscaled o reemplazar por otra foto. Max 1 upscale por `customization_id`, rate-limit 5/día por IP+email + captcha en preview.
  - Campos: nombre, fecha, mensaje max 120 chars, selector color, fuente (solo Google Fonts OFL).
  - Canvas solo lectura pinta zonas fijas `{{photo_1}} {{title}} {{message}}`. Prohibido mover/escalar libre en MVP para mantener imprimibilidad.
- `Checkout / Descarga`: resumen + preview watermark + pagar Mercado Pago (solo métodos instantáneos, OXXO desactivado) → webhook crea pedido → genera PDF alta + email + biblioteca con re-login por email en cada descarga (magic token 15min → firmada 15min). MoR queda tras flag, no doble botón en MVP.
- `Freebie`: preview watermark instant sin fricción → pide email → doble opt-in → genera PDF personalizado (mismo flujo personalización completa, no versión pelada). Limpieza pendientes sin verificar a 7 días. Captcha + max 3 gratis/IP/día. Mitiga canibalización por personalización (nombre/foto) + diseño simple dedicado, no best-seller.
- `Admin mínimo`: CRUD productos, ver ventas, subir PDFs base + fotos. Sin dashboard diseñadores (manual por form futuro).

Reapertura: solo con magic token secreto (`token = UUIDv4 + secret`), nunca solo `customization_id + email`. Token 15min, firmada S3 15min regenerada por request, revocable. Re-login por email en cada descarga y en dispositivo nuevo.

## 3. Flujo de datos y generación PDF

Flujo feliz pago:
Visita → Producto visto → Personalizar iniciado → Checkout → Pago OK → Generar PDF → Email + Descarga (con re-login) → UGC.

Flujo freebie:
Visita → Personalizar gratis → Preview watermark instant → Email pedido → Clic inbox (opt-in) → Generar PDF personalizado → Descarga → Nurture a pago.

Tablas:
- `products(id, slug, categoria, precio_cents, moneda='MXN', archivos_base{A4-safe PDF}, fotos{cerrada,abierta}, video nullable, dificultad, tiempo_min, materiales, es_gratis)`
- `customizations(id UUID, product_id, email, json{font,color,textos,photo_original_key,photo_upscaled_key,upscaled:boolean,upscale_consent_at}, preview_url, verified:boolean, created_at)`
- `orders(id, email, product_id, customization_id, provider:'mercadopago'|'mor', provider_payment_id unique, status, download_url nullable, expira_en)`
- `magic_tokens(id UUID, email, customization_id/order_id, secret_hash, expira_en 15min, usado:boolean, revocado:boolean)`

Generación PDF:
- 1 sola base A4-safe por diseño (no 20 layouts). Diseñada en A4 300 DPI, área crítica mecanismo a ≥15-18mm del borde para tolerar Carta 216x279 al 100% sin recorte. Prohibido escalado auto impresora. Incluye sangrado, corte línea sólida, doblez línea punteada, página 1 instrucciones “imprimir al 100% sin ajustar + verificar regla 10cm”.
- D1-10 es digitalizar a 300 DPI + validar 1 impresión+armado por diseño en A4 y 1 chequeo en Carta (misma base, no 2 PDFs).
- Servidor con pdf-lib incrusta foto (original o upscaled según elección usuario) + textos con fuentes embebidas. Si DPI <150: warn antes de cobrar + ofrecer upscale 1x, nunca bloquear sin alternativa ni cobrar y luego pedir re-subida sin reembolso. Si ya pagó y foto inválida: re-pedir foto, no reembolsar directo, regenerar mismo order.
- Preview = PNG baja + watermark diagonal. PDF final nunca expuesto pre-webhook.
- Idempotencia: `provider_payment_id` único por provider. Verificación firma webhook (MP + MoR). Reintento cola simple. No regenerar si order existe.

## 4. Errores, impresión y riesgos

- Impresión: A4-safe único (compatible Carta al 100%). Guía impresa en PDF + regla 10cm. Validación foto en cliente + warn DPI, no bloqueo duro.
- Pagos: guest, precios MXN Fase 1 MP. Solo métodos instantáneos (OXXO desactivado en checkout para no romper promesa inmediata). `payment.failed` conserva personalización. Mensaje + reintento. MoR futuro: precios USD + display local, solo tras flag.
- Abuso: rate-limit previews + rate-limit upscale (5/día IP+email, captcha, 1 por customization_id) + rate-limit freebie (3 gratis/IP/día, captcha, opt-in requerido), magic token 15min + firmada 15min regenerada, IDs UUID no enumerables, email comprador en metadatos PDF (disuasorio, sin DRM pesado). Costo OpenAI (~$0.02-0.08) solo post-consentimiento, nunca en loop gratis.
- Legal MVP: términos licencia personal, checkbox “tengo derechos de la foto” + checkbox separado “acepto enviar foto a OpenAI para upscale” con retención declarada, solo fuentes OFL, disclaimer alteración IA. Comercial/Extended solo como texto futuro, no como feature.
- Mecánica pop-up: dielines propios pre-validados en A4-safe. Si no cierra bien en papel, no se publica. Checklist MVP por producto: foto cerrada/abierta (detalle/manos + video diferidos). Soporte = 1 FAQ + 1 video armado por categoría.
- Riesgos aceptados: piratería PDF (mitigado con precio bajo + personalización), chargebacks digitales (MP evidencia + MoR futuro ayuda), marketplace vacío (evitado al no hacer marketplace en MVP). Riesgo nuevo aceptado: solo-MX limita TAM a cambio de simplicidad fiscal; expansión global requiere activar MoR + VAT.

## 5. Testing, métricas y plan 60 días

Testing:
- Playwright happy-path: personalizar → pagar MP test-mode (tarjeta) → descargar abre PDF válido. Test OXXO desactivado (no aparece). Test MoR flag OFF. Happy-path freebie: preview → email → opt-in → PDF.
- Unit pdf-lib: texto largo trunca con elipsis, foto ausente = error claro, fuentes embebidas presentes. Unit upscale: 1x por customization, rate-limit, consent requerido. Unit auth: token enumerable rechazado, firmada expirada rechazada, re-login requerido.
- Manual: imprimir + armar cada 1 de las 10 plantillas A4-safe (1 base por diseño) y chequeo en Carta al 100% + regla 10cm.

Métricas:
- Primaria: nº transacciones pagadas MP MX. Meta inicial: 20-30 ventas para validar.
- Embudo: visita → personalizar >10%, personalizar → checkout >30%, checkout → pago. Diagnosticar:
  - visitas sin personalización = producto/preview/precio.
  - personalización sin pago = confianza/checkout/método pago.
- Precio: test $79 vs $99 personalizable. Funnel separado freebie vs pago.

Plan 60 días:
- D1-10: marca + digitalizar 5 PDFs propios A4-safe (dielines ya validados) + landing MX español con 2 fotos por producto.
- D11-20: catálogo + checkout Mercado Pago test (solo instantáneo) + magic tokens re-login.
- D21-30: editor formulario + PDF server + upscale 1x con consentimiento + freebie opt-in.
- D31-45: pulir + llegar a 10 productos (2 fotos c/u) + freebie email. Video 15s y fotos detalle/manos diferidos tras 20 ventas.
- D46-60: Pinterest 3 pins/producto ES + Reels manos (celular, fondo fijo) + ads $3k MXN en tandas $300 solo MX → medir. MoR solo como refactor flag, no construir.

Presupuesto ~$10k MXN:
dominio $500, infra $1000, email/herramientas $500, mockups $500, pruebas pago $500, OpenAI upscale cap $500 (rate-limitado), ads experimental $3000, promos $1000, reserva $2500. No gastar ads de golpe.

## Self-review

- Placeholders: ninguno. Precios MXN, tiers, tablas, plan definidos.
- Consistencia: editor formulario-simple en §2 coincide con pdf-lib overlay §3 y con exclusión canvas libre §1. Pagos MX-first MP en §0, §1, §3, §4 coinciden (MoR solo flag). Solo pop-up en brief y catálogo. Upscale IA limitado documentado en §2-§4, no IA libre. A4-safe único en §1, §3, §4, §5 coincide (no 20 layouts). Auth re-login + magic_tokens en §1-§4 coincide (no links permanentes). Freebie preview instant + PDF opt-in en §1-§3 coincide.
- Alcance: cabe en un plan. C como extensión manual futura, no incluida. Híbrido real diferido tras 20 ventas. Fotos recortadas a 2 + video diferido para caber en D1-45.
- Alcance: cabe en un plan. C como extensión manual futura, no incluida. Híbrido real diferido tras 20 ventas.
- Ambigüedad restante: MoR exacto (Paddle vs Lemon) se deja a fase global por comisiones test, sin bloquear MVP. Licencia comercial solo informativa en MVP para evitar alcance fiscal extra.
