"use client";

import { useState } from "react";
import ProductImage, {
  FOTO_FALLBACK_LOCAL,
} from "@/components/ProductImage";

type ProductGalleryProps = {
  fotos: string[];
  alt: string;
  fallbackSrc?: string;
  prevLabel: string;
  nextLabel: string;
  thumbnailLabels: string[];
};

// SPEC 1.3: galería de producto. Con foto única de prueba muestra una sola
// imagen grande sin tira ni flechas. Tira + flechas solo con 2+ fotos reales.
// Las etiquetas accesibles llegan por props como strings ya traducidos desde
// la página (claves `product.galeria.*` en `messages/*.json`): los props de
// un Client Component deben ser serializables, no funciones.
export default function ProductGallery({
  fotos,
  alt,
  fallbackSrc = FOTO_FALLBACK_LOCAL,
  prevLabel,
  nextLabel,
  thumbnailLabels,
}: ProductGalleryProps) {
  const [active, setActive] = useState(0);
  const total = fotos.length;
  const current = total > 0 ? fotos[Math.min(active, total - 1)] : fallbackSrc;
  const multiple = total > 1;

  const goPrev = () => {
    setActive((prev) => (prev - 1 + total) % total);
  };

  const goNext = () => {
    setActive((prev) => (prev + 1) % total);
  };

  return (
    <div className="w-full">
      <div className="relative overflow-hidden rounded-xl bg-neutral-100">
        <div className="aspect-square w-full">
          <ProductImage
            key={current}
            src={current}
            fallbackSrc={fallbackSrc}
            alt={alt}
          />
        </div>

        {multiple ? (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label={prevLabel}
              className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-lg font-bold text-neutral-800 shadow hover:bg-white"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label={nextLabel}
              className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-lg font-bold text-neutral-800 shadow hover:bg-white"
            >
              ›
            </button>
          </>
        ) : null}
      </div>

      {multiple ? (
        <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
          {fotos.map((foto, index) => (
            <button
              key={`${foto}-${index}`}
              type="button"
              onClick={() => setActive(index)}
              aria-label={thumbnailLabels[index] ?? alt}
              aria-current={index === active ? "true" : undefined}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-neutral-100 outline-offset-2 ${
                index === active ? "outline-2 outline-black" : "opacity-70 hover:opacity-100"
              }`}
            >
              <ProductImage
                src={foto}
                fallbackSrc={fallbackSrc}
                alt={`${alt} ${index + 1}`}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
