import { redirect } from "@/i18n/navigation";

// `/app/platform` — the console has no dashboard of its own. SCR-080 is the
// first screen a super admin wants and the only one the other four hang off,
// so this redirects rather than inventing a landing page that would say what
// the org list already says.
//
// No gate here: `redirect()` runs before anything is read, and SCR-080 itself
// calls `requirePlatformAdmin()` at the data.
export default async function PlatformIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect({ href: "/app/platform/orgs", locale });
}
