import { getTranslations } from "next-intl/server";
import { Link } from "@/components/ui/link";
import { Panel } from "@/components/ui/panel";
import { PlayScope } from "@/components/ui/scope";
import { Wordmark } from "@/components/wordmark";

// The three unauthenticated platform screens — SCR-002 … SCR-004, rebuilt on
// the design system in wave 6 (DEC-129, DEC-130).
//
// ★ ONE SECTION, the wordmark and a single card, and no marketing chrome
// (DEC-038). Until wave 17 it was `.theme-dark`'s navy canvas (`16` §4.2.2,
// DEC-080). ★★ From wave 17 it is inside the playground's scope, at the token
// level (DEC-199 §1.3, REQ-UIX-049): the scope reassigns the semantic tokens, so
// every primitive inside reads the playground's values, and `.theme-dark` is gone
// — it would cut an old-look island into the page. ★ THIS IS NOT THE SCREENS'
// REDESIGN. `SCR-002` – `SCR-004` open the member-screens milestone and are
// rebuilt there from their own documents (DEC-195 §5, DEC-199 §2).
//
// This is the first screen every member ever sees, and `DEC-126`'s public
// «تسجيل الدخول» will lead here — so it is the redesign's first impression.
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("app.shell");
  return (
    <PlayScope root className="min-h-dvh">
    <main id="main" className="flex min-h-dvh flex-col items-center bg-canvas px-4 pb-12 pt-10 text-fg-body md:justify-center md:pt-16">
      <div className="mb-8 flex w-full max-w-md justify-center">
        <Wordmark />
      </div>
      {/* The panel keeps its own padding; the extra step comes from this inner
          box rather than a second padding class on the panel, so no two
          utilities fight over one property (DEC-111's house rule). */}
      <Panel className="w-full max-w-md shadow-[var(--shadow-card)]">
        <div className="p-2 md:p-4">{children}</div>
      </Panel>
      <p className="mt-8 flex w-full max-w-md items-center justify-center gap-3 text-caption text-fg-muted">
        <Link href="/legal/privacy" quiet className="underline underline-offset-4 hover:text-fg-heading">
          {t("privacy")}
        </Link>
        <span aria-hidden>·</span>
        <Link href="/legal/terms" quiet className="underline underline-offset-4 hover:text-fg-heading">
          {t("terms")}
        </Link>
      </p>
    </main>
    </PlayScope>
  );
}
