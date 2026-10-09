import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import Analytics from "@/lib/analytics";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as Locale)) {
    notFound();
  }

  setRequestLocale(locale as Locale);
  const messages = await getMessages();
  const t = await getTranslations("nav");

  return (
    <html lang={locale}>
      <body>
        <Analytics />
        <NextIntlClientProvider messages={messages}>
          <header className="border-b">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
              <Link href="/" className="font-bold">
                Project Dolphin
              </Link>
              <div className="flex items-center gap-4">
                <Link href="/" className="text-sm hover:underline">
                  {t("home")}
                </Link>
                <LocaleSwitcher />
              </div>
            </div>
          </header>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
