import { getTranslations } from "next-intl/server";
import { Avatar } from "@/components/ui/avatar";
import { Link } from "@/components/ui/link";
import { Prose } from "@/components/ui/prose";
import type { EventPresenter } from "@/lib/dal/sessions";

// «المُقدِّمون» — `16` §6.3, §6.8.3, REQ-SES-013, REQ-PRF-004.
//
// A face is how a member decides whether they know who is teaching, so each
// presenter gets a 56 px avatar — initials, because the platform-stored avatar
// is not built yet and the Google hotlink is retired (DEC-099). Then the name
// linking to the profile, the job title and company, and the bio exactly as the
// member wrote it.
//
// ★ No rating and no computed history. The canvas's presenter card reads
// «قدّم أربع جلسات سابقة … بمتوسط تقييم 4.6» to every member; ratings are
// org-admin visibility and withheld below a minimum (REQ-RAT-005, REQ-RAT-006),
// so that line is not reproduced (the lead's ruling on §25 Q5).

export async function PresenterList({ presenters }: { presenters: EventPresenter[] }) {
  const t = await getTranslations("sessions.event");
  return (
    <ul className="flex flex-col">
      {presenters.map((p) => {
        const role = [p.jobTitle, p.companyName].filter((v): v is string => Boolean(v));
        return (
          <li key={p.memberId} className="flex items-start gap-4 border-t border-edge py-5 first:border-t-0 first:pt-0">
            <Avatar memberId={p.memberId} displayName={p.displayName} size={56} decorative />
            <div className="flex min-w-0 flex-col gap-1">
              <Link href={`/app/members/${p.memberId}`} className="w-fit text-h3 text-fg-heading underline-offset-4 hover:underline">
                <bdi>{p.displayName ?? t("presenterFallback")}</bdi>
              </Link>
              {role.length > 0 ? (
                <p className="text-body-sm text-fg-muted">
                  {role.map((part, i) => (
                    <span key={i}>
                      {i > 0 ? " · " : null}
                      <bdi>{part}</bdi>
                    </span>
                  ))}
                </p>
              ) : null}
              {p.bio ? (
                <Prose className="mt-1">
                  <p className="whitespace-pre-line">
                    <bdi>{p.bio}</bdi>
                  </p>
                </Prose>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
