import { getTranslations } from "next-intl/server";
import { Link } from "@/components/ui/link";
import { Panel } from "@/components/ui/panel";
import { Wordmark } from "@/components/wordmark";

// The three unauthenticated platform screens — SCR-002 … SCR-004, rebuilt on
// the design system in wave 6 (DEC-129, DEC-130).
//
// ★ ONE DARK SECTION, the brand's cover (`16` §4.2.2, DEC-080): the wordmark
// and a single card on the navy canvas, and no marketing chrome (DEC-038).
// `theme-dark` reassigns the semantic tokens, so every primitive inside — the
// page header, the panel, the button, the radio group — reads the dark values
// without knowing it is in a dark section.
//
// This is the first screen every member ever sees, and `DEC-126`'s public
// «تسجيل الدخول» will lead here — so it is the redesign's first impression.
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("app.shell");
  return (
    <main id="main" className="theme-dark flex min-h-dvh flex-col items-center bg-canvas px-4 pb-12 pt-10 text-fg-body md:justify-center md:pt-16">
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
  );
}
