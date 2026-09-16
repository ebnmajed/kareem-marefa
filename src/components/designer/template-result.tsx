import { getTranslations } from "next-intl/server";
import { formatNumber } from "@/components/sessions/numerals";

// The outcome banner for SCR-055/056. A separate component because both
// screens render it and because a redirect's query string is the only channel
// a Server Action has back to the page.
//
// The `notAuthorized` case is the interesting one: it is what an org admin
// sees if they somehow aim a write at a platform template, and it says BOTH
// halves of the rule — this is an admin's act, and platform templates are not
// edited here — rather than a bare "forbidden" that leaves them guessing
// which half they hit.

const DONE = ["duplicated", "created", "published", "defaultSet", "renamed", "retired", "restored"] as const;
const ERROR = ["not_authorized", "invalid"] as const;

export async function TemplateResult({
  done,
  error,
  version,
}: {
  done?: string;
  error?: string;
  version?: string;
}) {
  const t = await getTranslations("templates.result");

  if (error) {
    const key = (ERROR as readonly string[]).includes(error) ? error : "invalid";
    return (
      <p role="alert" className="mt-4 rounded-field border border-edge-strong p-3 text-body text-fg-heading">
        {key === "not_authorized" ? t("notAuthorized") : t.rich("invalid", { message: error, bdi: (c) => <bdi dir="ltr">{c}</bdi> })}
      </p>
    );
  }

  if (!done || !(DONE as readonly string[]).includes(done)) return null;

  const parsed = Number.parseInt(version ?? "", 10);
  return (
    <p role="status" className="mt-4 rounded-field border border-edge bg-silver-100 p-3 text-body text-fg-heading">
      {done === "published" && Number.isFinite(parsed)
        ? t.rich("published", { value: formatNumber(parsed), bdi: (c) => <bdi>{c}</bdi> })
        : t(done as "duplicated")}
    </p>
  );
}
