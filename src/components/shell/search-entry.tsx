import { getTranslations } from "next-intl/server";
import { SearchIcon } from "@/components/ui/icons";

// Search in the bar — `16` §6.1 note 1, REQ-UIX-002, REQ-DSC-003.
//
// ★ THE FIRST TIME SEARCH IS REACHABLE WITHOUT TYPING A URL. `searchSessions()`
// has existed since M5 with Arabic normalisation and a `tsvector`, and the
// shell has never had a way in. A product whose core object is a searchable
// session had no search anywhere in its navigation.
//
// It is a `<form method="get">` targeting SCR-011, which is the whole
// implementation on this side: browse already reads `q` from the URL. No
// JavaScript, no client component, no debounce — the instant-results sheet of
// §6.1 note 1 is M10, with browse itself. What lands in M9 is the entry point,
// and it works with JavaScript off.
//
// On a phone the field would eat the header, so the icon is a LINK to browse's
// own search field rather than a collapsed input: a tap that lands on a real,
// focusable field beats a tap that toggles a field the member then has to find.

export async function SearchEntry({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "app.shell" });
  return (
    <>
      {/* Desktop: the field itself. */}
      <form action={`/${locale}/app/sessions`} method="get" role="search" className="hidden min-w-0 flex-1 md:flex">
        <label htmlFor="shell-search" className="sr-only">
          {t("searchLabel")}
        </label>
        <div className="relative flex w-full max-w-lg items-center">
          <SearchIcon aria-hidden className="pointer-events-none absolute inset-inline-start-3 text-fg-muted" />
          {/* ui-lint-disable-next-line field — the shell's search has no <Field>: it is one control with a visually hidden label, not a form row */}
          <input
            id="shell-search"
            type="search"
            name="q"
            placeholder={t("searchPlaceholder")}
            className="h-11 w-full rounded-field border border-edge-strong bg-canvas ps-10 pe-3 text-body text-fg-body placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          />
        </div>
      </form>

      {/* Phone: a link to the real field, not a toggle. */}
      <a
        href={`/${locale}/app/sessions#shell-search`}
        aria-label={t("searchLabel")}
        className="inline-flex h-11 w-11 items-center justify-center rounded-field text-fg-heading hover:bg-silver-100 md:hidden"
      >
        <SearchIcon aria-hidden className="text-[1.25rem]" />
      </a>
    </>
  );
}
