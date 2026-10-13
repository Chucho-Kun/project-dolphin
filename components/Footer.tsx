import { getTranslations } from "next-intl/server";

export default async function Footer() {
  const t = await getTranslations("layout.footer");
  const year = new Date().getFullYear();

  const columnas: { titulo: string; enlaces: string[] }[] = [
    { titulo: t("compra.titulo"), enlaces: [t("compra.l1"), t("compra.l2"), t("compra.l3")] },
    { titulo: t("sobre.titulo"), enlaces: [t("sobre.l1"), t("sobre.l2")] },
    { titulo: t("ayuda.titulo"), enlaces: [t("ayuda.l1"), t("ayuda.l2")] },
  ];

  return (
    <footer className="mt-12 fondo-web">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 py-10 md:grid-cols-3">
        {columnas.map((col) => (
          <nav key={col.titulo} aria-label={col.titulo}>
            <h2 className="text-sm font-bold">{col.titulo}</h2>
            <ul className="mt-3 space-y-2">
              {col.enlaces.map((texto) => (
                <li key={texto}>
                  <a href="#" className="text-sm text-neutral-700 hover:underline">
                    {texto}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-gray-300 fondo-web">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-4 text-xs text-neutral-600 sm:flex-row">
          <span aria-hidden="true" className="flex items-center gap-4">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2.5" y="2.5" width="19" height="19" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.2" cy="6.8" r="1.2" fill="currentColor" stroke="none" />
            </svg>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M14 8.5h2.5V5.5H14c-2 0-3.5 1.5-3.5 3.5v2H8v3h2.5v6.5h3V15H16l1-3h-3V9c0-.3.2-.5.5-.5z" />
            </svg>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="6" width="20" height="12" rx="3" />
              <path d="M10.5 9.5v5L15 12l-4.5-2.5z" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <p>
            © {year} Project Dolphin.{" "}
            <a href="#" className="hover:underline">
              {t("legal.condiciones")}
            </a>{" "}
            ·{" "}
            <a href="#" className="hover:underline">
              {t("legal.privacidad")}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
