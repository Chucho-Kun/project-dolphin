# SPEC 02 — Editor básico con zonas SVG y descarga PDF

> **Estado:** Implemented
> **Depende de:** SPEC 01, SPEC 1.2, SPEC 1.3
> **Fecha:** 2026-10-13
> **Objetivo:** El invitado personaliza una plantilla desde `/editor/[code]` moviendo su foto dentro de las zonas del SVG y editando sus textos, guarda con link de reapertura y descarga el PDF terminado.

## Por qué existe este spec

El botón `Editar diseño` de la página de producto (SPEC 1.3) apunta a un placeholder. El dueño aporta un SVG por plantilla que ya incluye guías de corte/doblez/pegado, márgenes de seguridad y textos default diseñados por él; este spec convierte ese SVG en un editor funcional con preview visual fiel y salida PDF imprimible, sin cuentas ni pagos. Revisado por grilling el 2026-10-13: PDF 100 % en cliente (provisional), sin reescalado, auto-shrink acotado, sanitización obligatoria.

## Alcance

**Dentro:**

- Reescritura de `app/[locale]/editor/[code]/page.tsx`: carga el producto por `code` (ruta ya reservada); sin SVG configurado, o con SVG sin medidas físicas, muestra aviso, no error.
- Canvas con el SVG inline **sanitizado**: zonas editables por contrato `id="zona-editable-N"` (N≥1), cada una con su imagen recortada vía `<clipPath>`; guías del SVG visibles tal cual (son parte del diseño); render 1:1 **sin reescalado**.
- Panel de imagen por zona: cargar desde el dispositivo (JPG/PNG/WebP, máx 10 MB, validado en cliente y servidor), arrastrar para posicionar, zoom (rueda/pellizca/botones), reset y auto-encuadre inicial; la imagen nunca sale de su zona.
- Panel de textos: edita los `<text>` dentro de `texto-editable-<clave>` (contenido, tamaño, color, fuente de lista fija Google OFL (inicial: `Roboto`, estilo según el SVG)) con **auto-shrink en rango [60 %, 100 %] del tamaño default** (límites REVISABLES); al llegar al piso trunca con elipsis y el panel lo indica.
- Guardar: sube imágenes a R2 (rate-limit 20/día/IP, best-effort), guarda ajustes en `customizations` (last-write-wins) y entrega link de reapertura `/editor/[code]?t=[token]` sin caducidad.
- Descargar PDF **100 % en cliente con `jsPDF`** (provisional, reversible a servidor): rasteriza a 300 DPI del tamaño declarado, genera página del mismo tamaño y descarga directa; **funciona sin haber guardado**.
- Fixture: si el dueño no entrega el SVG real, el implementador crea un SVG sintético mínimo marcado `TEMPORAL` (1 zona + 1 texto + guías falsas) para desbloquear el trabajo.
- Claves nuevas solo en `messages/es.json` + `messages/en.json` (`editor.*`); responsive (panel bajo el canvas en móvil).

**Fuera de alcance (para futuros specs):**

- Cuentas, login, MI CUENTA, historial y email: SPEC 03 (incluido rate-limit estricto y captcha).
- Generación de PDF en servidor (reversible: si el prototipo cliente no da calidad, vuelve en otro spec).
- Pagos y checkout (fuera del MVP gratis).
- Rotación de imagen, varias imágenes por zona, edición de los vectores/guías por el usuario, texto por encima del 100 % del default.
- Subida del SVG por UI (el SVG entra por `seed` + R2, sin admin).
- Caducidad/limpieza de personalizaciones e historial de versiones (last-write-wins, sin copias).
- Tercer idioma y textos de marketing definitivos.

## Modelo de datos

```ts
// db/schema.ts — lo nuevo de este spec
products += {
  plantillaSvgKey: text("plantilla_svg_key"), // key R2 del SVG base; null = editor con aviso
}
customizations = {
  id: uuid pk,
  productCode: text("product_code").notNull(), // AAA-000 canónico, FK a products.code
  tokenSecreto: text("token_secreto").notNull().unique(), // reapertura; nunca id+email
  imagenes: json("imagenes").notNull(),  // [{ zonaId: "zona-editable-1", r2Key }]
  ajustes: json("ajustes").notNull(),    // { imagenes: [{zonaId, x, y, escala}], textos: [{id, contenido, tamano, color, fuente}] }
  creadoEn / actualizadoEn: timestamp,
}
// El PDF no se almacena: se genera en el cliente en cada descarga.
// El rate-limit es best-effort en memoria por instancia; el estricto va en SPEC 03.
```

