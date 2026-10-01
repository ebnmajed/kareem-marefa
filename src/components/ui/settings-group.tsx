"use client";

import { useActionState, useId, useRef, useState } from "react";
import type { SettingsActionRow, SettingsGroupProps, SettingsLinkRow, SettingsSwitchRow } from "@/components/ui";
import { ChevronIcon } from "@/components/ui/icons";
import { Link } from "@/components/ui/link";
import { Switch } from "@/components/ui/switch";

// The settings group — `REQ-UIX-081`, `M10c.md` §6b, `Settings.dc.html`, `Calendar.dc.html`; `DEC-216` §2.1, `DEC-218` §2.
//
// A titled list card of rows, each a switch, a link or a control the screen composes. It reads no data and no
// catalogue: every string is a prop. It replaces `preference-matrix`, which drew a category × channel grid.
//
// ★★ A SWITCH ROW SAVES ON CHANGE, AND IS AN ORDINARY FORM WITHOUT JAVASCRIPT. The form's action is
// `useActionState`'s dispatch over the screen's bound `"use server"` export, passed straight to `<form action>` — so
// React renders the server action's progressive-enhancement fields and a `<noscript>` submit posts it with no script
// at all (the matrix worked without JS; this keeps it). With JS, a change submits the form at once. The switch
// follows the member's hand while the save runs, and the server's answer is the truth after it: a refused save comes
// back as the old value and `failed`, and the switch returns to it with the reason beside it. No timer, no nudge
// (`DEC-146`); a pending save is not disabled, because Server Actions already queue per client.
//
// The label leads and the switch sits at the inline-end, as both artboards draw it. `ui/switch` is composed as it is:
// its own label is reversed by the wrapper's class, never by editing the primitive.

export function SettingsGroup({ title, showTitle = true, headingLevel = "h2", rows, className = "" }: SettingsGroupProps) {
  const titleId = useId();
  const Heading = headingLevel;
  return (
    <section aria-labelledby={titleId} data-slot="settings-group" className={`flex flex-col gap-2 ${className}`}>
      <Heading id={titleId} className={showTitle ? "px-1 text-body-sm font-bold text-fg-muted" : "sr-only"}>
        {title}
      </Heading>
      <ul className="flex flex-col divide-y divide-edge rounded-panel border border-edge bg-surface px-2.5">
        {rows.map((row) => (
          <li key={row.id} data-row={row.kind}>
            {row.kind === "switch" ? <SwitchRow row={row} /> : row.kind === "link" ? <LinkRow row={row} /> : <ActionRow row={row} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The label and, under it, the optional second line — shared by every kind. */
function Text({ label, detail }: { label: string; detail?: string | null }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col leading-[1.35]">
      <span className="text-label font-bold text-fg-heading">{label}</span>
      {detail ? (
        <span className="text-caption text-fg-muted">
          <bdi>{detail}</bdi>
        </span>
      ) : null}
    </span>
  );
}

function SwitchRow({ row }: { row: SettingsSwitchRow }) {
  const name = row.name ?? "enabled";
  const form = useRef<HTMLFormElement>(null);
  const [state, dispatch] = useActionState(row.action, { checked: row.checked, failed: false });

  // What the switch shows: the member's hand while a save runs, the server's answer after it. A new state object is a
  // new answer — adopted once, during render («storing information from previous renders», React's own pattern).
  const [shown, setShown] = useState(row.checked);
  const [answered, setAnswered] = useState(state);
  const [refusals, setRefusals] = useState(0);
  if (answered !== state) {
    setAnswered(state);
    setShown(state.checked);
    if (state.failed) setRefusals((n) => n + 1);
  }

  return (
    <form ref={form} action={dispatch} className="py-1">
      {Object.entries(row.hidden ?? {}).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <div className="flex items-center gap-3">
        <Switch
          name={name}
          label={row.label}
          description={row.detail ?? undefined}
          checked={shown}
          disabled={row.disabled}
          onCheckedChange={(next) => {
            setShown(next);
            form.current?.requestSubmit();
          }}
          // The label at the inline-start, the track at the inline-end (`Settings.dc.html`); the description under the
          // label rather than under the track.
          className="min-w-0 flex-1 [&>label]:flex-row-reverse [&>label]:justify-between [&>p]:ps-0"
        />
        <noscript>
          <button type="submit" className="min-h-11 rounded-pill border border-edge px-3 text-label text-fg-heading">
            {row.saveLabel}
          </button>
        </noscript>
      </div>
      {/* ★ Keyed by the refusal's count, so a second refusal in a row is a new alert and is announced again. */}
      {state.failed ? (
        <p key={refusals} role="alert" className="pb-2 text-caption text-error">
          {row.errorLabel}
        </p>
      ) : null}
    </form>
  );
}

function LinkRow({ row }: { row: SettingsLinkRow }) {
  const inner = (
    <>
      <Text label={row.label} detail={row.detail} />
      {row.value ? <span className="shrink-0 text-body-sm text-fg-muted">{row.value}</span> : null}
      <ChevronIcon direction="forward" className="shrink-0 text-fg-muted" />
    </>
  );
  const rowClass = "flex min-h-11 items-center gap-3 px-1 py-3";
  return row.external ? (
    // A Route Handler or another origin: never client-navigated into.
    <a href={row.href} className={rowClass}>
      {inner}
    </a>
  ) : (
    <Link href={row.href} className={rowClass}>
      {inner}
    </Link>
  );
}

function ActionRow({ row }: { row: SettingsActionRow }) {
  return (
    <div className="flex min-h-11 items-center gap-3 px-1 py-3">
      <Text label={row.label} detail={row.detail} />
      {row.value ? <span className="shrink-0 text-body-sm text-fg-muted">{row.value}</span> : null}
      <div className="shrink-0">{row.control}</div>
    </div>
  );
}
