import { getTranslations } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { DirectoryMember } from "@/lib/dal/members";

// One row of the directory — `Directory.dc.html:38-45`, REQ-UIX-068.
//
// ★ IT DRAWS WHAT IT IS HANDED. The DTO is tier 1 (`listDirectory()`, contract 7): there is no field here a
// component could leak, and nothing on a row is a rank or a balance, for anyone (DEC-213 §5.111).
//
// The avatar with its team ring (`--team`, never a fill — REQ-PRF-009), the name and a staff member's role, then
// «title · company · N جلسات مقدَّمة» — a noun phrase, never a gendered verb (DEC-213 §5.109) — and the level at the
// inline-end in its ramp colour (`01-tokens.md`'s ramp, DEC-214 §3 N4). A member with no company says so, muted
// (§5.112); one who delivered nothing has no clause. A deactivated member — on an admin's list only — is marked in
// words and is not a link: their profile answers not-found for everyone (REQ-PRF-005, REQ-PRF-007).
export async function DirectoryRow({ member }: { member: DirectoryMember }) {
  const [t, tp] = await Promise.all([getTranslations("members.directory"), getTranslations("members.profile")]);
  const body = (
    <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5">
      <Avatar memberId={member.id} displayName={member.displayName} src={member.avatarUrl} size={44} teamColor={member.company?.teamColor ?? null} decorative />
      <div className="min-w-0 flex-1 leading-snug">
        <p className="text-body font-bold text-fg-heading">
          <bdi>{member.displayName}</bdi>
          {member.role !== "member" ? <span className="ms-1.5 text-caption font-semibold text-fg-muted">{tp(`role.${member.role}`)}</span> : null}
        </p>
        <p className="text-caption text-fg-muted">
          {member.jobTitle ? (
            <>
              <bdi>{member.jobTitle}</bdi>
              {" · "}
            </>
          ) : null}
          {member.company ? <bdi>{member.company.name}</bdi> : <span className="opacity-80">{t("noCompany")}</span>}
          {member.presentedCount > 0 ? (
            <>
              {" · "}
              {tp("presentedCount", { count: member.presentedCount, value: formatNumber(member.presentedCount) })}
            </>
          ) : null}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {member.level ? (
          <Badge level={member.level.tier} size="sm">
            <bdi>{member.level.name}</bdi>
          </Badge>
        ) : null}
        {member.deactivated ? (
          <Badge tone="neutral" outline size="sm">
            {t("deactivated")}
          </Badge>
        ) : null}
      </div>
    </div>
  );
  return (
    <Card density="row" href={member.deactivated ? undefined : `/app/members/${member.id}`} className={member.deactivated ? "opacity-80" : ""}>
      {body}
    </Card>
  );
}
