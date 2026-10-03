import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

// `/app/admin/moderation/comments` — kept as an address only (DEC-230 §3, REQ-UIX-103). Comment reports are decided on
// البلاغات now, so a bookmark lands there instead of on a 404. A 307, not a permanent redirect: a browser caches a 308,
// and this path may be used again. It gates nothing — `/reports` answers a member with its own not-found.

export default async function CommentModerationRedirect({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  redirect({ href: "/app/admin/moderation/reports", locale });
}
