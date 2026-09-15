import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getMe, listCompanies } from "@/lib/dal/members";
import { saveProfile } from "./actions";

// The member's own profile (REQ-PRF-001): name, company from the org's list,
// job title, bio, leaderboard opt-out. Email is shown, not editable — it is
// the account.
export default async function MePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { saved, error } = await searchParams;
  const [me, companies, t] = await Promise.all([getMe(locale), listCompanies(locale), getTranslations("profile")]);

  const field = "mt-1 block h-12 w-full rounded-field border border-edge-strong bg-canvas px-4 text-body text-fg-heading";
  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("title")}</h1>
      <p className="mt-2 text-body text-fg-muted">
        <bdi>{me.email}</bdi> · {t(`role.${me.role}`)}
      </p>
      {/* The member's own pages, reachable from the hub (Launch, 2026-09-15). */}
      <nav aria-label={t("nav.label")} className="mt-5">
        <ul className="flex flex-wrap gap-2">
          {(["notifications", "calendar", "certificates", "points", "bookmarks", "privacy"] as const).map((key) => (
            <li key={key}>
              <Link href={`/app/me/${key}`} className="inline-flex h-10 items-center rounded-field border border-edge px-3 text-label text-fg-heading hover:bg-silver-100">
                {t(`nav.${key}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {saved ? (
        <p role="status" className="mt-4 rounded-field border border-edge bg-silver-100 p-3 text-body text-fg-heading">
          {t("saved")}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 rounded-field border border-edge-strong p-3 text-body text-fg-heading">
          {t("invalid")}
        </p>
      ) : null}
      <form action={saveProfile} className="mt-8 max-w-xl space-y-5">
        <div>
          <label htmlFor="displayName" className="text-label text-fg-heading">
            {t("displayName")}
          </label>
          <input id="displayName" name="displayName" required maxLength={120} defaultValue={me.displayName ?? ""} className={field} />
        </div>
        <div>
          <label htmlFor="companyId" className="text-label text-fg-heading">
            {t("company")}
          </label>
          <select id="companyId" name="companyId" defaultValue={me.companyId ?? ""} className={field}>
            <option value="">{t("companyNone")}</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="jobTitle" className="text-label text-fg-heading">
            {t("jobTitle")}
          </label>
          <input id="jobTitle" name="jobTitle" maxLength={120} defaultValue={me.jobTitle ?? ""} className={field} />
        </div>
        <div>
          <label htmlFor="bio" className="text-label text-fg-heading">
            {t("bio")}
          </label>
          <textarea id="bio" name="bio" maxLength={600} rows={4} defaultValue={me.bio ?? ""} aria-describedby="bio-hint" className={`${field} h-auto py-3`} />
          <p id="bio-hint" className="mt-1 text-caption text-fg-muted">
            {t("bioHint")}
          </p>
        </div>
        <label className="flex items-center gap-3 text-body text-fg-heading">
          <input type="checkbox" name="leaderboardOptOut" defaultChecked={me.leaderboardOptOut} className="size-5 accent-navy-950" />
          {t("leaderboardOptOut")}
        </label>
        <button type="submit" className="inline-flex h-12 items-center rounded-field bg-navy-950 px-7 text-label text-white hover:bg-navy-900">
          {t("save")}
        </button>
      </form>
    </>
  );
}