Contrato del SVG (lo marca el dueño en el archivo):

- `width`/`height` en **mm obligatorios** (p. ej. Carta 216×279 mm): definen el tamaño físico del diseño y de la página del PDF; `viewBox` mapea 1:1. Sin medidas → aviso, no se edita.
- `id="zona-editable-1"`, `"zona-editable-2"`, … en el `<g>` contenedor (rect o path hijo con la geometría); el editor usa el `getBBox()` del grupo, **oculta los rects marcadores** (solo aportan geometría, no se ven ni se imprimen) y dibuja su propio contorno de selección. Sin ninguna zona → aviso visible, no adivinanza.
- `<g id="texto-editable-<clave>">` (p. ej. `texto-editable-nombre`) con el `<text>` default dentro; clave semántica, no numérica, para que el panel sepa qué editar.
- Márgenes de seguridad para A4 y Carta **incluidos por el dueño en el archivo**; el editor no reescala ni recorta (el "A4-safe" de SPEC 01 se cumple en el archivo, no en runtime).
- Guías de corte/doblez/pegado ya incluidas: visibles en pantalla e impresas en el PDF.
- **Sanitización obligatoria en ingesta** (seed, fixture y cualquier carga): sin `<script>`, sin manejadores `on*`, parse sin ejecución. Un SVG de prueba con script debe salir limpio.

Convenciones:

- `code` sigue inmutable y es la única identidad en URLs del editor; el `tokenSecreto` (UUIDv4) solo viaja como `?t=`.
- Strings UI solo en `messages/*.json`; keys R2 e IDs de zona nunca hardcodeados en componentes salvo el prefijo del contrato.

## Plan de implementación

1. Migración + `db/schema.ts` (`plantilla_svg_key`, tabla `customizations`) + `seed` con el SVG real en R2. Piloto validado: `public/editor/FIG-001-A-BETA/diseno-piloto.svg` (3 zonas, `texto-editable-nombre` en Roboto vivo, 5.5 KB, sin scripts; el post-proceso agrega `width="210mm" height="297mm"` (A4 confirmado)). Si el dueño no entrega el SVG final, fixture sintético `TEMPORAL`. Verificación: `db:migrate` y `db:seed` 2x sin duplicar.
2. `app/api/uploads/route.ts` (imagen → R2, valida JPG/PNG/WebP 10 MB + rate-limit 20/día/IP) + `app/api/customizations/route.ts` (POST/PUT last-write-wins por token, GET por `?t=` reabre). Verificación: `curl` sube, guarda, reabre y recibe `429` al exceder el tope.
3. PDF en cliente con `jsPDF` (dependencia nueva, provisional): raster 300 DPI del tamaño declarado → página del mismo tamaño → descarga directa, sin guardar. Verificación: el PDF abre con página = medidas declaradas ±1 mm.
4. Reescribir `app/[locale]/editor/[code]/page.tsx` + `components/editor/PlantillaSvg.tsx` (SVG inline sanitizado, clipPaths por zona, render 1:1). Verificación: `/es/editor/[code]` muestra el diseño; sin SVG o sin mm hay aviso, no error.
5. `components/editor/PanelImagen.tsx` (cargar, mover, zoom, reset, auto-encuadre recortado a la zona). Verificación: la imagen nunca se sale de `zona-editable-N`.
6. `components/editor/PanelTexto.tsx` (contenido, tamaño, color, fuente OFL fija + auto-shrink con aviso de truncamiento). Verificación: texto largo encoge hasta el piso y luego muestra elipsis indicada.
7. `components/editor/EditorShell.tsx` (layout canvas+paneles, Guardar con link + Descargar directo). Verificación end-to-end: editar → descargar sin guardar funciona; guardar → reabrir restaura; guardar dos veces deja la última.
8. i18n `editor.*` ES/EN, responsive (panel bajo canvas en 360px), `npm run build` + `npm run lint` en verde, capturas 360/768/1280 e impresión física al 100 % medida con regla contra las medidas declaradas.

## Criterios de aceptación

