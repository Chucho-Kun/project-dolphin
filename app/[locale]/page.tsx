import { setRequestLocale } from "next-intl/server";
import { useTranslations } from "next-intl";
import type { Locale } from "@/i18n/routing";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <HomeContent />;
}

function HomeContent() {
  const t = useTranslations("home");
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p className="mt-2 text-neutral-600">{t("subtitle")}</p>
      <p className="mt-6 rounded border p-4 text-sm">{t("empty")}</p>
    </main>
  );
}
