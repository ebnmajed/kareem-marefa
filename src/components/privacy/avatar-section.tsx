import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Avatar } from "@/components/ui/avatar";
import type { Locale } from "@/i18n/routing";
import { getMyAvatar } from "@/lib/dal/avatars";
import { getMe } from "@/lib/dal/members";
import { setAvatarImportAction } from "@/app/[locale]/app/me/privacy/actions";
import { AvatarAnswerForm } from "./avatar-answer-form";

// /app/me/privacy's «صورتك الشخصية» — where the answer to «نستخدم صورتك من
// Google؟» is changed (REQ-PRF-008, REQ-PRF-009, DEC-182). One picture, one
// sentence, one button — four states, read from the row, never from a toast:
//
//   · a copy exists         → our copy, «أزل صورتي» (immediate: the read policy
//                              stops serving it in the statement that clears it)
//   · yes, no copy yet      → initials, «أعد المحاولة» (a failure left initials)
//   · no, or not answered   → initials, «استخدم صورتي من Google»
//   · Google gave nothing   → initials, and nothing to offer
//
// No `role="status"` here on purpose: the page's deactivation confirmation is
// the one status region `privacy.spec.ts` finds by role.

export async function AvatarSection({ locale }: { locale: string }) {
  const [mine, me, t] = await Promise.all([getMyAvatar(locale), getMe(locale), getTranslations("privacy.avatar.section")]);
  const bind = (answer: "accepted" | "declined") => setAvatarImportAction.bind(null, locale as Locale, answer);

  let line: string;
  let control: ReactNode = null;
  if (mine.href) {
    line = t("ready");
    control = <AvatarAnswerForm action={bind("declined")} label={t("remove")} size="sm" />;
  } else if (!mine.hasSource) {
    line = t("noSource");
  } else if (mine.answer === "accepted") {
    line = t("pending");
    control = <AvatarAnswerForm action={bind("accepted")} label={t("retry")} size="sm" />;
  } else {
    line = t("initials");
    control = <AvatarAnswerForm action={bind("accepted")} label={t("use")} size="sm" />;
  }

  // ★ wave 26 (REQ-UIX-117): presentation only — the answer sits on `/app/me/privacy` as one more card in the page's
  // register, after the legal links (DEC-251 §3.5), its title at label scale like the cards above it; the four states,
  // their words and their forms are unchanged.
  return (
    <section aria-labelledby="avatar" className="rounded-panel border border-edge bg-surface p-4">
      <h2 id="avatar" className="text-label font-bold text-fg-heading">
        {t("title")}
      </h2>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Avatar memberId={me.id} displayName={me.displayName} src={mine.href} size={56} decorative />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
          <p className="text-body-sm text-fg-body">{line}</p>
          {control}
        </div>
      </div>
    </section>
  );
}
