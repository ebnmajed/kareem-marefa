import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { RegistrationForm } from "@/components/registration-form";
import { FormToken } from "@/components/form-token";

// SCR-001 · «سجّل اهتمامك» — REQ-UIX-114, REQ-NFR-019, DEC-247, DEC-252.
// Rebuilt in wave 26 from `docs/design/screens/m13/Register.dc.html`: the title and its line, the form, and at
// the foot the way into the platform for someone who already has an account. The header is the layout's.
//
// ★★ WHAT THE FORM DOES IS NOT THIS WAVE'S TO CHANGE (REQ-NFR-019, DEC-247 §3). «The same fields and interest
// choice as today, on the playground» (`M13.md` §001) — so the artboard's «الشركة» field and its third choice
// «كلاهما» are NOT built: the form posts what it posted, to the action it posted to, under the names and ids it
// had, with the same validation and the same no-JS path. `registration-form.tsx` changed classes only, and
// `tests/e2e/wave26-lead-register-behaviour.spec.ts` holds it to `main`'s recorded behaviour, state by state.
//
// This page renders dynamically: <FormToken/> calls `await connection()` so each visitor gets a fresh signed
// timestamp. The landing page stays static.
export default async function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <div className="mx-auto flex w-full max-w-[27.5rem] flex-col px-5 pt-6 pb-10 md:pt-10">
      <h1 className="font-display text-[2rem] leading-[1.4] font-extrabold text-fg-heading">{t("register.title")}</h1>
      <p className="mb-6 text-body-sm text-fg-muted">{t("register.intro")}</p>

      <RegistrationForm token={<FormToken />} />

      <p className="mt-10 text-center text-caption text-fg-muted">
        {t("hero.live")}{" "}
        <Link href="/sign-in" locale="ar" hrefLang="ar" className="inline-flex min-h-11 items-center font-bold text-accent underline-offset-4 hover:underline">
          {t("hero.signIn")}
        </Link>
      </p>
    </div>
  );
}
