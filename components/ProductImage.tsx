"use client";

import { useState } from "react";

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
