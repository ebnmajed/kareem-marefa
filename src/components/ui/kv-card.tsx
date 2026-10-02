import { useId } from "react";
import type { KvCardProps } from "@/components/ui";

// `sessions'` · the read-mode key/value card and its edit twin — REQ-UIX-085, REQ-UIX-089, DEC-NEXT-28.
//
// ★ A STUB, landed by the lead with its signature and registry entry (contract 2, `DEC-227`) so the gate stays green
// while `sessions` writes it to its plan (`notes/sessions.md` W21.2). Read mode is a `<dl>`; the edit twin is one
// `role="group"` per row and renders no `<form>` — the screen owns its forms. No animation.

export function KvCard({ title, headingLevel = 2, label, rows, mode = "read", emptyValue, actions, className = "" }: KvCardProps) {
  const id = useId();
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const titleId = `${id}-title`;
  return (
    <section
      data-slot="kv-card"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : label}
      className={`rounded-panel border border-edge bg-surface p-4 ${className}`}
    >
      {title ? (
        <Heading id={titleId} className={`mb-3 text-fg-heading ${headingLevel === 3 ? "text-h3" : "text-h2"}`}>
          {title}
        </Heading>
      ) : null}
      {mode === "edit" ? (
        <div className="divide-y divide-edge">
          {rows.map((row) =>
            row.edit ? (
              <div key={row.id} role="group" aria-labelledby={`${id}-${row.id}`} className="py-3">
                <p id={`${id}-${row.id}`} className="mb-2 text-label text-fg-muted">
                  {row.label}
                </p>
                {row.edit}
              </div>
            ) : (
              <dl key={row.id} className="grid gap-1 py-3 md:grid-cols-[12rem_1fr]">
                <dt className="text-label text-fg-muted">{row.label}</dt>
                <dd className="text-body text-fg-body">{row.value ?? emptyValue}</dd>
              </dl>
            ),
          )}
        </div>
      ) : (
        <dl className="divide-y divide-edge">
          {rows.map((row) => (
            <div key={row.id} className="grid gap-1 py-3 md:grid-cols-[12rem_1fr]">
              <dt className="text-label text-fg-muted">{row.label}</dt>
              <dd className="text-body text-fg-body">{row.value ?? emptyValue}</dd>
            </div>
          ))}
        </dl>
      )}
      {actions ? <div className="mt-4 flex flex-wrap gap-2">{actions}</div> : null}
    </section>
  );
}
