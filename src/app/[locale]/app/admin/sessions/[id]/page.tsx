import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getSessionSettingsNav } from "@/lib/dal/sessions";

// `/app/admin/sessions/[id]` — the hub's one address (REQ-SES-020, DEC-178).
// A REDIRECT, not a screen: an admin lands on the schedule, a moderator on
// attendance, and anyone else gets the not-found page. It exists because a
// screen already linked here (the survey's breadcrumb) and 404'd, and so that
// «this session's settings» has one URL.
//
// Under `[id]/loading.tsx` the redirect arrives streamed rather than as a 307 —
// the same as every page there that answers early.

export default async function SessionSettingsIndex({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const nav = await getSessionSettingsNav(locale, id);
  if (!nav) notFound();
  const first = nav.items.includes("schedule") ? "schedule" : "attendance";
  redirect({ href: `/app/admin/sessions/${id}/${first}`, locale });
}
