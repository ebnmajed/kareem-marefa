import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { getMemberProfile, listCompanies } from "@/lib/dal/members";

// Another member's profile at the MEMBER tier (REQ-PRF-004, A33). The
// fields here are exactly what members_member_view exposes; nothing else
// can reach this page, because nothing else reaches the DAL.
export default async function MemberPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const [member, companies, t, format] = await Promise.all([getMemberProfile(locale, id), listCompanies(locale), getTranslations("profile"), getFormatter()]);

  if (!member) {
    return <h1 className="text-h1 text-fg-heading">{t("notFound")}</h1>;
  }
  const company = companies.find((c) => c.id === member.companyId);
  return (
    <>
      <h1 className="text-h1 text-fg-heading">
        <bdi>{member.displayName ?? "—"}</bdi>
      </h1>
      <p className="mt-2 text-body text-fg-muted">
        {t(`role.${member.role}`)}
        {company ? (
          <>
            {" · "}
            <bdi>{company.name}</bdi>
          </>
        ) : null}
        {member.jobTitle ? (
          <>
            {" · "}
            <bdi>{member.jobTitle}</bdi>
          </>
        ) : null}
      </p>
      <p className="mt-6 max-w-prose text-body-lg">{member.bio ?? t("noBio")}</p>
      <p className="mt-6 text-caption text-fg-muted">{t("memberSince", { date: format.dateTime(new Date(member.createdAt), { dateStyle: "long" }) })}</p>
    </>
  );
}
