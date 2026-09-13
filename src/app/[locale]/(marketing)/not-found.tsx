import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("notFound");

  return (
    <section className="theme-dark flex min-h-[70svh] items-center">
      <div className="mx-auto max-w-6xl px-6 py-32 md:px-8">
        <p className="text-eyebrow text-fg-muted">404</p>
        <h1 className="mt-3 text-h1">{t("title")}</h1>
        <Link
          href="/"
          className="mt-8 inline-flex h-12 items-center rounded-field bg-white px-7 text-label text-navy-950 transition-colors duration-150 hover:bg-silver-200"
        >
          {t("cta")}
        </Link>
      </div>
    </section>
  );
}
