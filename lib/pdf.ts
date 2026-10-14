// lib/pdf.ts — Descarga PDF 100 % en cliente con jsPDF (SPEC 02 Paso 3, provisional).
//
// Flujo: rasteriza el SVG del diseño a 300 DPI del tamaño declarado → página
// del mismo tamaño → descarga directa. Funciona sin haber guardado (no toca
// el servidor). Las guías van incluidas porque son parte del SVG.
// Riesgos del spec: canvas contaminado (CORS) → imágenes por blob/objectURL +
// `document.fonts.ready` antes de rasterizar, error visible si falla; raster
// pesado en móvil → lado mayor limitado + JPEG calidad alta.

export const PDF_DPI = 300;
const MM_POR_PULGADA = 25.4;
// A4 a 300 DPI = 2480×3508 px. Tope del lado mayor para no colgar el móvil.
const MAX_LADO_PX = 3508;
const CALIDAD_JPEG = 0.92;

/** mm → px a 300 DPI. */
export function mmAPx(mm: number): number {
  return Math.round((mm / MM_POR_PULGADA) * PDF_DPI);
}

/** Tamaño del raster en px para unas medidas declaradas (con tope móvil). */
export function dimensionesRaster(
  anchoMm: number,
  altoMm: number,
): { w: number; h: number } {
  const wReal = mmAPx(anchoMm);
  const hReal = mmAPx(altoMm);
  const mayor = Math.max(wReal, hReal);
  if (mayor <= MAX_LADO_PX) return { w: wReal, h: hReal };
  const factor = MAX_LADO_PX / mayor;
  return {
    w: Math.round(wReal * factor),
    h: Math.round(hReal * factor),
  };
}

/** Convierte una URL http(s) en dataURL; deja intactos data:/blob:. */
async function aDataUrl(url: string): Promise<string> {
  if (
    url.startsWith("data:") ||
    url.startsWith("blob:") ||
    url === ""
  ) {
    return url;
  }
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error("raster-fallo");
  const blob = await res.blob();
  return await new Promise<string>((ok, mal) => {
    const lector = new FileReader();
    lector.onload = () => ok(String(lector.result));
    lector.onerror = () => mal(new Error("raster-fallo"));
    lector.readAsDataURL(blob);
  });
}

/** Inserta como dataURL toda imagen externa del clon (evita canvas tainted). */
async function incrustarImagenes(clon: SVGSVGElement): Promise<void> {
  const nodos = clon.querySelectorAll("image");
  for (const nodo of Array.from(nodos)) {
    const href =
      nodo.getAttribute("href") ?? nodo.getAttributeNS("http://www.w3.org/1999/xlink", "href") ?? "";
    if (!href || href.startsWith("data:") || href.startsWith("blob:")) continue;
    const dataUrl = await aDataUrl(href);
    nodo.setAttribute("href", dataUrl);
    nodo.removeAttributeNS("http://www.w3.org/1999/xlink", "href");
  }
}

function cargarImagen(src: string, w: number, h: number): Promise<HTMLImageElement> {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => mal(new Error("raster-fallo"));
    img.width = w;
    img.height = h;
    img.src = src;
  });
}

/**
 * Rasteriza un SVG ya editado a JPEG a 300 DPI del tamaño declarado.
 * Debe llamarse en cliente. Lanza Error("raster-fallo") si el canvas se
 * contamina (CORS) o la imagen no carga: la UI lo muestra visible.
 */
export async function rasterizarSvgAJpeg(
  svg: SVGSVGElement,
  anchoMm: number,
  altoMm: number,
): Promise<string> {
  try {
    await document.fonts.ready;
  } catch {
    // Sin fuentes del sistema no se bloquea: se rasteriza con fallback.
  }
  const { w, h } = dimensionesRaster(anchoMm, altoMm);
  const clon = svg.cloneNode(true) as SVGSVGElement;
  // UI del editor (contornos de selección): visible en pantalla, fuera del PDF.
  clon.querySelectorAll("[data-ui]").forEach((n) => n.remove());
  await incrustarImagenes(clon);
  clon.setAttribute("width", String(w));
  clon.setAttribute("height", String(h));
  const texto = new XMLSerializer().serializeToString(clon);
  const blob = new Blob([texto], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await cargarImagen(url, w, h);
    const lienzo = document.createElement("canvas");
    lienzo.width = w;
    lienzo.height = h;
    const ctx = lienzo.getContext("2d");
    if (!ctx) throw new Error("raster-fallo");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return lienzo.toDataURL("image/jpeg", CALIDAD_JPEG);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Crea los bytes del PDF con página = medidas declaradas (puro, testeable). */
export async function crearPdfDesdeJpeg(
  jpegDataUrl: string,
  anchoMm: number,
  altoMm: number,
): Promise<ArrayBuffer> {
  const { jsPDF } = await import("jspdf");
  const apaisado = anchoMm > altoMm;
  const doc = new jsPDF({
    orientation: apaisado ? "landscape" : "portrait",
    unit: "mm",
    format: [anchoMm, altoMm],
    compress: true,
  });
  doc.addImage(jpegDataUrl, "JPEG", 0, 0, anchoMm, altoMm);
  return doc.output("arraybuffer") as ArrayBuffer;
}

/** Flujo completo: rasteriza el SVG visible y descarga el PDF. Sin guardar. */
export async function descargarPdfDelSvg(
  svg: SVGSVGElement,
  anchoMm: number,
  altoMm: number,
  nombre: string,
): Promise<void> {
  const jpeg = await rasterizarSvgAJpeg(svg, anchoMm, altoMm);
  const { jsPDF } = await import("jspdf");
  const apaisado = anchoMm > altoMm;
  const doc = new jsPDF({
    orientation: apaisado ? "landscape" : "portrait",
    unit: "mm",
    format: [anchoMm, altoMm],
    compress: true,
  });
  doc.addImage(jpeg, "JPEG", 0, 0, anchoMm, altoMm);
  doc.save(nombre.endsWith(".pdf") ? nombre : `${nombre}.pdf`);
}
