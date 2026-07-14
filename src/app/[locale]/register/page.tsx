import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { NetworkBg } from "@/components/network-bg";
import { SeamThread } from "@/components/ornaments";
import { RegistrationForm } from "@/components/registration-form";
import { FormToken } from "@/components/form-token";

/**
 * This page renders dynamically: <FormToken/> calls `await connection()` so
 * each visitor gets a fresh signed timestamp. The landing page stays static.
 */
export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("register");

  return (
    <>
      <section className="theme-dark relative overflow-hidden">
        <NetworkBg className="opacity-35" />
        <div className="relative mx-auto max-w-6xl px-6 pb-14 pt-28 md:px-8 md:pt-32">
          <Link
            href="/"
            className="text-caption text-fg-muted underline-offset-4 hover:underline"
          >
            {t("back")}
          </Link>
          <h1 className="mt-4 text-h1">{t("title")}</h1>
          <p className="mt-3 max-w-xl text-body-lg">{t("intro")}</p>
        </div>
      </section>

      <section className="relative bg-white">
        <SeamThread />
        <div className="mx-auto max-w-[40rem] px-6 py-16 md:px-0 md:py-20">
          <RegistrationForm token={<FormToken />} />
        </div>
      </section>
    </>
  );
}
