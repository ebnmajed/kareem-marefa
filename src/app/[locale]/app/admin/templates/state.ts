// SCR-055 · SCR-056 — the libraries' action state. A "use server" module may
// export async functions and nothing else, so the shape lives here.

export type TemplateActionKind = "duplicated" | "created" | "published" | "defaultSet" | "renamed" | "retired" | "restored";

export type TemplateActionState =
  | { status: "idle" }
  | { status: "ok"; kind: TemplateActionKind; at: number }
  /** A field the form can point at — the name, the only thing typed. */
  | { status: "invalid_field"; field: "name"; error: "nameRequired" | "nameTooLong"; at: number }
  | { status: "invalid"; at: number }
  | { status: "not_authorized"; at: number };

export const initialTemplateActionState: TemplateActionState = { status: "idle" };
