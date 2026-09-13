import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createServerClient } from "@/lib/supabase/server";
import { getSessionState, pathForState } from "@/lib/dal/session";
import { destinationFor, PLATFORM_LOCALE, provision } from "@/lib/auth/flow";
import { safeNextPath } from "@/lib/auth/next-path";
import { chooseOrg } from "./actions";

// SCR-003 · /choose-org — appears ONLY when the domain genuinely matches
// more than one org, and never again after the choice (REQ-AUT-004, A2).
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
      <h1 className="text-h2 text-fg-heading">{t("title")}</h1>
      <p className="mt-3 text-body text-fg-muted">{t("body")}</p>
      {error ? (
        <p role="alert" className="mt-4 text-body text-fg-body">
          {t("body")}
        </p>
      ) : null}
      <form action={chooseOrg} className="mt-6">
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <fieldset className="space-y-3">
          <legend className="sr-only">{t("title")}</legend>
          {envelope.orgs.map((org, i) => (
            <label key={org.id} className="flex cursor-pointer items-center gap-3 rounded-field border border-edge p-4 hover:border-edge-strong">
              <input type="radio" name="org" value={org.id} required defaultChecked={i === 0} className="size-5 accent-white" />
              <bdi className="text-body text-fg-heading">{org.name}</bdi>
            </label>
          ))}
        </fieldset>
        <button type="submit" className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-field bg-white px-6 text-label text-navy-950 hover:bg-silver-200">
          {t("confirm")}
        </button>
      </form>
    </>
  );
}
