import { getTranslations } from "next-intl/server";

// Hardcodeado decorativo del diseño (SPEC 1.2): nombres por claves i18n,
// solo los conteos viven aquí. Se cablea a datos reales en otro spec.
const CATEGORIAS: { clave: string; conteo: number }[] = [
  { clave: "todos", conteo: 78 },
  { clave: "ofertas", conteo: 78 },
  { clave: "letras", conteo: 26 },
  { clave: "pared", conteo: 3 },
  { clave: "figuras", conteo: 22 },
  { clave: "mascaras", conteo: 3 },
  { clave: "numeros", conteo: 10 },
  { clave: "svg", conteo: 2 },
];

export default async function CategorySidebar() {
  const t = await getTranslations("home.categorias");

  return (
    <aside className="w-full shrink-0 md:w-48">
      <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
        {CATEGORIAS.map((c) => (
          <li key={c.clave}>
            <a
              href="#"
              className="flex items-center justify-between gap-4 py-2 text-sm hover:underline"
            >
              <span>{t(c.clave)}</span>
              <span className="text-neutral-600">{c.conteo}</span>
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