- [ ] `/es/editor/[code]` y `/en/editor/[code]` responden 200 con canvas + paneles en su idioma para un producto con SVG.
- [ ] Un producto sin `plantilla_svg_key`, o con SVG sin medidas en mm, muestra aviso visible, sin error ni crash.
- [ ] Cada `zona-editable-N` del SVG acepta una imagen y la muestra recortada a su geometría.
- [ ] Arrastrar y zoom mueven/escalan solo la imagen dentro de su zona; reset restaura el auto-encuadre.
- [ ] Subir un no-imagen o >10 MB muestra error y no sube nada a R2 (cliente y servidor); exceder 20 subidas/día/IP devuelve `429`.
- [ ] Cada `texto-editable-<clave>` es editable en contenido, tamaño, color y fuente; lo no marcado no es editable.
- [ ] Texto que desborda encoge hasta el 60 % y luego trunca con elipsis; el panel indica el truncamiento.
- [ ] Un SVG de prueba con `<script>` ingerido sale sin scripts ni `on*` en el render.
- [ ] Guardar entrega un link `?t=` que, reabierto en otra sesión, restaura imágenes y textos; dos guardados dejan la última versión.
- [ ] Descargar PDF funciona sin haber guardado y devuelve un archivo cuya página mide lo declarado ±1 mm, con el diseño visto en pantalla (guías incluidas).
- [ ] Impresión física al 100 %: lo impreso mide contra regla lo declarado en el SVG.
- [ ] Slug ES y EN del producto llevan al editor del mismo `code`.
- [ ] Ningún string UI nuevo vive fuera de `messages/es.json` + `messages/en.json`.
- [ ] En 360px, 768px y 1280px no hay scroll horizontal (`scrollWidth <= innerWidth`).
- [ ] `npm run build` y `npm run lint` pasan en verde.
- [ ] El diff no toca home, categoría, página de producto, SEO ni sitemaps.

## Decisiones

- **Sí:** texto + imagen en este spec (el brainstorm pide ambos; partirlo duplicaría el cableado del canvas).
- **Sí (provisional):** PDF 100 % en cliente con `jsPDF` para probar; descarta servidor con `pdf-lib` por ahora — reversible en otro spec si la calidad no alcanza. El servidor conserva subidas y `customizations`.
- **Sí:** sin reescalado; el dueño incluye márgenes en el archivo. Descarta letterbox/stretch/crop en runtime (deformar o cortar una plantilla de corte la inutiliza).
- **Sí:** contrato mm estricto (`width`/`height` en mm = tamaño de página). Descarta asumir unidades.
- **Sí:** auto-shrink [60 %, 100 %] con límites REVISABLES y elipsis indicada al piso. Descarta crecer sobre el default y bloquear la escritura.
- **Sí:** múltiples zonas (`zona-editable-N`), una imagen por zona, sin rotación en el MVP.
- **Sí:** SVG por columna `plantilla_svg_key` + carga por seed/R2, sin admin UI (igual que los productos hoy); fixture sintético `TEMPORAL` si el real no está.
- **Sí:** sanitización obligatoria en ingesta. Descarta confiar en el archivo tal cual (XSS inline ante adulteración).
- **Sí:** persistencia invitada R2 + `customizations` con link `?t=` sin caducidad, last-write-wins; el PDF no se almacena.
- **Sí:** rate-limit simple 20/día/IP best-effort. Descarta captcha y rate-limit estricto (SPEC 03) y operar sin freno (spam a R2).
- **No:** cuentas, email, pagos, subida de SVG por UI, historial de versiones, caducidad/limpieza.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Canvas contaminado (CORS) al rasterizar impide exportar | Imágenes por blob/objectURL + `document.fonts.ready` antes de rasterizar; error visible si falla |
| El dueño declara mal las medidas en mm e imprime mal | Contrato mm + verificación impresa con regla contra lo declarado antes de publicar cada plantilla |
| SVG sin zonas o con IDs fuera del contrato | Aviso explícito en el editor; el contrato se documenta para el dueño |
| Raster 300 DPI pesado en móvil | Lado mayor limitado + JPEG calidad alta |
| Rate-limit best-effort débil con varias instancias | Aceptado en el MVP; estricto en SPEC 03 |
| Elipsis corta un mensaje importante sin que se note | El panel indica el truncamiento de forma visible |
| Links sin caducidad + last-write-wins permiten pisar diseños ajenos con el link | Aceptado: el link es el modelo de acceso; cuentas en SPEC 03 |

## Lo que **no** está en este spec

- Cuentas, login, historial, MI CUENTA, email, captcha, rate-limit estricto (SPEC 03).
- PDF en servidor.
- Pagos y checkout.
- Rotación, varias imágenes por zona, edición de vectores/guías, texto sobre el 100 %.
- Subida de SVG por UI y admin de plantillas.
- Historial de versiones, caducidad o limpieza de personalizaciones.
- Cambios en home, categoría, producto, SEO o sitemaps.

Cada uno de esos, si llega, va en su propio spec.
