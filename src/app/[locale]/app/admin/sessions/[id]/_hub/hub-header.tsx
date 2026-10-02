import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { ButtonLink } from "@/components/ui/button";
import { SessionStatusBadge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton, SkeletonPageHeader } from "@/components/ui/skeleton";
import { getSessionHubHeader } from "@/lib/dal/sessions";
import { storedPhase } from "@/lib/session-status";
import { cancelFromHub, publishFromHub } from "./actions";
import { HubTabAction, type HubTab } from "./hub-tab-action";
import { CancelAction, PublishAction } from "./lifecycle";

// The session hub's ONE header — REQ-UIX-089, REQ-SES-020, contract 4 (`DEC-227` §5.2, `DEC-228`), from
// `AdminSessionHub.dc.html` and `AdminAttendance.dc.html`: the breadcrumb, the `h1`, the status badge, and the actions —
// the tab's own primary, «صفحة الجلسة», the lifecycle action. A tab's page renders none of it.
//
// ★ IT DECIDES NOTHING. `null` from the DAL — not staff, not this org, any error — renders nothing, and each page is
// still its own boundary (a layout's `notFound()` streams a 200). Rendered by the layout inside its own Suspense, so
// its one query never holds up the tab.

const PUBLISHABLE = new Set(["draft", "submitted", "in_review", "changes_requested", "approved"]);
const CANCELLABLE = new Set(["published", "in_progress"]);

export async function HubHeader({ locale, sessionId, tabActions }: { locale: string; sessionId: string; tabActions: Partial<Record<HubTab, ReactNode>> }) {
  const [header, t, tMissing] = await Promise.all([getSessionHubHeader(locale, sessionId), getTranslations("sessions.hub"), getTranslations("schedule.missing")]);
  if (!header) return null;

  // DEC-228 §4.2: the lifecycle offers nothing once completed, archived or cancelled; a moderator sees none.
  let lifecycle: ReactNode = null;
  if (header.viewerRole === "admin" && PUBLISHABLE.has(header.state)) {
    const missing = header.missing.map((m) => tMissing(m === "endsAt" ? "duration" : m)).join(" · ");
    lifecycle = <PublishAction action={publishFromHub.bind(null, locale as Locale, sessionId)} missing={missing || null} />;
  } else if (header.viewerRole === "admin" && CANCELLABLE.has(header.state)) {
    lifecycle = <CancelAction action={cancelFromHub.bind(null, locale as Locale, sessionId)} title={header.title} />;
  }

  return (
    <PageHeader
      className="mb-4"
      title={header.title}
      breadcrumb={[{ href: "/app/admin/sessions", label: t("breadcrumb") }]}
      breadcrumbLabel={t("breadcrumbLabel")}
      status={<SessionStatusBadge phase={storedPhase(header.state)} />}
      actions={
        <HubTabAction
          actions={tabActions}
          page={
            <ButtonLink href={`/app/sessions/${sessionId}`} variant="quiet" size="md">
              {t("items.event")}
            </ButtonLink>
          }
          lifecycle={lifecycle}
        />
      }
    />
  );
}

/** The header's place while its one query runs — no text, so nothing to translate and no shift. */
export function HubHeaderSkeleton() {
  return (
    <div aria-hidden="true" className="mb-4 flex flex-col gap-2">
      <SkeletonPageHeader />
      <Skeleton width="10rem" />
    </div>
  );
}
