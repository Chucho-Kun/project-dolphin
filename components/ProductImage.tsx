"use client";

import { useState } from "react";

// SPEC 1.3 (temporal): foto única de prueba. Se reemplaza por fotos reales R2 en otro spec.
export const FOTO_PRUEBA_CDN =
  "https://cdn.ferredip.com.mx/fotos/product-example.webp"; // verificada 2026-10-13: 200 image/webp
export const FOTO_FALLBACK_LOCAL = "/images/product-example.webp"; // obligatorio si la CDN falla

export default function ProductImage({
  src,
  fallbackSrc,
  alt,
}: {
  src: string;
  fallbackSrc: string;
  alt: string;
}) {
  const [current, setCurrent] = useState(src);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={current}
      alt={alt}
      loading="lazy"
      onError={() => {
        if (current !== fallbackSrc) {
          setCurrent(fallbackSrc);
        }
      }}
      className="h-full w-full object-cover"
    />
  );
}
