import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { getOrgPrefs } from "@/lib/dal/proposals";
import { countMyPhotoRemovalRequests, getMyExportRequest, type DataExportRequest } from "@/lib/dal/privacy";
import { HubTopRow } from "@/components/shell/hub-top-row";
import { buttonClass } from "@/components/ui/button";
import { SettingsGroup } from "@/components/ui/settings-group";
import type { SettingsRow } from "@/components/ui";
import { formatNumber } from "@/components/sessions/numerals";
import { AvatarSection } from "@/components/privacy/avatar-section";
import { DeactivateSheet } from "@/components/privacy/deactivate-sheet";
import { ExportRequest } from "@/components/privacy/export-request";
import { requestDeactivationAction, requestExportAction } from "./actions";

// `/app/me/privacy` · «البيانات والخصوصية» — `Privacy.dc.html`, `M13.md`, REQ-UIX-117, REQ-PRF-006, REQ-PRF-007,
// REQ-PRF-008, REQ-NFR-013, REQ-EVT-012, DEC-251 §3. Rebuilt from the artboard (DEC-208): the kept-behaviour table is
// P1 – P22 and N9 – N13 in `docs/plan/notes/branding.md` W26.2.
//
// ★ A hub page behind settings, not a strip tab (DEC-NEXT-39): its own top row, back to `029`. The hub frame is the
// lead's; this page renders its row and its content.
// ★ THE EXPORT'S STATE IS READ, NEVER ASSUMED — `my_data_export()`'s latest row: never asked · طُلب (queued) · جارٍ
// (building) · جاهز with its date and «نزّل» · انتهت صلاحيته (expired by `enforce_retention()`) · تعثّر (failed). The
// archive is kept seven days (`retention_periods`, which a member cannot read, so the sentence is the literal it was —
// DEC-251 §3.3). The 24-hour limit is said BEFORE the click (REQ-NFR-005); the RPC enforces it either way.
// ★ «نزّل» is a plain `<a download>` to the Route Handler — it works without JavaScript.
// ★ PHOTOGRAPHS ARE NOT TAGGED (DEC-011), so «الصور التي تظهر فيها» has no data: the row counts what exists — the
// member's own removal requests — and offers no page-level «أزلني» (DEC-251 §3.1); a removal is asked for on the
// photograph itself.
// ★ The profile-picture answer is kept, after the legal links (REQ-PRF-008, DEC-182) — `AvatarSection`, untouched.
// ★ Dates follow the ORG's time zone, in Western numerals (REQ-TEN-008, DEC-124).

export default async function MyPrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [request, removals, prefs, t, tSettings] = await Promise.all([
    getMyExportRequest(locale),
    countMyPhotoRemovalRequests(locale),
    getOrgPrefs(locale),
    getTranslations("privacy.page"),
    getTranslations("settings"),
  ]);
  const day = (iso: string) => new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { day: "numeric", month: "long", timeZone: prefs.timeZone }).format(new Date(iso));

  const rows: SettingsRow[] = [
    exportRow(request, t, day, locale as Locale),
    { kind: "action", id: "photos", label: t("photosTitle"), value: removals === null ? null : formatNumber(removals), control: null },
  ];
  const legal: SettingsRow[] = [
    { kind: "link", id: "policy", label: t("policy"), href: "/legal/privacy" },
    { kind: "link", id: "terms", label: t("terms"), href: "/legal/terms" },
  ];

  return (
    <>
      {/* The back control returns to settings and is named for it (`Privacy.dc.html:20`, «الإعدادات»). */}
      <HubTopRow title={t("title")} backHref="/app/me/settings" backLabel={tSettings("title")} />
      <div className="flex flex-col gap-3">
        <SettingsGroup title={t("groupData")} showTitle={false} rows={rows} />
        {/* REQ-PRF-006's second acceptance criterion, said to the person it protects. */}
        <p className="px-1 text-body-sm text-fg-muted">{t("exportNote")}</p>
      </div>
      <SettingsGroup title={t("groupLegal")} showTitle={false} rows={legal} />
      <AvatarSection locale={locale} />
      <div className="flex flex-col px-1 pt-2">
        <DeactivateSheet action={requestDeactivationAction.bind(null, locale as Locale)} />
      </div>
    </>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<"privacy.page">>>;

function exportRow(request: DataExportRequest | null, t: T, day: (iso: string) => string, locale: Locale): SettingsRow {
  const base = { kind: "action" as const, id: "export", label: t("exportTitle") };
  const ask = (label: string) =>
    request && !request.canRequestAgain ? null : <ExportRequest label={label} action={requestExportAction.bind(null, locale)} />;
  const limited = request && !request.canRequestAgain ? t("rateLimited") : null;

  if (!request) return { ...base, value: null, control: ask(t("exportRequest")) };
  switch (request.status) {
    case "queued":
      return { ...base, value: t("statusQueued", { date: day(request.requestedAt) }), control: null };
    case "building":
      return { ...base, value: t("statusBuilding"), control: null };
    case "ready":
      return {
        ...base,
        value: t("statusReady", { date: day(request.completedAt ?? request.requestedAt) }),
        detail: t("expiryNote"),
        control: (
          <a href="/api/me/export" download className={buttonClass("primary", "sm")}>
            {t("exportDownload")}
          </a>
        ),
      };
    case "expired":
      return { ...base, value: t("statusExpired"), detail: limited, control: ask(t("exportAgain")) };
    case "failed":
      return { ...base, value: t("statusFailed"), detail: limited, control: ask(t("exportAgain")) };
  }
}
