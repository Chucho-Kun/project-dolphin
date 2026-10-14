// lib/rate-limit.ts — Rate-limit best-effort en memoria por instancia (SPEC 02).
//
// El límite estricto (persistente + captcha) va en SPEC 03. Aquí solo se
// frena el spam casual a R2: 20 subidas/día/IP. Best-effort significa que
// con varias instancias o reinicios el conteo se reinicia; está aceptado.

const ventanas = new Map<string, { conteo: number; expira: number }>();

const DIA_MS = 24 * 60 * 60 * 1000;
const MAX_CLAVES = 5000;

function podar(ahora: number): void {
  if (ventanas.size < MAX_CLAVES) return;
  for (const [clave, v] of ventanas) {
    if (v.expira <= ahora) ventanas.delete(clave);
    if (ventanas.size < MAX_CLAVES / 2) break;
  }
}

export type VeredictoLimite = {
  permitido: boolean;
  restantes: number;
  reintentoSeg: number;
};

/** Revisa el cupo sin consumirlo. */
export function revisarLimite(ip: string, tope = 20): VeredictoLimite {
  const ahora = Date.now();
  podar(ahora);
  const v = ventanas.get(ip);
  if (!v || v.expira <= ahora) {
    return { permitido: true, restantes: tope, reintentoSeg: 0 };
  }
  if (v.conteo < tope) {
    return {
      permitido: true,
      restantes: tope - v.conteo,
      reintentoSeg: 0,
    };
  }
  return {
    permitido: false,
    restantes: 0,
    reintentoSeg: Math.max(1, Math.ceil((v.expira - ahora) / 1000)),
  };
}

/** Consume un uso del cupo (llamar solo tras una subida exitosa). */
export function consumirLimite(ip: string, tope = 20): VeredictoLimite {
  const ahora = Date.now();
  podar(ahora);
  const v = ventanas.get(ip);
  if (!v || v.expira <= ahora) {
    ventanas.set(ip, { conteo: 1, expira: ahora + DIA_MS });
    return { permitido: true, restantes: tope - 1, reintentoSeg: 0 };
  }
  v.conteo += 1;
  if (v.conteo > tope) {
    return {
      permitido: false,
      restantes: 0,
      reintentoSeg: Math.max(1, Math.ceil((v.expira - ahora) / 1000)),
    };
  }
  return {
    permitido: true,
    restantes: tope - v.conteo,
    reintentoSeg: 0,
  };
}

/** Extrae la IP del cliente desde cabeceras de proxy. */
export function ipDelCliente(req: Request): string {
  const directa =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "";
  return directa || "desconocida";
}

/** Solo para pruebas: reinicia el conteo en memoria. */
export function _reiniciarLimites(): void {
  ventanas.clear();
}
