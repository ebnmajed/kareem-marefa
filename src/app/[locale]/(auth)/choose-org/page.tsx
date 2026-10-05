import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { AlertTriangleIcon } from "@/components/ui/icons";
import { Panel } from "@/components/ui/panel";
import { RadioGroup } from "@/components/ui/radio-group";
import { SubmitButton } from "@/components/ui/submit-button";
import { createServerClient } from "@/lib/supabase/server";
import { getSessionState, pathForState } from "@/lib/dal/session";
import { destinationFor, PLATFORM_LOCALE, provision } from "@/lib/auth/flow";
import { safeNextPath } from "@/lib/auth/next-path";
import { chooseOrg } from "./actions";
import { DoorFooter, DoorLockup } from "../door";

// SCR-003 — the fork that decides which org a session carries, for good (REQ-AUT-004,
// A2, REQ-UIX-058). REBUILT from `docs/design/screens/m10a/ChooseOrg.dc.html`;
// `M10a.md` §2. Top to bottom: the wordmark · the panel — the title, the sentence,
// the radio group, WHY the choice is permanent, the submit · «الدخول بحساب آخر».
//
// What survives is behaviour: the screen appears only when the address genuinely
// matches more than one org and never again after the choice; the first org is
// preselected; the choice posts through the same action; `next` travels with it.
//
// ★ An option is the org's NAME, with its initial in a tile. The artboard also
// writes a domain under each and draws a mark; the domain is the visitor's own —
// identical on every row, since the rows exist because one domain is on more than
// one list — and an org has no mark here (DEC-206 §4.39). The chosen option is
// marked by the radio itself, not by colour alone.
export default async function ChooseOrgPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { next, error } = await searchParams;

  const state = await getSessionState();
  if (state.kind === "member") redirect(safeNextPath(next, PLATFORM_LOCALE));
  if (state.kind !== "no_org") redirect(pathForState(state, locale, next));

  const supabase = await createServerClient();
  const envelope = await provision(supabase);
  if (envelope.status !== "ambiguous") {
    if (envelope.status === "provisioned") await supabase.auth.refreshSession();
    redirect(destinationFor(envelope, next));
  }

  const [t, shell] = await Promise.all([getTranslations("auth.chooseOrg"), getTranslations("app.shell")]);

  return (
    <>
      <DoorLockup size="md" label={shell("brand")} />

      <Panel className="mt-8 flex flex-col gap-3.5 px-[18px] py-[22px]">
        <h1 className="font-display text-[1.625rem] leading-[1.4] font-extrabold text-fg-heading">{t("title")}</h1>
        <p className="text-fg-muted">{t("body")}</p>

        {error ? (
          <p role="alert" className="rounded-tile border border-error-border bg-error-bg p-3 text-body-sm text-error">
            {t("error")}
          </p>
        ) : null}

        <form action={chooseOrg} className="flex flex-col gap-3.5">
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <RadioGroup
            name="org"
            legend={t("legend")}
            defaultValue={envelope.orgs[0]?.id}
            options={envelope.orgs.map((org) => ({
              value: org.id,
              label: (
                <span className="flex items-center gap-3 py-1.5">
                  <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] border-[3px] border-edge-strong bg-canvas font-display text-[0.9375rem] font-extrabold">
                    {[...org.name.trim()][0] ?? ""}
                  </span>
                  <bdi className="text-[1rem] font-bold text-fg-heading">{org.name}</bdi>
                </span>
              ),
            }))}
          />

          <p className="flex items-start gap-2.5 rounded-tile border border-edge bg-canvas px-3.5 py-3 text-[0.8125rem] leading-[1.6] text-fg-muted">
            <AlertTriangleIcon aria-hidden className="mt-0.5 shrink-0 text-[1.125rem] text-signal" />
            <span>{t("permanent")}</span>
          </p>

          <SubmitButton size="lg" className="w-full" pendingLabel={t("pending")}>
            {t("confirm")}
          </SubmitButton>
        </form>
      </Panel>

      <DoorFooter>
        {/* Sign-out answers 303 to the sign-in screen, so «another account» is one act. */}
        <form method="post" action="/api/auth/sign-out">
          <Button type="submit" variant="ghost" size="sm" className="text-fg-muted">
            {t("switchAccount")}
          </Button>
        </form>
      </DoorFooter>
    </>
  );
}
