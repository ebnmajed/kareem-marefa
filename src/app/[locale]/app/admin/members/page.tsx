import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { listCompaniesForAdmin } from "@/lib/dal/admin-lists";
import { listMembersForAdmin } from "@/lib/dal/admin-members";
import { getOrgPrefs } from "@/lib/dal/proposals";
import type { Locale } from "@/i18n/routing";
import { requireSession } from "@/lib/dal/session";
import { changeRole, deactivate, reactivate } from "./actions";
import { MembersTable } from "./members-table";

// SCR-049 · /app/admin/members (REQ-ADM-009, REQ-TEN-005, REQ-AUT-007,
// REQ-AUT-008), rebuilt onto the system for wave 6 (`16` §6.7, `DEC-130`) —
// one of the three lists DEC-130 names for `ui/data-table`'s phone card
// stack. Admin only — a moderator is `is_staff()` and would otherwise read
// the org's member rows under `members_read_org`, but role and status
// changes are exactly the "member-management endpoint" REQ-ADM-020 keeps out
// of a moderator's reach, so this whole screen 404s for one rather than
// showing a list with every button refused.

export default async function MembersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [members, companies, session, prefs, t] = await Promise.all([
    listMembersForAdmin(locale),
    listCompaniesForAdmin(locale),
    requireSession(locale),
    getOrgPrefs(locale),
    getTranslations("admin.members"),
  ]);
  if (members === null) notFound();

  const companyNames = new Map((companies ?? []).map((c) => [c.id, c.name]));
  const localeTyped = locale as Locale;

  // ★ MAPS of bound actions, not factory functions — see `members-table.tsx`'s
  // own comment on `changeRoleActions` for the full reasoning (the same real
  // React-Flight serialisation trap `sessions/page.tsx`'s `transitionActions`
  // documents and was fixed for at the same time as this file).
  const changeRoleActions = Object.fromEntries(members.map((m) => [m.id, changeRole.bind(null, localeTyped, m.id)]));
  const deactivateActions = Object.fromEntries(members.map((m) => [m.id, deactivate.bind(null, localeTyped, m.id)]));
  // `.bind()`, not a wrapping arrow function — `reactivate(locale, memberId)`
  // takes no `FormData` at all, but the same rule applies: only an actual
  // bound Server Action reference crosses the boundary, never a closure that
  // merely calls one.
  const reactivateActions = Object.fromEntries(members.map((m) => [m.id, reactivate.bind(null, localeTyped, m.id)]));

  return (
    <>
      <PageHeader title={t("title")} description={t("intro")} />
      <div className="mt-8">
        <MembersTable
          members={members}
          companyNames={companyNames}
          selfId={session.memberId}
          timeZone={prefs.timeZone}
          locale={locale}
          changeRoleActions={changeRoleActions}
          deactivateActions={deactivateActions}
          reactivateActions={reactivateActions}
        />
      </div>
    </>
  );
}
