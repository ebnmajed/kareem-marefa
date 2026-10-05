"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CheckIcon, SettingsIcon } from "@/components/ui/icons";

// The event page's edit mode — the owner's ruling (2026-10-06): «if a user is an admin and are on the session's page
// they see the editable fields. I want there to be a button to edit to show the editing of the fields and settings
// then save then they see it as any normal member».
//
// ★ READ MODE IS THE MEMBER'S PAGE. Staff and a session's presenters open the event page as a member sees it; one
// «تعديل» reveals, in place, what only they may change — a material's settings and re-scope, the uploader, the task
// form, a hidden photograph and its restore, a comment's removal, the poster's stale note. «تم» puts the page back.
// Each form keeps its own save (its server action); leaving edit mode writes nothing and discards nothing that was
// saved. Nothing here is a permission: every control hidden in read mode is still refused by its DAL and RLS to a
// viewer who may not use it — this only decides WHEN an allowed viewer sees it.
//
// ★ THE MODE IS IN THE URL AS WELL (`?edit=1`), so a reload keeps it and a link can open the page in it. The page
// reads it on the server only for a viewer who may edit; the button keeps the address in step with `replaceState`.
//
// ★ OUTSIDE A PROVIDER, `EditOnly` SHOWS ITS CHILDREN. The slots are rendered by the event page alone, inside the
// provider; a slot rendered on its own (a component test, a future surface) keeps the behaviour it had before the
// mode existed, which is the failure that loses nothing.

interface EditModeValue {
  editing: boolean;
  setEditing: (next: boolean) => void;
}

const EditModeContext = createContext<EditModeValue | null>(null);

/** The mode, or `null` outside a provider. */
export function useEditMode(): EditModeValue | null {
  return useContext(EditModeContext);
}

/** True where edit-only content may render: in edit mode, or outside any provider. */
export function useShowsEditOnly(): boolean {
  const mode = useContext(EditModeContext);
  return mode === null ? true : mode.editing;
}

export function EditModeProvider({ initialEditing = false, children }: { initialEditing?: boolean; children: ReactNode }) {
  const [editing, setEditingState] = useState(initialEditing);
  const setEditing = useCallback((next: boolean) => {
    setEditingState(next);
    try {
      const url = new URL(window.location.href);
      if (next) url.searchParams.set("edit", "1");
      else url.searchParams.delete("edit");
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // The address is a convenience; the mode itself is the state above.
    }
  }, []);
  const value = useMemo(() => ({ editing, setEditing }), [editing, setEditing]);
  return <EditModeContext.Provider value={value}>{children}</EditModeContext.Provider>;
}

/** Renders its children only in edit mode (or outside a provider). Server children cross the boundary as-is. */
export function EditOnly({ children }: { children: ReactNode }) {
  return useShowsEditOnly() ? <>{children}</> : null;
}

/** The one toggle: «تعديل» in read mode, «تم» in edit mode. Its name says what pressing it does. */
export function EditModeToggle({ editLabel, doneLabel, editingStatus, readingStatus }: { editLabel: string; doneLabel: string; editingStatus: string; readingStatus: string }) {
  const mode = useContext(EditModeContext);
  // Announced after a press only — never on load, where the button already says which mode this is.
  const [announced, setAnnounced] = useState("");
  if (!mode) return null;
  const { editing, setEditing } = mode;
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="md"
        data-edit-mode-toggle=""
        iconStart={editing ? <CheckIcon /> : <SettingsIcon />}
        onClick={() => {
          const next = !editing;
          setEditing(next);
          setAnnounced(next ? editingStatus : readingStatus);
        }}
      >
        {editing ? doneLabel : editLabel}
      </Button>
      <span role="status" className="sr-only">
        {announced}
      </span>
    </>
  );
}
