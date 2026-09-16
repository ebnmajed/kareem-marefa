import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { RadioGroup } from "@/components/ui/radio-group";
import { SubmitButton } from "@/components/ui/submit-button";
import { createServerClient } from "@/lib/supabase/server";
import { getSessionState, pathForState } from "@/lib/dal/session";
import { destinationFor, PLATFORM_LOCALE, provision } from "@/lib/auth/flow";
import { safeNextPath } from "@/lib/auth/next-path";
import { chooseOrg } from "./actions";

// SCR-003 · /choose-org — appears ONLY when the domain genuinely matches
// more than one org, and never again after the choice (REQ-AUT-004, A2).
//
// ★ The fork that fixes which `org_id` the whole session carries, permanently —
// `members.org_id` is immutable. So the description says the choice is final
// BEFORE the button, the button shows it is working while the choice is being
// written, and a failed write says so rather than repeating the description.
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

  const t = await getTranslations("auth.chooseOrg");
  return (
    <>
      <PageHeader title={t("title")} description={t("body")} />
      {error ? (
        <Panel tone="error" className="mt-6">
          <p role="alert" className="text-body text-error">
            {t("error")}
          </p>
        </Panel>
      ) : null}
      <form action={chooseOrg} className="mt-6">
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <RadioGroup
          name="org"
          legend={t("legend")}
          defaultValue={envelope.orgs[0]?.id}
          // Org names are interpolated values and bidi-isolated (`10` §3).
          options={envelope.orgs.map((org) => ({ value: org.id, label: <bdi>{org.name}</bdi> }))}
        />
        <SubmitButton size="lg" className="mt-6 w-full" pendingLabel={t("pending")}>
          {t("confirm")}
        </SubmitButton>
      </form>
    </>
  );
}
