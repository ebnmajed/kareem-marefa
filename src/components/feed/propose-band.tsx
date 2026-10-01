import { getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

// «عندك موضوع؟» — the feed's last region, `Home.dc.html:120-123`. The artboard's «يُجدول في أسبوع» is a promise
// no rule makes, so the line says what happens instead: the organisers review and schedule it.

export async function ProposeBand() {
  const t = await getTranslations("feed.propose");
  return (
    <Panel className="flex flex-wrap items-center gap-3 pg:bg-raised">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 className="font-display text-play-sm leading-[1.4] font-extrabold text-fg-heading">{t("title")}</h2>
        <p className="text-body text-fg-muted">{t("body")}</p>
      </div>
      <ButtonLink href="/app/propose" size="md">
        {t("action")}
      </ButtonLink>
    </Panel>
  );
}
