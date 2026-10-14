import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { Link } from "@/components/ui/link";
import { SubmitButton } from "@/components/ui/submit-button";
import { tokenCategory } from "@/lib/dal/email-unsubscribe";
import { platformConfigured } from "@/lib/supabase/env";
import { unsubscribeAction } from "./actions";

// `/[locale]/unsubscribe` — the footer link's page, `REQ-NTF-019`, `DEC-289`. PUBLIC: a member stops a message from
// the message, signed in or not.
//
// ★ IT ASKS, THEN ACTS. A link scanner opens every URL in a mail; a GET that switched mail off would switch it off for
// a member who never clicked. So the page names what will stop and offers ONE button, which posts. The one-click POST
// a mail client sends goes to `/api/email/unsubscribe` instead. The category's name is read off the token for the
// words only — the database refuses the token if it was edited.

export const metadata: Metadata = { robots: { index: false, follow: false } };

const CATEGORIES = ["new_sessions", "announcements", "my_sessions", "reminders", "ratings", "social", "recognition", "proposals", "admin_queue"] as const;

export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ t?: string; state?: string; c?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!platformConfigured()) notFound();
  const { t: token, state, c } = await searchParams;
  const t = await getTranslations("notifications");

  const name = (category: string | null | undefined) =>
    category && (CATEGORIES as readonly string[]).includes(category) ? t(`category.${category as (typeof CATEGORIES)[number]}.name`) : null;

  let body: React.ReactNode;
  if (state === "done") {
    const category = name(c);
    body = (
      <>
        <h1 className="font-display text-[1.75rem] leading-[1.4] font-extrabold text-fg-heading">{t("unsubscribe.done")}</h1>
        {category ? (
          <p className="mt-3 text-body text-fg-muted">
            <bdi>{category}</bdi>
          </p>
        ) : null}
      </>
    );
  } else if (state === "invalid" || !token || tokenCategory(token) === null) {
    body = <h1 className="font-display text-[1.75rem] leading-[1.4] font-extrabold text-fg-heading">{t("unsubscribe.invalid")}</h1>;
  } else {
    const category = name(tokenCategory(token));
    body = (
      <form action={unsubscribeAction} className="flex flex-col gap-6">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="token" value={token} />
        <h1 className="font-display text-[1.75rem] leading-[1.4] font-extrabold text-fg-heading">{t("unsubscribe.title")}</h1>
        {category ? (
          <p className="text-body text-fg-muted">
            <bdi>{category}</bdi>
          </p>
        ) : null}
        <SubmitButton type="submit" size="lg">
          {t("unsubscribe.confirm")}
        </SubmitButton>
      </form>
    );
  }

  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-10 px-5 py-6">
      <Logo height={33} />
      <div>{body}</div>
      <Link href="/app/me/settings" className="text-body-sm text-fg-muted underline underline-offset-4">
        {t("unsubscribe.settings")}
      </Link>
    </main>
  );
}
