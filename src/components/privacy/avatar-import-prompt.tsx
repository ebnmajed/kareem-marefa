import { getTranslations } from "next-intl/server";
import { Panel } from "@/components/ui/panel";
import type { Locale } from "@/i18n/routing";
import { getMyAvatar } from "@/lib/dal/avatars";
import { setAvatarImportAction } from "@/app/[locale]/app/me/privacy/actions";
import { AvatarAnswerForm } from "./avatar-answer-form";

// «نستخدم صورتك من Google؟» — Google's photo offered ONCE, as an explicit import
// (REQ-PRF-008, DEC-099, DEC-180 §3). The lead places it on the /app timeline
// beside the company prompt (DEC-182); this file decides only whether it shows
// and what it says.
//
// ★ It shows while the member has not answered AND Google gave us something to
// copy. After either answer it is gone for good; the answer is changed on
// /app/me/privacy, never here.
//
// ★ IT NEVER PREVIEWS THE PHOTO. Drawing Google's picture so the member can
// decide would be the very hotlink DEC-099 retired — the viewer's browser
// fetching from Google — before they had said yes to anything.
//
// It renders its own `<h2>` because it is a self-contained question on a page
// whose other sections it does not know. Place it inside `#main`, in its own
// `<Suspense fallback={null}>`, so it never delays the page it sits on.

export async function AvatarImportPrompt({ locale }: { locale: string }) {
  const [mine, t] = await Promise.all([getMyAvatar(locale), getTranslations("privacy.avatar.prompt")]);
  if (mine.answer !== null || !mine.hasSource) return null;

  return (
    <section aria-labelledby="avatar-import-title">
      <Panel tone="info" className="flex flex-col gap-3">
        <h2 id="avatar-import-title" className="text-h3 text-fg-heading">
          {t("title")}
        </h2>
        <p className="text-body text-fg-body">{t("body")}</p>
        <div className="flex flex-wrap gap-3">
          <AvatarAnswerForm action={setAvatarImportAction.bind(null, locale as Locale, "accepted")} label={t("accept")} variant="primary" />
          <AvatarAnswerForm action={setAvatarImportAction.bind(null, locale as Locale, "declined")} label={t("decline")} variant="secondary" />
        </div>
      </Panel>
    </section>
  );
}
