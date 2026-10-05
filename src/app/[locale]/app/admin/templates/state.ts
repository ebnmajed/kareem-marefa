// SCR-055 — the library's action state. A "use server" module may
// export async functions and nothing else, so the shape lives here.

export type TemplateActionKind = "duplicated" | "created" | "published" | "defaultSet" | "renamed" | "retired" | "restored";

export type TemplateActionState =
  | { status: "idle" }
  | { status: "ok"; kind: TemplateActionKind; at: number }
  /** A field the form can point at — the name, the only thing typed. */
  | { status: "invalid_field"; field: "name"; error: "nameRequired" | "nameTooLong"; at: number }
  | { status: "invalid"; at: number }
  | { status: "not_authorized"; at: number }
  /** wave 27 (DEC-255 D6): the database refused to retire the org's last live template of a family issuance or the
   *  automatic poster falls back on. The toast says so in one line. */
  | { status: "last_template"; at: number };

export const initialTemplateActionState: TemplateActionState = { status: "idle" };
