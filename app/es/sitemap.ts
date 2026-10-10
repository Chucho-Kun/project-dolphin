import { buildLocaleSitemap } from "@/lib/sitemap";

export const dynamic = "force-dynamic";

export default function sitemap() {
  return buildLocaleSitemap("es");
}
