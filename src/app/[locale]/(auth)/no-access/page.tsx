import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { LockIcon } from "@/components/ui/icons";
import { Panel } from "@/components/ui/panel";
import { ImpersonationBanner } from "@/components/platform/impersonation-banner";
import { getSessionState } from "@/lib/dal/session";
import { createServerClient } from "@/lib/supabase/server";
import { DoorFooter, DoorLockup, doorLink } from "../door";

// SCR-004 — the product's only answer to «فتحت الرابط ولا شيء يعمل» (REQ-AUT-006,
// REQ-TEN-006, REQ-UIX-058). REBUILT from `docs/design/screens/m10a/NoAccess.dc.html`;
// `M10a.md` §3. Top to bottom: the wordmark · the panel — the lock, the title, the
// explanation, WHICH account the visitor came in with, the two actions · the way
// home and the privacy policy.
//
// What survives is behaviour: it names no org and lists no domain; it is a dead
// end with an explanation, never a blank screen or a redirect loop; its four
// variants — no match, a suspended org, a deactivated account, a platform admin
// with no org — share one frame; the impersonation banner stands above it for an
// operator in a break-glass session (SCR-085, DEC-055 option C).
//
// ★ The visitor's own address, masked, is new (DEC-206 §4.40). It is theirs — it
// names no org and no listed domain — and it answers the question this screen
// exists for: «which account did I come in with?». Only the first character shows.
export default async function NoAccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ reason?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { reason } = await searchParams;
  const [t, shell, state] = await Promise.all([getTranslations("auth.noAccess"), getTranslations("app.shell"), getSessionState()]);

  // `/no-access` is where BOTH a member of no org and a platform admin with no
  // member row land. The second is not a mistake to be contacted about, and
  // «contact your organisation's administrator» is wrong for them; their door
  // is the console, and they are told so.
  const platformAdmin = state.kind === "no_org" && state.platformAdmin && reason !== "suspended" && reason !== "deactivated";
  // ★ The console stays one press away for a platform admin whose own org is suspended, or who is deactivated in it:
  // the explanation is still the true one for that org, and the console is where it is reinstated (DEC-263).
  const consoleDoor = (state.kind === "suspended" || state.kind === "deactivated") && state.platformAdmin;
  const noMatch = !platformAdmin && reason !== "suspended" && reason !== "deactivated";

  const [title, body] =
    reason === "suspended"
      ? [t("suspended"), t("suspendedBody")]
      : reason === "deactivated"
        ? [t("deactivated"), t("deactivatedBody")]
        : platformAdmin
          ? [t("platformTitle"), t("platformBody")]
          : [t("title"), t("noMatch")];

  const email = state.kind === "none" ? null : await signedInEmail();
  const masked = email ? maskEmail(email) : null;

  return (
    <>
      <ImpersonationBanner locale={locale} />
      <DoorLockup size="md" label={shell("brand")} />

      <Panel className="mt-8 flex flex-col gap-3.5 px-[18px] py-[22px]">
        <span aria-hidden className="inline-flex size-14 items-center justify-center rounded-[16px] border border-edge bg-raised text-[1.5rem] text-fg-muted">
          <LockIcon />
        </span>
        <h1 className="font-display text-[1.625rem] leading-[1.4] font-extrabold text-fg-heading">{title}</h1>
        <p className="text-fg-muted">{body}</p>

        {masked ? (
          <p className="flex items-center gap-2.5 rounded-tile border border-edge bg-canvas px-3.5 py-3 text-[0.8125rem] text-fg-muted">
            <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-raised font-display text-[0.875rem] font-extrabold text-fg-heading">
              {masked[0].toUpperCase()}
            </span>
            <span>
              {t.rich(noMatch ? "signedInNoMatch" : "signedIn", {
                email: () => (
                  <bdi dir="ltr" className="font-semibold text-fg-heading">
                    {masked}
                  </bdi>
                ),
              })}
            </span>
          </p>
        ) : null}

        {platformAdmin || consoleDoor ? (
          <ButtonLink href="/app/platform" variant="primary" size="lg" className="w-full">
            {t("platformConsole")}
          </ButtonLink>
        ) : null}

        {/* Sign-out answers 303 to the sign-in screen, so «another account» is one act. */}
        {noMatch ? (
          <form method="post" action="/api/auth/sign-out">
            <Button type="submit" variant="primary" size="lg" className="w-full">
              {t("switchAccount")}
            </Button>
          </form>
        ) : null}
        <form method="post" action="/api/auth/sign-out">
          <Button type="submit" variant="quiet" size="lg" className="w-full">
            {t("signOut")}
          </Button>
        </form>
      </Panel>

      <DoorFooter>
        <Link href="/" className={doorLink}>
          {t("backHome")}
        </Link>
        <Link href="/legal/privacy" className={doorLink}>
          {shell("privacy")}
        </Link>
      </DoorFooter>
    </>
  );
}

/** The address of the session that reached this screen. `getClaims()` is a three-way
 *  union — narrow on `data`, never on `error` (CLAUDE.md, Supabase specifics). */
async function signedInEmail(): Promise<string | null> {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email;
  return typeof email === "string" && email.includes("@") ? email : null;
}

/** `yaman@example.com` → `y•••@example.com`. The domain is the visitor's own. */
function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  return `${[...email.slice(0, at)][0] ?? ""}•••${email.slice(at)}`;
}
