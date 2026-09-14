"use client";

import { useId, useMemo, useRef, useState } from "react";

// `scoring.md`'s carried-over item (console.md, story order item 2): SCR-053's
// manual-adjustment form took a raw UUID typed into a text field, with "no
// member picker or search here" flagged as a real gap for whoever built
// `/app/admin/members` next. This is that picker — a plain client-side
// filter over the org's own member list (an internal event platform's
// roster is small enough that fetching it once beats a live search
// endpoint for a form nobody fills out more than a few times a day), a UI
// change on `saveManualAdjustment`'s existing `formData.get("memberId")`
// contract, not a new RPC.

export interface PickableMember {
  id: string;
  displayName: string | null;
  email: string;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

export function MemberPicker({
  members,
  name,
  label,
  required,
  placeholder,
  noMatches,
}: {
  members: PickableMember[];
  name: string;
  label: string;
  required?: boolean;
  placeholder: string;
  noMatches: string;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [open, setOpen] = useState(false);
  const listboxId = useId();
  const inputId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = normalize(query);
    if (!q) return members.slice(0, 8);
    return members.filter((m) => normalize(m.displayName ?? "").includes(q) || normalize(m.email).includes(q)).slice(0, 8);
  }, [members, query]);

  function select(m: PickableMember) {
    setSelectedId(m.id);
    setQuery(m.displayName ?? m.email);
    setOpen(false);
  }

  function onInputChange(v: string) {
    setQuery(v);
    setSelectedId("");
    setOpen(true);
  }

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <label htmlFor={inputId} className="text-label text-fg-heading">
        {label}
      </label>
      <input type="hidden" name={name} value={selectedId} required={required} />
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        value={query}
        onChange={(e) => onInputChange(e.target.value)}
        onFocus={() => setOpen(true)}
        dir="ltr"
        className="mt-1 block h-11 w-full rounded-field border border-edge-strong bg-canvas px-3 text-start text-body text-fg-heading"
      />
      {open ? (
        <ul id={listboxId} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-field border border-edge-strong bg-canvas shadow-lg">
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-body-sm text-fg-muted">{noMatches}</li>
          ) : (
            matches.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={m.id === selectedId}
                  onClick={() => select(m)}
                  className="block w-full px-3 py-2 text-start text-body-sm text-fg-heading hover:bg-silver-100"
                >
                  <bdi>{m.displayName ?? m.email}</bdi>
                  {m.displayName ? (
                    <span className="ms-2 text-fg-muted" dir="ltr">
                      {m.email}
                    </span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
