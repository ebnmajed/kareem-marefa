import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatDateTime } from "@/components/sessions/numerals";
import { MemberPicker } from "@/components/admin/member-picker";
import { listMembersForAdmin } from "@/lib/dal/admin-members";
import { getScoringAdminData } from "@/lib/dal/scoring-admin";
import { saveCompanyHostingRule, saveCompanyPercentRule, saveManualAdjustment, saveScoringRule, saveSessionHostCompany } from "./actions";

// SCR-053 · /app/admin/scoring — DEC-046's wave-2 carve-out for `scoring`;
// `console` inherits this path at wave 3 (DEC-042's pattern for `sessions`).
//
// Every value here is read live by /app/me/points' catalogue section
// (REQ-PTS-014) — a save here is visible to every member immediately, and
// only affects awards from that point forward (REQ-PTS-004): a ledger row
// already written keeps the rule_version and amount it was written with.
//
// The manual-adjustment form's member field is `<MemberPicker>`
// (`scoring.md`'s carried-over item, console.md's story order item 2) —
// still the same `formData.get("memberId")` `saveManualAdjustment` already
// reads, so `actions.ts`/`submitManualAdjustment()`/`adjust_points_
// manually()` are all unchanged.

const field = "mt-1 block h-11 w-full rounded-field border border-edge-strong bg-canvas px-3 text-body text-fg-heading";

