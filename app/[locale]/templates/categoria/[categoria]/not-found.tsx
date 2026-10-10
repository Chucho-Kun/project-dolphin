"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function CategoryNotFound() {
  const t = useTranslations("category");
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <p className="rounded border p-4 text-sm">{t("empty")}</p>
      <Link href="/" className="mt-4 inline-block text-sm underline">
        {t("backToHome")}
      </Link>
    </main>
  );
}
