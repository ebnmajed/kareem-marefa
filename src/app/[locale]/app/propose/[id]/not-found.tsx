"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { RouteError } from "@/components/ui/route-error";

// sessions's file — `16` §7.4, REQ-UIX-016, DEC-091, DEC-101.
//
// SCR-018 calls `notFound()` for a proposal id that does not resolve — and
// «does not resolve» includes SOMEBODY ELSE'S proposal, because
// `proposals_select_own` returns no row and the page cannot tell the two
// apart. That is the correct behaviour and not a gap: telling a member that a
// proposal exists but is not theirs is itself a disclosure.
//
// ★ The way back is «مقترحاتي» and not «تصفّح الجلسات». A member who followed
// a dead proposal link wants their own pipeline, which is where the list of
// their proposals lives; sending them to the catalogue would be a label that
// matches the house copy and an action that does not match their intent.
export default function ProposalNotFound() {
  const t = useTranslations("ui.error");
  const tp = useTranslations("proposals.propose");
  const locale = useLocale();
  const router = useRouter();
  return (
    <RouteError
      title={t("notFoundTitle")}
      description={t("notFoundDescription")}
      retryLabel={t("retry")}
      backLabel={tp("mine.title")}
      backHref={`/${locale}/app/propose`}
      reset={() => router.refresh()}
    />
  );
}
