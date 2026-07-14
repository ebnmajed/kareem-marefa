import { useTranslations } from "next-intl";
import { Wordmark } from "@/components/wordmark";

export function Footer() {
  const t = useTranslations("footer");

  return (
    <footer className="theme-dark border-t border-edge !bg-navy-1000">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-16 md:px-8">
        <Wordmark variant="footer" />
        <p className="max-w-xl text-caption text-fg-muted">{t("privacy")}</p>
        <p className="text-caption text-silver-400/60">{t("internal")}</p>
      </div>
    </footer>
  );
}
