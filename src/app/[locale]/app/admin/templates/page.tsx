import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

// /app/admin/templates — `DEC-176`, `DEC-178`. `16` §10.3's card grid was
// already built twice, at `templates/{posters,certificates}/page.tsx`
// (`designer`'s, unchanged by this file) — the gap was that this address
// had no route of its own, so the rail's «القوالب» leaf and the a11y
// sweep's own probe of this exact path (`tests/e2e/a11y.spec.ts:120`) both
// landed on the generic `/app` not-found page. `designer` carries a
// posters|certificates `ui/tabs` strip (link mode — `TabItem.href`, already
// in the frozen type, `components/ui/index.ts:522-527`) on the top of both
// purpose pages (sync 1), so switching between them needs no second `<h1>`
// and no content of this file's own — this route exists only to give
// `/app/admin/templates` somewhere real to land. Posters first, matching
// every other purpose-ordered surface in this product (`familiesFor()`,
// the rail's own former group order).
export default async function TemplatesIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  redirect({ href: "/app/admin/templates/posters", locale });
}
