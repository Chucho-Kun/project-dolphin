"use client";

import { GoogleAnalytics, GoogleTagManager } from "@next/third-parties/google";

// GA4 + GTM instrumentado desde el scaffold (SPEC 01, Paso 9).
// IDs por variables de entorno públicas; sin IDs no renderiza nada.
export default function Analytics() {
  const gaId = process.env.NEXT_PUBLIC_GA4_ID;
  const gtmId = process.env.NEXT_PUBLIC_GTM_ID;

  if (!gaId && !gtmId) return null;

  return (
    <>
      {gtmId ? <GoogleTagManager gtmId={gtmId} /> : null}
      {gaId ? <GoogleAnalytics gaId={gaId} /> : null}
    </>
  );
}
