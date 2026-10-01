import { getTranslations } from "next-intl/server";
import { SearchIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";

// Search in the shell's top bar (REQ-UIX-054; DEC-205 §2: «search stays in the bar»).
//
//   · from `lg`, the field itself, 520 px, beside the wordmark — a plain GET form
//     to `/app/sessions`, so it works with no JavaScript and the result is a URL;
//   · below `lg`, a round control that leads to browse, where the field is in the
//     page (`SCR-011`'s artboard puts it there). A link to the real field, not a
//     toggle: nothing to open, nothing to close.
//
// The field is `ui/input`, never a hand-rolled control (`ui-lint`).
export async function SearchEntry({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "app.shell" });
  return (
    <>
      <form action={`/${locale}/app/sessions`} method="get" role="search" className="hidden w-[520px] max-w-full min-w-0 shrink lg:block">
        <label htmlFor="shell-search" className="sr-only">
          {t("searchLabel")}
        </label>
        <Input
          id="shell-search"
          type="search"
          name="q"
          placeholder={t("searchPlaceholder")}
          startIcon={<SearchIcon className="text-fg-muted" />}
          className="w-full"
        />
      </form>
      <span aria-hidden className="flex-1 lg:hidden" />
      <a
        href={`/${locale}/app/sessions#browse-search`}
        aria-label={t("searchLabel")}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-edge bg-surface text-fg-heading hover:bg-hover lg:hidden focus-visible:outline-[length:var(--focus-width)] focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
      >
        <SearchIcon aria-hidden className="text-[1.125rem]" />
      </a>
    </>
  );
}
