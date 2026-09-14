// SCR-011's loading skeleton (09 §4 "loading skeletons"). No text, no
// locale-dependent content — a skeleton is shown before `setRequestLocale`
// runs for the real page, so it must not call `getTranslations`.
export default function BrowseSessionsLoading() {
  return (
    <div aria-hidden="true">
      <div className="h-8 w-48 animate-pulse rounded-field bg-silver-100" />
      <div className="mt-3 h-4 w-72 max-w-full animate-pulse rounded-field bg-silver-100" />
      <div className="mt-8 flex flex-col gap-8 md:flex-row md:items-start">
        <div className="hidden h-64 rounded-field bg-silver-100 md:block md:w-72 md:shrink-0" />
        <ul className="grid min-w-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="h-52 animate-pulse rounded-field border border-edge bg-silver-100" />
          ))}
        </ul>
      </div>
    </div>
  );
}
