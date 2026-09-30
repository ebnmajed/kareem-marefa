import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { AlertCircleIcon, TicketIcon } from "@/components/ui/icons";
import { Panel } from "@/components/ui/panel";
import { Sticker } from "@/components/ui/sticker";
import { getSessionState } from "@/lib/dal/session";
import { safeNextPath } from "@/lib/auth/next-path";
import { PLATFORM_LOCALE } from "@/lib/auth/flow";
import { DoorFooter, DoorLockup, doorLink } from "../door";

// SCR-002 — the only way in (REQ-AUT-001, REQ-AUT-005, REQ-UIX-058).
// REBUILT from `docs/design/screens/m10a/Main.dc.html`; `M10a.md` §1. Top to bottom:
// the wordmark · the panel — the title, the subtitle, ONE action, the line that
// says what happens next · the panel about the carried destination · the legal links.
//
// What survives from the screen it replaces is behaviour, all of it: a signed-in
// member is redirected before anything renders; `?next=` is validated as an
// internal path and posted with the form (REQ-AUT-005), so a poster's QR scanned
// while signed out lands on THAT session; an error is said in the page, above the
// button, and never in a toast; the form posts to a Route Handler and works with
// no JavaScript.
//
// ★ No motion. The sticker is the one playful object on the door, and it is
// decoration: «أول حضور = شارة» is true of every org's seeded catalogue
// (`first_check_in`, 0027), and says nothing a control depends on (DEC-206 §4.38).
export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { next, error } = await searchParams;
  const destination = safeNextPath(next, PLATFORM_LOCALE);

  const state = await getSessionState();
  if (state.kind === "member") redirect(destination);

  const [t, shell] = await Promise.all([getTranslations("auth.signIn"), getTranslations("app.shell")]);

  return (
    <>
      <DoorLockup size="lg" label={shell("brand")} />

      <Panel className="relative mt-10 flex flex-col gap-3.5 px-[18px] py-[22px]">
        <Sticker fill="gold" rotate={6} size="sm" className="absolute -top-3.5 end-4">
          {t("sticker")}
        </Sticker>
        <h1 className="font-display text-[1.625rem] leading-[1.2] font-extrabold text-fg-heading">{t("title")}</h1>
        <p className="text-fg-muted">{t("subtitle")}</p>

        {error ? (
          <p id="sign-in-error" role="alert" className="flex items-start gap-2 rounded-tile border border-error-border bg-error-bg p-3 text-body-sm text-error">
            <AlertCircleIcon className="mt-1 shrink-0 text-[1.125rem]" />
            <span>{error === "domain" ? t("domainNotAllowed") : t("error")}</span>
          </p>
        ) : null}

        <form method="post" action="/api/auth/sign-in">
          <input type="hidden" name="next" value={destination} />
          {/* The bone face: the door's one action is not the lime of an in-app
              commitment. The button's own variables are reassigned for this one
              control — its press shadow's too, which reads `--accent-deep` — and `ui/button`,
              a file the public site renders, is not edited. */}
          <Button
            type="submit"
            size="lg"
            aria-describedby={error ? "sign-in-error sign-in-explain" : "sign-in-explain"}
            className="w-full [--accent-deep:var(--fg-muted)] [--btn-bg-active:var(--fg-heading)] [--btn-bg-hover:var(--fg-heading)] [--btn-bg:var(--fg-heading)] [--btn-fg:var(--bg)]"
            iconStart={<GoogleMark />}
          >
            {t("google")}
          </Button>
        </form>
        <p id="sign-in-explain" className="text-[0.75rem] leading-[1.6] text-fg-muted">
          {t("explain")}
        </p>
      </Panel>

      <Panel className="mt-[18px] flex items-center gap-3">
        <TicketIcon aria-hidden className="shrink-0 text-[1.25rem] text-accent" />
        <p className="text-[0.8125rem] leading-[1.6] text-fg-muted">
          {t.rich("carried", { strong: (chunks) => <strong className="font-bold text-fg-heading">{chunks}</strong> })}
        </p>
      </Panel>

      <DoorFooter>
        <Link href="/legal/privacy" className={doorLink}>
          {shell("privacy")}
        </Link>
        <Link href="/legal/terms" className={doorLink}>
          {shell("terms")}
        </Link>
      </DoorFooter>
    </>
  );
}

/** The Google mark is a logo: it never mirrors (`10` §2.4), and it keeps its
 *  own colours on the button's bone face. 24 px, the artboard's slot. */
function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" className="shrink-0">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3a7.2 7.2 0 0 1-10.8-3.8H1.3v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8Z" />
    </svg>
  );
}
