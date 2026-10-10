"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";

export default function LocaleSwitcher() {
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const tNav = useTranslations("nav");
  const tCommon = useTranslations("common");

  return (
    <nav aria-label={tNav("language")} className="flex items-center gap-1">
      {routing.locales.map((l) => {
        const active = l === locale;
        return (
          <Link
            key={l}
            href={pathname}
            locale={l}
            aria-current={active ? "true" : undefined}
            className={
              active
                ? "rounded px-2 py-1 text-sm font-bold underline"
                : "rounded px-2 py-1 text-sm hover:underline"
            }
          >
            {tCommon(l)}
          </Link>
        );
      })}
    </nav>
  );
}
