"use client";

import { useTranslations } from "next-intl";
import { formatNumber } from "@/components/sessions/numerals";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { ConsoleSessionRow } from "@/components/admin/sessions/session-query";

// The cells SCR-042's table and SCR-040's «القادمة» share — one way to draw a
// session's date, presenter and seats in the console (`REQ-UIX-087`). Every
// figure is read from the row (contract 7); every name and number is isolated.

/** «الخميس 2 أكتوبر 6:30 م» — weekday, day, month and time on the org's clock; a past session's day only. Western digits (`DEC-124`). */
export function sessionWhen(row: Pick<ConsoleSessionRow, "startsAt" | "phase">, timeZone: string, locale: string): string | null {
  if (!row.startsAt) return null;
  const past = row.phase === "ended" || row.phase === "cancelled";
  return new Intl.DateTimeFormat(`${locale}-u-nu-latn`, {
    timeZone,
    ...(past ? { day: "numeric", month: "long" } : { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }),
  }).format(new Date(row.startsAt));
}

export function WhenCell({ row, timeZone, locale }: { row: ConsoleSessionRow; timeZone: string; locale: string }) {
  const t = useTranslations("admin.sessions");
  const when = sessionWhen(row, timeZone, locale);
  return when ? <bdi>{when}</bdi> : <span className="text-fg-muted">{t("notScheduled")}</span>;
}

/**
 * The first presenter with the team ring (`REQ-UIX-043`), and — kept from the
 * wave-6 table — a declined or pending presenter said in the row, because it
 * is state that changes what the admin does next (`REQ-SES-019`).
 */
export function PresenterCell({ row }: { row: ConsoleSessionRow }) {
  const t = useTranslations("admin.sessions");
  const lead = row.presenters.find((p) => p.declinedAt === null) ?? row.presenters[0];
  const declined = row.presenters.some((p) => p.declinedAt !== null);
  const pending = row.presenters.some((p) => !p.accepted && p.declinedAt === null);
  if (!lead) return <span className="text-fg-muted">{t("noValue")}</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Avatar memberId={lead.memberId} displayName={lead.displayName} src={lead.avatarUrl} size={24} teamColor={lead.teamColor} decorative />
      <bdi className="text-fg-body">{lead.displayName ?? t("noValue")}</bdi>
      {declined ? (
        <Badge tone="error" size="sm">
          {t("presenterDeclined")}
        </Badge>
      ) : pending ? (
        <Badge tone="live" size="sm">
          {t("presenterPending")}
        </Badge>
      ) : null}
    </span>
  );
}

/** «34 / 40», «25 / 25 · 4» with the waitlist, «— / 25» before any reservation can exist, «—» with no capacity. */
export function SeatsCell({ row }: { row: ConsoleSessionRow }) {
  const t = useTranslations("admin.sessions");
  if (row.capacity === null) return <span className="text-fg-muted">{t("noValue")}</span>;
  const confirmed = row.phase === "draft" || row.phase === "pending_schedule" ? t("noValue") : formatNumber(row.confirmed);
  const values = { confirmed, capacity: formatNumber(row.capacity), waitlisted: formatNumber(row.waitlisted) };
  return <bdi>{row.waitlisted > 0 ? t("seatsWaitlist", values) : t("seats", values)}</bdi>;
}
