import { useTranslations } from "next-intl";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  const t = useTranslations("notFound");

  return (
    <section className="flex min-h-[70svh] items-center">
      <div className="mx-auto w-full max-w-[80rem] px-5 py-24 md:px-14">
        <p className="text-caption font-bold text-accent">404</p>
        <h1 className="mt-3 font-display text-[2.5rem] leading-[1.4] font-extrabold text-fg-heading">{t("title")}</h1>
        <ButtonLink href="/" className="mt-8">
          {t("cta")}
        </ButtonLink>
      </div>
    </section>
  );
}
