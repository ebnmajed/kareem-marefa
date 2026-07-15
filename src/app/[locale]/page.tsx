import { Fragment } from "react";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { NetworkBg } from "@/components/network-bg";
import { NetworkGL } from "@/components/network-gl";
import { IntroSting } from "@/components/intro-sting";
import { Chapter } from "@/components/chapter";
import { MobileCta } from "@/components/mobile-cta";
import { ButtonLink } from "@/components/ui/button";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

const STEPS: Record<string, string[]> = {
  ar: ["١", "٢", "٣"],
  en: ["1", "2", "3"],
};

/** Word-by-word focus pull — blur racks to sharp like a lens finding focus.
 * Splitting on spaces is safe for Arabic (joining is within-word only). */
function FocusHeadline({ text }: { text: string }) {
  return (
    <>
      {text.split(" ").map((word, i) => (
        <Fragment key={i}>
          {i > 0 ? " " : ""}
          <span
            className="focus-word"
            style={{ "--d": `${100 + i * 110}ms` } as React.CSSProperties}
          >
            {word}
          </span>
        </Fragment>
      ))}
    </>
  );
}

const delay = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const steps = STEPS[locale] ?? STEPS.en;

  return (
    <>
      <IntroSting />
      {/* timeline scrub indicator — grows with scroll, like a playhead */}
      <div
        aria-hidden="true"
        className="scroll-progress fixed inset-x-0 top-0 z-50 h-[2px] bg-silver-400/70"
      />

      {/* Hero — the constellation, and the single dot the spine descends from */}
      <section
        id="hero"
        className="theme-dark relative flex min-h-[92svh] items-center overflow-hidden"
      >
        <NetworkGL />
        <div aria-hidden="true" className="hero-fade absolute inset-0" />
        <div className="relative mx-auto w-full max-w-6xl px-6 pb-24 pt-32 md:px-8">
          <div className="max-w-[46rem]">
            <p className="hero-enter flex items-center gap-3 text-eyebrow text-fg-muted">
              <span aria-hidden="true" className="size-[5px] shrink-0 rounded-full bg-node" />
              {t("hero.eyebrow")}
            </p>
            <h1 className="mt-6 text-display">
              <FocusHeadline text={t("hero.headline")} />
            </h1>
            <p
              className="hero-enter mt-7 max-w-[34ch] text-statement text-fg-body"
              style={delay(560)}
            >
              {t("hero.sub")}
            </p>
            <div
              className="hero-enter mt-11 flex flex-wrap items-center gap-4"
              style={delay(680)}
            >
              <ButtonLink href="/register">{t("hero.cta")}</ButtonLink>
              <a
                href="#about"
                className="inline-flex h-12 items-center justify-center rounded-field border border-[var(--btn2-border)] px-7 text-label text-[var(--btn2-fg)] transition-colors duration-150 hover:border-[var(--btn2-border-hover)] hover:bg-[var(--btn2-bg-hover)] active:border-[var(--btn2-border-hover)] active:bg-[var(--btn2-bg-hover)]"
              >
                {t("hero.ctaSecondary")}
              </a>
            </div>
            <p
              className="hero-enter mt-5 text-caption text-fg-muted"
              style={delay(760)}
            >
              {t("hero.microTrust")}
            </p>
          </div>
        </div>
      </section>

      {/* 01 — The manifesto. The copy is the artwork here: set large, given
          room, and left to carry the section on its own. */}
      <section id="about" className="scroll-mt-24 bg-white">
        <Chapter n={1} locale={locale} pad="clamp(6rem, 13vw, 11rem)">
          <h2 className="reveal-cut text-chapter">{t("about.title")}</h2>
          <p className="reveal-cut mt-10 max-w-[58ch] text-statement text-fg-body">
            {t("about.body")}
          </p>
        </Chapter>
      </section>

      {/* 02 — The two paths, as a diptych split by a hairline. Each step is a
          node; the line between them draws as you arrive at it. */}
      <section className="cv-section bg-silver-100">
        <Chapter n={2} locale={locale} pad="clamp(4.5rem, 9vw, 8rem)">
          <h2 className="reveal-cut text-chapter">{t("how.title")}</h2>
          <div className="mt-14 grid gap-14 md:grid-cols-2 md:gap-0">
            {(["provider", "attendee"] as const).map((path, i) => (
              <div
                key={path}
                className={
                  i === 0
                    ? "md:pe-12 lg:pe-16"
                    : "md:border-s md:border-edge md:ps-12 lg:ps-16"
                }
              >
                <h3 className="reveal-cut text-h3">{t(`how.${path}.title`)}</h3>
                <ol className="mt-9">
                  {([1, 2, 3] as const).map((n) => (
                    <li key={n} className="flex gap-5">
                      <span className="step-rail flex flex-col items-center">
                        <span className="step-num flex size-10 shrink-0 items-center justify-center rounded-full border border-silver-300 bg-white text-caption font-medium text-navy-950">
                          {steps[n - 1]}
                        </span>
                        {n < 3 && (
                          <span
                            aria-hidden="true"
                            className="step-line mt-2 w-px flex-1 bg-spine"
                          />
                        )}
                      </span>
                      <div className={n < 3 ? "pb-10" : ""}>
                        <p className="text-label text-fg-heading">
                          {t(`how.${path}.step${n}Title`)}
                        </p>
                        <p className="mt-2 max-w-[44ch] text-body text-fg-body">
                          {t(`how.${path}.step${n}Body`)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </Chapter>
      </section>

      {/* 03 — Recognition. The emotional peak, and the line the whole page is
          built around. The network is drawn behind it rather than left a void. */}
      <section className="cv-section theme-dark relative overflow-clip">
        <NetworkBg className="draw-on-scroll opacity-[0.3]" />
        <Chapter
          n={3}
          locale={locale}
          pad="clamp(5.5rem, 12vw, 10rem)"
          className="relative"
        >
          <h2 className="reveal-cut text-chapter">{t("recognition.title")}</h2>
          <p className="reveal-cut mt-10 max-w-[54ch] text-statement">
            {t("recognition.body")}
          </p>
          <ul className="mt-16 grid border-y border-edge sm:grid-cols-3">
            {([1, 2, 3] as const).map((n, i) => (
              <li
                key={n}
                className={[
                  "reveal-cut flex items-start gap-4 py-7",
                  i > 0 && "border-t border-edge sm:border-t-0 sm:border-s sm:ps-8",
                  i < 2 && "sm:pe-8",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span
                  aria-hidden="true"
                  className="mt-[0.6em] size-[5px] shrink-0 rounded-full bg-node"
                />
                <p className="text-h3 font-medium text-fg-heading">
                  {t(`recognition.tile${n}`)}
                </p>
              </li>
            ))}
          </ul>
        </Chapter>
      </section>

      {/* 04 — The reassurance. Three qualifying criteria as an editorial
          definition list: term in the margin, plain language beside it. */}
      <section className="cv-section bg-white">
        <Chapter n={4} locale={locale} pad="clamp(4.5rem, 9vw, 8rem)">
          <h2 className="reveal-cut text-chapter">{t("policy.title")}</h2>
          <p className="reveal-cut mt-7 max-w-[62ch] text-body-lg text-fg-body">
            {t("policy.intro")}
          </p>
          <dl className="mt-12 border-t border-edge">
            {([1, 2, 3] as const).map((n) => (
              <div
                key={n}
                className="reveal-cut grid gap-2 border-b border-edge py-8 md:grid-cols-[minmax(9rem,13rem)_minmax(0,1fr)] md:gap-10 md:py-10"
              >
                <dt className="text-h3 text-fg-heading">
                  {t(`policy.card${n}Title`)}
                </dt>
                <dd className="max-w-[54ch] text-body-lg text-fg-body">
                  {t(`policy.card${n}Body`)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="reveal-cut mt-14 max-w-[42ch] text-statement font-medium text-fg-heading">
            {t("policy.closer")}
          </p>
        </Chapter>
      </section>

      {/* Close — the title card. The network draws itself in, and the tagline
          lands at full scale as an end credit. */}
      <section className="cv-section theme-dark relative overflow-clip">
        <NetworkBg className="draw-on-scroll opacity-40" />
        <div className="relative mx-auto max-w-6xl px-6 py-[clamp(6rem,13vw,11rem)] md:px-8">
          <div className="max-w-[34rem]">
            <h2 className="reveal-cut text-chapter">{t("finalCta.title")}</h2>
            <p className="reveal-cut mt-6 text-body-lg">{t("finalCta.body")}</p>
            <div className="mt-10">
              <ButtonLink href="/register">{t("finalCta.cta")}</ButtonLink>
            </div>
          </div>
          <div className="mt-[clamp(4rem,9vw,7rem)] border-t border-edge pt-[clamp(3rem,7vw,5.5rem)]">
            <p className="reveal-cut text-center text-mega">
              {t("finalCta.tagline")}
            </p>
          </div>
        </div>
      </section>

      <MobileCta />
    </>
  );
}
