import { formatNumber } from "@/components/sessions/numerals";
import type { PlatformAlert } from "@/lib/dal/platform";

// The words for `11` §3.2's eight alerts — REQ-ADM-003, REQ-NFR-016.
//
// Shared by the console's home (the fired ones, «يحتاج انتباهك») and SCR-084
// (all eight), so an alert reads the same on both. It formats what
// `evaluate_alerts()` already measured and decides nothing: the thresholds live
// once, in SQL (`0075`), and the ones shown here are the ones the function
// reports back in `detail`, never constants copied into this file.
//
// Every figure is Western (DEC-124), and every sentence is «label: value» so a
// count never has to agree with a noun it sits beside.

type Translate = (key: string, values?: Record<string, string | number>) => string;

const num = (v: number | string | undefined): number => (typeof v === "number" ? v : Number(v ?? 0));

/** An age in the unit a reader can hold: seconds under a minute, minutes under two hours, hours above. */
export function durationLabel(t: Translate, seconds: number): string {
  if (seconds < 60) {
    const n = Math.max(0, Math.round(seconds));
    return t("units.seconds", { count: n, value: formatNumber(n) });
  }
  if (seconds < 7200) {
    const n = Math.round(seconds / 60);
    return t("units.minutes", { count: n, value: formatNumber(n) });
  }
  const n = Math.round(seconds / 3600);
  return t("units.hours", { count: n, value: formatNumber(n) });
}

/** `t` is `getTranslations("platform")` or `useTranslations("platform")`. */
export function describeAlert(t: Translate, reading: PlatformAlert): { title: string; detail: string } {
  const d = reading.detail;
  const title = t(`alerts.${reading.alert}.title`);
  const value = (key: string) => formatNumber(num(d[key]));

  switch (reading.alert) {
    case "queue_stalled":
      if (d.status === "not_installed") return { title, detail: t("alerts.notInstalled") };
      return {
        title,
        detail: t("alerts.queue_stalled.detail", {
          age: durationLabel(t, num(d.oldest_pending_seconds)),
          threshold: durationLabel(t, num(d.threshold_seconds)),
        }),
      };
    case "calendar_backlog":
      return {
        title,
        detail: t("alerts.calendar_backlog.detail", { value: value("pending"), age: durationLabel(t, num(d.oldest_seconds)) }),
      };
    case "email_bounce_spike":
      return {
        title,
        detail: t("alerts.email_bounce_spike.detail", {
          // One decimal is enough to read a spike; `0075` rounds to four.
          rate: t("units.percent", { value: formatNumber(Math.round(num(d.rate) * 1000) / 10) }),
          value: value("sent_1h"),
        }),
      };
    case "render_failures":
      return {
        title,
        detail: t("alerts.render_failures.detail", { value: value("consecutive_failures"), threshold: value("threshold") }),
      };
    case "impersonation_active":
      return {
        title,
        detail: t("alerts.impersonation_active.detail", {
          hours: durationLabel(t, num(d.open_over_hours) * 3600),
          value: value("sessions"),
        }),
      };
    case "ledger_divergence":
      return { title, detail: t("alerts.ledger_divergence.detail", { value: value("divergences_24h") }) };
    case "parity_failure":
      return { title, detail: t("alerts.parity_failure.detail", { value: value("failed_fonts_24h") }) };
    case "storage_prefix_violation":
      return { title, detail: t("alerts.storage_prefix_violation.detail", { value: value("violations_24h") }) };
  }
}
