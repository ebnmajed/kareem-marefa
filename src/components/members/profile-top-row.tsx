import { getTranslations } from "next-intl/server";
import { ChevronIcon } from "@/components/ui/icons";
import { Link } from "@/components/ui/link";
import { ShareProfile } from "@/components/members/share-profile";

// The profile's top row — `Profile.dc.html:18-23`, `ProfileDesktop.dc.html:37`, DEC-213 §3.2, §5.118.
//
// On the phone the page owns its first row (contract 1, `ownsTopRow`): back to the directory, the breadcrumb, share.
// From `lg` the shell's bar stands and the row is the breadcrumb alone — no back, no share, as drawn (DEC-214 §3 N5).
// «الأعضاء» is a link; the company is text, in `<bdi>`.
export async function ProfileTopRow({ name, company }: { name: string; company: string | null }) {
  const t = await getTranslations("members.profile");
  return (
    <div className="flex items-center gap-3">
      <Link
        href="/app/members"
        aria-label={t("back")}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-pill border border-edge bg-surface text-fg-heading lg:hidden"
      >
        <ChevronIcon direction="back" />
      </Link>
      <nav aria-label={t("breadcrumb")} className="min-w-0 flex-1 text-center lg:text-start">
        <ol className="inline-flex flex-wrap items-center gap-x-1.5 text-caption text-fg-muted">
          <li>
            <Link href="/app/members" quiet className="underline-offset-4 hover:text-fg-heading hover:underline">
              {t("directory")}
            </Link>
          </li>
          {company ? (
            <li className="flex items-center gap-1.5">
              <ChevronIcon direction="forward" className="text-[0.75rem] opacity-70" />
              <bdi>{company}</bdi>
            </li>
          ) : null}
        </ol>
      </nav>
      <div className="shrink-0 lg:hidden">
        <ShareProfile label={t("share")} title={name} copied={t("shareCopied")} failed={t("shareFailed")} />
      </div>
    </div>
  );
}
