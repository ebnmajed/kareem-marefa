import { getTranslations, setRequestLocale } from "next-intl/server";
import { getNotificationMatrix, getPreferenceMatrix } from "@/lib/dal/notifications";
import { getCalendarConnection } from "@/lib/dal/calendar";
import { getMe } from "@/lib/dal/members";
import { categoryRows, emailMasterOn } from "@/components/settings/email-master";
import { HubTopRow } from "@/components/shell/hub-top-row";
import { Button } from "@/components/ui/button";
import { SettingsGroup } from "@/components/ui/settings-group";
import type { SettingsRow } from "@/components/ui";
import type { Locale } from "@/i18n/routing";
import { saveCategory, saveVisibility, setEmailMaster } from "./actions";

// SCR-029 · «الإعدادات», a new route — `Settings.dc.html`, `M10c.md` §6b, REQ-UIX-077. Its kept-behaviour table is
// P1 – P19, O1, L1 – L2 and M1 – M6 in `docs/plan/notes/notify.md` (§W2, §W12): every behaviour `preference-matrix` had,
// each with the requirement that keeps it, and the leaderboard opt-out moved from `021` (contract 5, DEC-217 §3.1).
//
// In the artboard's order: the page's own top row (back to `/app/me`, the `h1`) and NO hub strip; a card of switches;
// the one sentence for what cannot be switched off; a card of links; the footer — sign-out and the email.
//
// ★ The switches (DEC-218 §2.1, DEC-219 §1):
//   · «إشعارات البريد» — every optional category at once; its state DERIVED from the rows (`emailMasterOn`);
//   · a row per optional category that holds an optional EMAIL message (`categoryRows`), from the database's matrix —
//     `admin_queue` for staff only, `proposals` not a row (no optional email message), the three fixed categories
//     never (P3, P4, P6). Each writes its email preference and sets in-app on (P8, P12 — per-channel in-app control
//     is withdrawn, REQ-UIX-077);
//   · «الظهور في لوحات الصدارة» — on is not opted out (O1, REQ-LDR-008).
// Each saves on change, works without JavaScript, and on a refusal returns to the database's value with
// `preferences.error` beside it (P13, P16). No «saved» line (P15): a saved form says nothing.
//
// ★ No «اللغة» row (DEC-218 §2.4, D6): English is not served (`proxy.ts`), and a row that goes nowhere fails
// REQ-UIX-080.
export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const [t, tNotifications, tCalendar, preferences, matrix, me, connection] = await Promise.all([
    getTranslations("settings"),
    getTranslations("notifications"),
    getTranslations("calendar"),
    getPreferenceMatrix(locale),
    getNotificationMatrix(locale),
    getMe(locale),
    getCalendarConnection(locale),
  ]);
  const connected = Boolean(connection && !connection.disconnectedAt);
  const common = { errorLabel: t("error"), saveLabel: t("save") };

  const switches: SettingsRow[] = [
    { kind: "switch", id: "email", label: t("email"), checked: emailMasterOn(preferences.rows), action: setEmailMaster.bind(null, loc), ...common },
    ...categoryRows(preferences.rows, matrix).map(
      (row): SettingsRow => ({
        kind: "switch",
        id: `category-${row.category}`,
        label: tNotifications(`category.${row.category}.name`),
        checked: row.enabled.email,
        action: saveCategory.bind(null, loc),
        hidden: { category: row.category },
        ...common,
      }),
    ),
    { kind: "switch", id: "visibility", label: t("visibility"), checked: !me.leaderboardOptOut, action: saveVisibility.bind(null, loc), ...common },
  ];

  const links: SettingsRow[] = [
    { kind: "link", id: "calendar", label: t("calendar"), value: connected ? tCalendar("connection.on") : tCalendar("connection.off"), href: "/app/me/calendar" },
    { kind: "link", id: "privacy", label: t("privacy"), href: "/app/me/privacy" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <HubTopRow title={t("title")} />

      <div className="flex flex-col gap-2">
        <SettingsGroup title={t("groups.switches")} showTitle={false} rows={switches} />
        {/* `08` §1.7's seventeen and §2's three fixed categories — one sentence, never rows (DEC-216 §5.15, P4, P5). */}
        <p className="px-1 text-body-sm text-fg-muted">{t("alwaysOn")}</p>
      </div>

      <SettingsGroup title={t("groups.links")} showTitle={false} rows={links} />

      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        {/* The account menu's own endpoint: sign-out is a POST (L2). */}
        <form method="post" action="/api/auth/sign-out">
          <Button type="submit" variant="quiet" size="sm">
            {t("signOut")}
          </Button>
        </form>
        <span className="text-body-sm text-fg-muted">
          <bdi>{me.email}</bdi>
        </span>
      </div>
    </div>
  );
}
