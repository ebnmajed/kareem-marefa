import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatDateTime } from "@/components/sessions/numerals";
import { listCompaniesForAdmin } from "@/lib/dal/admin-lists";
import { listMembersForAdmin } from "@/lib/dal/admin-members";
import { getOrgPrefs } from "@/lib/dal/proposals";
import { requireSession } from "@/lib/dal/session";
import { MemberRow } from "./member-row";

// SCR-049 · /app/admin/members (REQ-ADM-009, REQ-TEN-005, REQ-AUT-007,
// REQ-AUT-008). Admin only — a moderator is `is_staff()` and would
// otherwise read the org's member rows under `members_read_org`, but role
// and status changes are exactly the "member-management endpoint"
// REQ-ADM-020 keeps out of a moderator's reach, so this whole screen 404s
// for one rather than showing a list with every button refused.

export default async function MembersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [members, companies, prefs, session, t] = await Promise.all([
    listMembersForAdmin(locale),
    listCompaniesForAdmin(locale),
    getOrgPrefs(locale),
    requireSession(locale),
    getTranslations("admin.members"),
  ]);
  if (members === null) notFound();

  const companyNames = new Map((companies ?? []).map((c) => [c.id, c.name]));

  return (
    <>
      <h1 className="text-h1 text-fg-heading">{t("title")}</h1>
      <p className="mt-3 max-w-2xl text-body text-fg-muted">{t("intro")}</p>

      {members.length === 0 ? (
        <p className="mt-8 text-body text-fg-body">{t("empty")}</p>
      ) : (
        <ul className="mt-8 max-w-3xl space-y-4">
          {members.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              companyName={m.companyId ? (companyNames.get(m.companyId) ?? null) : null}
              isSelf={m.id === session.memberId}
              locale={locale}
              deactivatedLabel={m.deactivatedAt ? formatDateTime(m.deactivatedAt, prefs.timeZone, locale) : ""}
            />
          ))}
        </ul>
      )}
    </>
  );
}