export default async function ScoringAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { saved, error } = await searchParams;

  const [t, tp, data, members] = await Promise.all([
    getTranslations("scoring.admin"),
    getTranslations("admin.memberPicker"),
    getScoringAdminData(locale),
    listMembersForAdmin(locale),
  ]);
  if (!data) notFound();

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("title")}</h1>
      <p className="mt-2 text-body text-fg-muted">{t("intro")}</p>

      {saved ? (
        <p role="status" className="mt-4 rounded-field border border-edge bg-silver-100 p-3 text-body text-fg-heading">
          {t("saved")}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 rounded-field border border-edge-strong p-3 text-body text-fg-heading">
          {t("error")}
        </p>
      ) : null}

      <section aria-labelledby="rules-heading" className="mt-10">
        <h2 id="rules-heading" className="text-h2 text-fg-heading">
          {t("rules.heading")}
        </h2>
        <ul className="mt-4 space-y-4">
          {data.rules.map((rule) => (
            <li key={rule.id} className="rounded-field border border-edge p-4">
              <p className="text-label text-fg-heading">
                <bdi>{rule.reasonAr}</bdi> <span className="text-body-sm text-fg-muted">({rule.actionKey})</span>
              </p>
              <form action={saveScoringRule} className="mt-3 flex flex-wrap items-end gap-4">
                <input type="hidden" name="ruleId" value={rule.id} />
                <label className="flex flex-col gap-1">
                  <span className="text-body-sm text-fg-muted">{t("rules.points")}</span>
                  <input name="points" type="number" defaultValue={rule.points} className={field} style={{ maxWidth: "8rem" }} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-body-sm text-fg-muted">{t("rules.cap")}</span>
                  <input
                    name="capPerSession"
                    type="number"
                    min={1}
                    defaultValue={rule.capPerSession ?? ""}
                    placeholder={t("rules.noCap")}
                    className={field}
                    style={{ maxWidth: "8rem" }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-body-sm text-fg-muted">{t("rules.cooldown")}</span>
                  <input
                    name="cooldownSeconds"
                    type="number"
                    min={0}
                    defaultValue={rule.cooldownSeconds ?? ""}
                    placeholder={t("rules.noCooldown")}
                    className={field}
                    style={{ maxWidth: "8rem" }}
                  />
                </label>
                <label className="flex items-center gap-2 pb-2">
                  <input name="enabled" type="checkbox" defaultChecked={rule.enabled} className="size-5" />
                  <span className="text-body-sm text-fg-heading">{t("rules.enabled")}</span>
                </label>
                <button type="submit" className="h-11 rounded-field bg-navy-950 px-5 text-label text-white hover:bg-navy-900">
                  {t("rules.save")}
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="company-rules-heading" className="mt-12">
        <h2 id="company-rules-heading" className="text-h2 text-fg-heading">
          {t("companyRules.heading")}
        </h2>
        <p className="mt-2 text-body text-fg-muted">{t("companyRules.intro")}</p>
        <ul className="mt-4 space-y-4">
          {data.companyRules.map((rule) =>
            rule.actionKey === "company_hosting" ? (
              <li key={rule.id} className="rounded-field border border-edge p-4">
                <p className="text-label text-fg-heading">
                  <bdi>{rule.reasonAr}</bdi> <span className="text-body-sm text-fg-muted">({rule.actionKey})</span>
                </p>
                <form action={saveCompanyHostingRule} className="mt-3 flex flex-wrap items-end gap-4">
                  <input type="hidden" name="ruleId" value={rule.id} />
                  <label className="flex flex-col gap-1">
                    <span className="text-body-sm text-fg-muted">{t("companyRules.points")}</span>
                    <input name="points" type="number" min={0} defaultValue={rule.points ?? 0} className={field} style={{ maxWidth: "8rem" }} />
                  </label>
                  <label className="flex items-center gap-2 pb-2">
                    <input name="enabled" type="checkbox" defaultChecked={rule.enabled} className="size-5" />
                    <span className="text-body-sm text-fg-heading">{t("rules.enabled")}</span>
                  </label>
                  <button type="submit" className="h-11 rounded-field bg-navy-950 px-5 text-label text-white hover:bg-navy-900">
                    {t("rules.save")}
                  </button>
                </form>
              </li>
            ) : (
              <li key={rule.id} className="rounded-field border border-edge p-4">
                <p className="text-label text-fg-heading">
                  <bdi>{rule.reasonAr}</bdi> <span className="text-body-sm text-fg-muted">({rule.actionKey})</span>
                </p>
                <form action={saveCompanyPercentRule} className="mt-3 flex flex-wrap items-end gap-4">
                  <input type="hidden" name="ruleId" value={rule.id} />
                  <label className="flex flex-col gap-1">
                    <span className="text-body-sm text-fg-muted">{t("companyRules.pointsPerPercent")}</span>
                    <input
                      name="pointsPerPercent"
                      type="number"
                      min={0}
                      step="0.1"
                      defaultValue={rule.pointsPerPercent ?? 0}
                      className={field}
                      style={{ maxWidth: "8rem" }}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-body-sm text-fg-muted">{t("companyRules.capPoints")}</span>
                    <input name="capPoints" type="number" min={1} defaultValue={rule.capPoints ?? 1} className={field} style={{ maxWidth: "8rem" }} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-body-sm text-fg-muted">{t("companyRules.minActiveMembers")}</span>
                    <input
                      name="minActiveMembers"
                      type="number"
                      min={1}
                      defaultValue={rule.minActiveMembers ?? 1}
                      className={field}
                      style={{ maxWidth: "8rem" }}
                    />
                  </label>
                  <label className="flex items-center gap-2 pb-2">
                    <input name="enabled" type="checkbox" defaultChecked={rule.enabled} className="size-5" />
                    <span className="text-body-sm text-fg-heading">{t("rules.enabled")}</span>
                  </label>
                  <button type="submit" className="h-11 rounded-field bg-navy-950 px-5 text-label text-white hover:bg-navy-900">
                    {t("rules.save")}
                  </button>
                </form>
              </li>
            ),
          )}
        </ul>

        <div className="mt-8 max-w-xl">
          <h3 className="text-label text-fg-heading">{t("companyRules.hostForm.heading")}</h3>
          <p className="mt-2 text-body-sm text-fg-muted">{t("companyRules.hostForm.intro")}</p>
          <form action={saveSessionHostCompany} className="mt-4 space-y-4">
            <label className="block">
              <span className="text-label text-fg-heading">{t("companyRules.hostForm.sessionId")}</span>
              <input name="sessionId" type="text" required className={field} />
            </label>
            <label className="block">
              <span className="text-label text-fg-heading">{t("companyRules.hostForm.company")}</span>
              <select name="companyId" className={field}>
                <option value="">{t("companyRules.hostForm.none")}</option>
                {data.companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="h-11 rounded-field bg-navy-950 px-5 text-label text-white hover:bg-navy-900">
              {t("companyRules.hostForm.submit")}
            </button>
          </form>
        </div>

        {data.companyHistory.length > 0 ? (
          <div className="mt-8">
            <h3 className="text-label text-fg-heading">{t("history.heading")}</h3>
            <ul className="mt-4 space-y-2">
              {data.companyHistory.map((row, i) => (
                <li key={i} className="rounded-field border border-edge p-3 text-body-sm text-fg-muted">
                  <bdi>{row.field}</bdi>: <bdi>{JSON.stringify(row.oldValue)}</bdi> → <bdi>{JSON.stringify(row.newValue)}</bdi>
                  {" — "}
                  {formatDateTime(row.changedAt, data.numerals, "Asia/Riyadh", locale)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="manual-heading" className="mt-12 max-w-xl">
        <h2 id="manual-heading" className="text-h2 text-fg-heading">
          {t("manual.heading")}
        </h2>
        <p className="mt-2 text-body text-fg-muted">{t("manual.intro")}</p>
        <form action={saveManualAdjustment} className="mt-4 space-y-4">
          <MemberPicker
            members={members ?? []}
            name="memberId"
            label={t("manual.member")}
            required
            placeholder={tp("placeholder")}
            noMatches={tp("noMatches")}
          />
          <label className="block">
            <span className="text-label text-fg-heading">{t("manual.amount")}</span>
            <input name="amount" type="number" required className={field} />
          </label>
          <label className="block">
            <span className="text-label text-fg-heading">{t("manual.reason")}</span>
            <textarea name="reason" required rows={2} className={field} style={{ height: "auto" }} />
          </label>
          <button type="submit" className="h-11 rounded-field bg-navy-950 px-5 text-label text-white hover:bg-navy-900">
            {t("manual.submit")}
          </button>
        </form>
      </section>

      <section aria-labelledby="history-heading" className="mt-12">
        <h2 id="history-heading" className="text-h2 text-fg-heading">
          {t("history.heading")}
        </h2>
        {data.history.length === 0 ? (
          <p className="mt-4 text-body text-fg-muted">{t("history.empty")}</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {data.history.map((row, i) => (
              <li key={i} className="rounded-field border border-edge p-3 text-body-sm text-fg-muted">
                <bdi>{row.field}</bdi>: <bdi>{JSON.stringify(row.oldValue)}</bdi> → <bdi>{JSON.stringify(row.newValue)}</bdi>
                {" — "}
                {formatDateTime(row.changedAt, data.numerals, "Asia/Riyadh", locale)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
