import { getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/ui/button";
import { ChevronIcon } from "@/components/ui/icons";
import { Link } from "@/components/ui/link";
import { Panel } from "@/components/ui/panel";

// The self tier — REQ-PRF-004, A33, DEC-213 §5.122, DEC-214 §3 N7.
//
// `SelfNote`: «هكذا يرى زملاؤك ملفك.» with the way to edit it (`/app/me`) and to the ledger (`/app/me/points`) —
// everything self-only lives in the hub and is edited there (pinned by `wave7-sessions-profile.spec.ts`).
// `SelfLinks`: the self tier's sections as LINKS into the hub, no new data on this page — ★ only to pages that exist
// (N7): the ledger, the email (`/app/me`), notification preferences. Attended sessions, ratings given and no-shows
// have no page yet and wait for M10c. ★ No email is drawn on this page, on any tier but the admin's record.
export async function SelfNote() {
  const t = await getTranslations("members.profile");
  return (
    <Panel tone="info" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-body text-fg-body">{t("selfNote")}</p>
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/app/me" variant="primary" size="md">
          {t("editProfile")}
        </ButtonLink>
        <ButtonLink href="/app/me/points" variant="secondary" size="md">
          {t("myPoints")}
        </ButtonLink>
      </div>
    </Panel>
  );
}

const LINKS = [
  { key: "ledger", href: "/app/me/points" },
  { key: "email", href: "/app/me" },
  { key: "notifications", href: "/app/me/notifications" },
] as const;

export async function SelfLinks() {
  const t = await getTranslations("members.profile");
  return (
    <section aria-labelledby="self-links" className="flex flex-col gap-2 lg:[grid-area:self]">
      <h2 id="self-links" className="px-1 font-display text-play-sm font-extrabold text-fg-heading">
        {t("selfLinks")}
      </h2>
      <ul className="flex flex-col divide-y divide-edge rounded-panel border border-edge bg-surface">
        {LINKS.map((link) => (
          <li key={link.key}>
            <Link href={link.href} className="flex min-h-11 items-center justify-between gap-3 px-4 py-3 text-body font-semibold text-fg-heading">
              {t(`links.${link.key}`)}
              <ChevronIcon direction="forward" className="text-fg-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
