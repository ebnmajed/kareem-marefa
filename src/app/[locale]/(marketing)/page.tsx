import { getTranslations, setRequestLocale } from "next-intl/server";
import { IntroSting } from "@/components/intro-sting";
import { routing } from "@/i18n/routing";

// SCR-000 · the landing — REQ-UIX-114, REQ-UIX-025, REQ-NFR-019, DEC-247, DEC-252.
// Rebuilt in wave 26 from `docs/design/screens/m13/Landing.dc.html`. The regions, in the artboard's order:
// the hero with its three posters · the seven companies as team rings · what the initiative is · the four things
// the platform does · the two paths. The header and the footer are the layout's.
//
// ★ THE COPY IS `marketing.json`'s, UNCHANGED (`M13.md` §000). Where the artboard's words differ — it draws four
// steps a path and the catalogue has three, each with a sentence — the catalogue wins and the drawing gives the
// structure. What is new is what the artboard adds: the two nav labels, the three poster titles, the company
// names.
//
// ★ NO BUTTON ON THE PAGE (DEC-266, the owner's ruling): the hero's two doors and the register band are gone. The one
// button on the public site is the header's «تسجيل الدخول», in the first viewport at every width.
//
// ★ STATIC, and it stays static: no session, no cookie, no data. The companies and the posters are copy, and
// their colours are the seven team constants — a ring's colour is never the only channel, the name is beside it.
//
// ★ NOTHING HERE MOVES. The one motion on this page is the mark's reveal on a cold start (`IntroSting`), once a
// session, never under reduced motion; the page under it is already whole.

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

const COMPANIES = [
  ["silver", "border-team-silver"],
  ["tangerine", "border-team-tangerine"],
  ["magenta", "border-team-magenta"],
  ["cyan", "border-team-cyan"],
  ["gold", "border-team-gold"],
  ["violet", "border-team-violet"],
  ["mint", "border-team-mint"],
] as const;

// The three poster objects: a colour, a tilt and a size each, as drawn. Decoration with real titles.
const POSTERS = [
  ["poster1", "bg-team-tangerine -rotate-6 w-[28%] md:w-[9.375rem]"],
  ["poster2", "bg-team-cyan rotate-3 w-[32%] md:w-[10.625rem]"],
  ["poster3", "bg-team-mint -rotate-2 w-[28%] md:w-[9.375rem]"],
] as const;

const section = "mx-auto w-full max-w-[80rem] px-5 md:px-14";
const h2 = "font-display text-[1.75rem] leading-[1.4] font-extrabold text-fg-heading md:text-[2.5rem]";
const card = "rounded-card border border-edge bg-surface";

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <>
      <IntroSting />

      <section id="hero" className={`${section} flex flex-col gap-10 pt-8 pb-12 md:flex-row md:items-center md:pt-14 md:pb-20`}>
        <div className="flex flex-1 flex-col gap-4">
          <p className="text-caption font-bold text-accent">{t("hero.eyebrow")}</p>
          <h1 className="max-w-[12ch] font-display text-[2.75rem] leading-[1.25] font-extrabold text-fg-heading md:text-[4.5rem] md:leading-[1.2]">
            {t("hero.headline")}
          </h1>
          <p className="max-w-[32.5rem] text-body-lg text-fg-muted md:text-[1.25rem]">{t("hero.sub")}</p>
        </div>
        <ul aria-label={t("hero.postersLabel")} className="flex shrink-0 items-center justify-center gap-2.5 md:w-[32.5rem]">
          {POSTERS.map(([key, look]) => (
            <li
              key={key}
              className={`flex aspect-[3/4] rounded-[0.875rem] p-3.5 font-display text-[1rem] leading-[1.4] font-extrabold text-on-team shadow-lg md:text-[1.125rem] ${look}`}
            >
              {t(`hero.${key}`)}
            </li>
          ))}
        </ul>
      </section>

      <ul aria-label={t("companies.label")} className={`${section} flex flex-wrap justify-center gap-x-7 gap-y-3 pb-12 md:pb-14`}>
        {COMPANIES.map(([key, ring]) => (
          <li key={key} className="inline-flex items-center gap-2 text-body-sm font-bold text-fg-muted">
            <span aria-hidden="true" className={`size-7 rounded-pill border-[3px] bg-canvas ${ring}`} />
            {t(`companies.${key}`)}
          </li>
        ))}
      </ul>

      <section id="about" className={`${section} flex scroll-mt-6 flex-col gap-4 py-10 md:flex-row md:items-start md:gap-10`}>
        <h2 className={`${h2} md:w-[23.75rem] md:shrink-0`}>{t("about.title")}</h2>
        <p className="max-w-[40rem] text-body-lg text-fg-muted">{t("about.body")}</p>
      </section>

      <section id="platform" className={`${section} py-10`}>
        <h2 className={h2}>{t("platform.title")}</h2>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {([1, 2, 3, 4] as const).map((n) => (
            <li key={n} className={`${card} p-[1.125rem]`}>
              <h3 className="font-display text-[1.125rem] leading-[1.4] font-extrabold text-fg-heading">{t(`platform.feature${n}Title`)}</h3>
              <p className="mt-1 text-body-sm text-fg-muted">{t(`platform.feature${n}Body`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="how" className={`${section} scroll-mt-6 pt-10 pb-14`}>
        <h2 className={h2}>{t("how.title")}</h2>
        <div className="mt-5 grid gap-6 md:grid-cols-2">
          {(["provider", "attendee"] as const).map((path) => (
            <div key={path} className={`${card} rounded-panel p-[1.375rem]`}>
              <h3 className={`text-caption font-bold ${path === "provider" ? "text-signal" : "text-team-cyan"}`}>{t(`how.${path}.title`)}</h3>
              <ol className="mt-3 grid gap-[1.125rem] sm:grid-cols-3">
                {([1, 2, 3] as const).map((n) => (
                  <li key={n} className="flex flex-col gap-1">
                    <span aria-hidden="true" className="font-display text-[1.875rem] leading-none font-extrabold text-accent">
                      {n}
                    </span>
                    <span className="text-body-sm font-bold text-fg-heading">{t(`how.${path}.step${n}Title`)}</span>
                    <span className="text-caption text-fg-muted">{t(`how.${path}.step${n}Body`)}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

    </>
  );
}
