"use client";

import { useTranslations } from "next-intl";

// SCR-057's dynamic-field list — REQ-DSG-006.
//
// Every binding the document names, with the value it resolved to. The panel
// exists so that an unbound field is a fact the admin reads BEFORE exporting,
// not a white rectangle they discover on 200 printed posters. The canvas
// marks it too; this says which one and why.

export interface BindingsPanelProps {
  declared: string[];
  values: Record<string, string>;
  /** The template's own fallback per binding, when it declares one. An
   *  unbound field whose template ships a fallback still PRINTS something,
   *  and a panel that says only «unbound» beside a canvas showing text
   *  reads as a contradiction — found by looking at the 390 px capture. */
  fallbacks?: Record<string, string>;
}

export function BindingsPanel({ declared, values, fallbacks = {} }: BindingsPanelProps) {
  const t = useTranslations("designer.bindings");
  // `brand.*` resolves from the platform theme and is never interesting here;
  // the fields an admin can get wrong are the data ones.
  const fields = declared.filter((b) => !b.startsWith("brand."));

  if (fields.length === 0) return <p className="text-body-sm text-fg-muted">{t("empty")}</p>;

  const anyUnbound = fields.some((b) => !values[b]);

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {fields.map((binding) => {
          const value = values[binding];
          return (
            <li key={binding} className="rounded-field border border-edge px-3 py-2">
              <p className="text-body-sm text-fg-muted">
                <bdi dir="ltr">{binding}</bdi>
              </p>
              {value ? (
                <p className="text-body-sm text-fg-heading">
                  <bdi>{value}</bdi>
                </p>
              ) : fallbacks[binding] ? (
                <p className="text-body-sm text-fg-heading">
                  {t.rich("unboundWithFallback", { fallback: fallbacks[binding] as string, bdi: (c) => <bdi>{c}</bdi> })}
                </p>
              ) : (
                <p className="text-body-sm text-fg-heading">{t("unbound")}</p>
              )}
            </li>
          );
        })}
      </ul>
      {anyUnbound ? <p className="text-body-sm text-fg-muted">{t("unboundHint")}</p> : null}
    </div>
  );
}
