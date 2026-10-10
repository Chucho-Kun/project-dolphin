"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function ProductNotFound() {
  const t = useTranslations("product");
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <p className="rounded border p-4 text-sm">{t("notFound")}</p>
      <Link href="/" className="mt-4 inline-block text-sm underline">
        {t("backToCatalog")}
      </Link>
    </main>
  );
}
