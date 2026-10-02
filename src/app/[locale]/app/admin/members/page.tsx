import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ExportDownloadButton } from "@/components/admin/export-download-button";
import { memberQueryParams, parseMemberQuery } from "@/components/admin/members/member-query";
import { PageHeader } from "@/components/ui/page-header";
import { listMembersForConsole } from "@/lib/dal/admin-members";
import { getOrgPrefs } from "@/lib/dal/proposals";
import { requireSession } from "@/lib/dal/session";
import { MembersTable } from "./members-table";

// SCR-049 · /app/admin/members (`REQ-ADM-009`, `REQ-TEN-005`, `REQ-AUT-007`, `REQ-AUT-008`, `REQ-UIX-096`), written for
// wave 22 from `AdminMembers.dc.html` (`DEC-208`: deleted first). The job: an admin finds a member by name, email,
// company or role, and changes a role or suspends from the row — the consequence named first, the last admin's menu
// saying why it cannot be demoted. No invite: members arrive by sign-in.
//
// Admin only, decided at the data (`listMembersForConsole` → null → the streamed not-found, `DEC-134`): a moderator is
// staff and would otherwise read `members_read_org`, but role and status are the «member-management endpoint»
// `REQ-ADM-020` keeps from them. ★ «CSV» is the audited export of THE LIST THE SCREEN SHOWS — the same query, the same
// predicate (`DEC-232` §2.8), its slice recorded in the audit row.

export default async function MembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = parseMemberQuery(await searchParams);

  const [data, session, prefs, t] = await Promise.all([listMembersForConsole(locale, query), requireSession(locale), getOrgPrefs(locale), getTranslations("admin.members")]);
  if (data === null) notFound();

  const slice = memberQueryParams(query, { page: 1 }).toString();

  return (
    <>
      <PageHeader
        inlineActions
        title={t("title")}
        actions={
          <ExportDownloadButton
            href={`/api/admin/exports/members${slice ? `?${slice}` : ""}`}
            fallbackName="members.csv"
            label={t("csv")}
            accessibleName={t("csvLabel")}
            pendingLabel={t("csvPending")}
            doneLabel={t("csvDone")}
            failedLabel={t("csvFailed")}
          />
        }
      />
      <div className="mt-6">
        <MembersTable data={data} query={query} selfId={session.memberId} timeZone={prefs.timeZone} locale={locale} />
      </div>
    </>
  );
}
