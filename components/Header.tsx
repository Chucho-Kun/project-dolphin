"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import LocaleSwitcher from "@/components/LocaleSwitcher";

export default function Header() {
  const tNav = useTranslations("nav");
  const tHeader = useTranslations("layout.header");
  const [open, setOpen] = useState(false);
  const placeholder = tHeader("buscar");

  return (
    <header className="border-b fondo-web">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/" aria-label="Project Dolphin" className="shrink-0">
          <Image
            src="/logo.avif"
            alt="Project Dolphin"
            width={120}
            height={40}
            className="h-10 w-auto"
            priority
          />
        </Link>

        {/* Buscador estético — desktop */}
        <form
          role="search"
          aria-label={placeholder}
          onSubmit={(e) => e.preventDefault()}
          className="dolphin-search-pill hidden min-w-0 flex-1 items-center pl-4 pr-1.5 py-1.5 md:flex"
        >
          <input
            type="search"
            placeholder={placeholder}
            aria-label={placeholder}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          <button
            type="submit"
            aria-label={placeholder}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-orange-600 text-white"
          >
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="16.5" y1="16.5" x2="21" y2="21" />
            </svg>
          </button>
        </form>

        {/* Iconos solo estéticos */}
        <span aria-hidden="true" className="ml-auto hidden items-center gap-4 md:flex">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="9" cy="20" r="1.5" />
            <circle cx="17" cy="20" r="1.5" />
            <path d="M3 3h2l2.5 12h11L21 7H7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>

        {/* Nav desktop: mismos valores actuales */}
        <nav aria-label={tNav("home")} className="hidden items-center gap-4 md:flex">
          <Link href="/" className="text-sm hover:underline">
            {tNav("home")}
          </Link>
          <LocaleSwitcher />
        </nav>

        {/* Hamburguesa móvil */}
        <button
          type="button"
          aria-expanded={open}
          aria-controls="dolphin-mobile-menu"
          aria-label={tHeader("menu")}
          onClick={() => setOpen((v) => !v)}
          className="ml-auto grid h-10 w-10 place-items-center rounded-md border md:hidden"
        >
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {open ? (
              <path d="M6 6l12 12M18 6L6 18" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Menú móvil: buscador + nav + switcher */}
      {open ? (
        <div id="dolphin-mobile-menu" className="border-t px-4 pb-4 pt-3 md:hidden">
          <form
            role="search"
            aria-label={placeholder}
            onSubmit={(e) => e.preventDefault()}
            className="dolphin-search-pill flex min-w-0 flex-1 items-center pl-4 pr-1.5 py-1.5"
          >
            <input
              type="search"
              placeholder={placeholder}
              aria-label={placeholder}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            <button
              type="submit"
              aria-label={placeholder}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-orange-600 text-white"
            >
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <circle cx="11" cy="11" r="7" />
                <line x1="16.5" y1="16.5" x2="21" y2="21" />
              </svg>
            </button>
          </form>
          <nav aria-label={tNav("home")} className="mt-3 flex items-center justify-between">
            <Link
              href="/"
              className="text-sm font-medium hover:underline"
              onClick={() => setOpen(false)}
            >
              {tNav("home")}
            </Link>
            <LocaleSwitcher />
          </nav>
        </div>
      ) : null}
    </header>
  );
}
