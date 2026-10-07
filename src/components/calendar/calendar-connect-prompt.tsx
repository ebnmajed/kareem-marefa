import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { oauthClient } from "@/app/api/calendar/oauth";
import { buttonClass } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { SubmitButton } from "@/components/ui/submit-button";
import { getCalendarConnection } from "@/lib/dal/calendar";
import { dismissCalendarPrompt } from "./actions";
import { CALENDAR_PROMPT_COOKIE } from "./prompt-cookie";

// «نضيف جلساتك إلى تقويم Google؟» — the calendar sync offered on the home, beside the photo prompt, so a member knows
// it exists (DEC-276, REQ-CAL-003). The owner's ask: the link to calendar sync «appear in the timeline similar to the
// photo one». It decides only whether it shows and what it says; connecting is SCR-025's Route Handler, unchanged.
//
// ★ It shows only while: the OAuth client is configured (else «اربط» would land on an error), the member has never
// linked a calendar (a disconnected row means they know it exists — and chose), and «لاحقًا» was not pressed on this
// device. «اربط» is a plain link into the Route Handler, never a client navigation (it is an OAuth redirect).
//
// Its own `<h2>`, as the photo prompt's. Place it in its own `<Suspense fallback={null}>`.

export async function CalendarConnectPrompt({ locale }: { locale: string }) {
  if (!oauthClient()) return null;
  const store = await cookies();
  if (store.get(CALENDAR_PROMPT_COOKIE)?.value) return null;
  const [connection, t] = await Promise.all([getCalendarConnection(locale), getTranslations("calendar.prompt")]);
  if (connection) return null;

  return (
    <section aria-labelledby="calendar-connect-title">
      <Panel tone="info" className="flex flex-col gap-3">
        <h2 id="calendar-connect-title" className="text-h3 text-fg-heading">
          {t("title")}
        </h2>
        <p className="text-body text-fg-body">{t("body")}</p>
        <div className="flex flex-wrap gap-3">
          <a href={`/api/calendar/connect?locale=${locale}`} className={buttonClass("primary")}>
            {t("connect")}
          </a>
          <form action={dismissCalendarPrompt}>
            <SubmitButton variant="secondary">{t("dismiss")}</SubmitButton>
          </form>
        </div>
      </Panel>
    </section>
  );
}
