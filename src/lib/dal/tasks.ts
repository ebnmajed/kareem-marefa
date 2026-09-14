import "server-only";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";
import { listMaterials } from "@/lib/dal/materials";

// Pre-session tasks — REQ-TSK-001 … REQ-TSK-005, 02 §4.15, 03 §5.5b/§5.6b.
//
// REQ-TSK-002 is the invariant that makes this module simple: tasks are
// reminder-only. Nothing here ever touches check-in, RSVP, or the scoring
// catalogue — `session_tasks`/`task_completions`/`task_form_responses` are
// plain RLS-gated tables with no RPC layer at all (unlike materials/photos,
// there is no constraint here that a client write could violate structurally,
// so `p8_presenter_write`/`p3_self_*` are the entire authority).

export const taskKindSchema = z.enum(["read_material", "form", "checklist", "external"]);
export type TaskKind = z.infer<typeof taskKindSchema>;

export interface FormField {
  id: string;
  label: string;
  type: "text" | "textarea";
}

export interface TaskSummary {
  id: string;
  kind: TaskKind;
  title: string;
  description: string | null;
  materialId: string | null;
  formSchema: FormField[] | null;
  externalUrl: string | null;
  sortOrder: number;
  /** REQ-TSK-004 — this viewer's own completion; self-declared for checklist/external, set
   *  automatically on submission for `form` (submitTaskFormResponse writes both rows). */
  completed: boolean;
  /** Present only for `kind = 'form'` and only this viewer's own prior answer, if any. */
  myFormResponse: Record<string, string> | null;
}

export interface TasksPageData {
  tasks: TaskSummary[];
  /** REQ-TSK-001's authoring side — a presenter of this session, or an admin. */
  canManage: boolean;
  numerals: "western" | "arabic_indic";
  /** For the `canManage` create-task form's `read_material` picker only — {id, title} pairs. */
  materials: { id: string; title: string }[];
}

function toFormSchema(raw: unknown): FormField[] | null {
  if (!Array.isArray(raw)) return null;
  const fields: FormField[] = [];
  for (const f of raw) {
    if (f && typeof f === "object" && typeof (f as FormField).id === "string" && typeof (f as FormField).label === "string") {
      fields.push({ id: (f as FormField).id, label: (f as FormField).label, type: (f as FormField).type === "textarea" ? "textarea" : "text" });
    }
  }
  return fields;
}

/** The event page's `Tasks` slot data — REQ-TSK-004: "progress is visible on the event page." */
export async function getTasksPageData(locale: string, sessionId: string): Promise<TasksPageData> {
  if (!z.uuid().safeParse(sessionId).success) return { tasks: [], canManage: false, numerals: "western", materials: [] };
  const { session, supabase } = await sessionClient(locale);

  const [{ data: taskRows, error }, { data: presenterRow }, { data: settings }, materialList] = await Promise.all([
    supabase.from("session_tasks").select("id, kind, title, description, material_id, form_schema, external_url, sort_order").eq("session_id", sessionId).order("sort_order", { ascending: true }),
    supabase.from("session_presenters").select("member_id").eq("session_id", sessionId).eq("member_id", session.memberId).eq("accepted", true).maybeSingle(),
    supabase.from("org_settings").select("numerals").eq("org_id", session.orgId).maybeSingle(),
    listMaterials(locale, sessionId),
  ]);
  if (error) throw new Error(`session_tasks: ${error.message}`);

  const taskIds = (taskRows ?? []).map((t) => t.id as string);
  const [{ data: completionRows }, { data: responseRows }] =
    taskIds.length === 0
      ? [{ data: [] }, { data: [] }]
      : await Promise.all([
          supabase.from("task_completions").select("task_id").eq("member_id", session.memberId).in("task_id", taskIds),
          supabase.from("task_form_responses").select("task_id, response").eq("member_id", session.memberId).in("task_id", taskIds),
        ]);

  const completedTaskIds = new Set((completionRows ?? []).map((r) => r.task_id as string));
  const responseByTask = new Map((responseRows ?? []).map((r) => [r.task_id as string, r.response as Record<string, string>]));

  const tasks: TaskSummary[] = (taskRows ?? []).map((t) => ({
    id: t.id as string,
    kind: t.kind as TaskKind,
    title: t.title as string,
    description: (t.description as string | null) ?? null,
    materialId: (t.material_id as string | null) ?? null,
    formSchema: toFormSchema(t.form_schema),
    externalUrl: (t.external_url as string | null) ?? null,
    sortOrder: t.sort_order as number,
    completed: completedTaskIds.has(t.id as string),
    myFormResponse: responseByTask.get(t.id as string) ?? null,
  }));

  return {
    tasks,
    canManage: session.role === "admin" || !!presenterRow,
    numerals: (settings?.numerals as "western" | "arabic_indic" | undefined) ?? "western",
    materials: materialList.map((m) => ({ id: m.id, title: m.title })),
  };
}

const createTaskInput = z
  .object({
    sessionId: z.uuid(),
    kind: taskKindSchema,
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional(),
    materialId: z.uuid().optional(),
    // One question label per line from the presenter's own textarea (REQ-TSK-001's acceptance
    // asks only for "a matching affordance," not a schema-authoring UI) — every field renders as
    // plain text; `id` is derived (`q1`, `q2`, …) rather than authored.
    formQuestions: z.array(z.string().trim().min(1).max(200)).min(1).max(20).optional(),
    externalUrl: z.url().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.kind === "read_material" && !val.materialId) ctx.addIssue({ code: "custom", message: "materialId is required for read_material", path: ["materialId"] });
    if (val.kind === "form" && !val.formQuestions) ctx.addIssue({ code: "custom", message: "formQuestions is required for form", path: ["formQuestions"] });
    if (val.kind === "external" && !val.externalUrl) ctx.addIssue({ code: "custom", message: "externalUrl is required for external", path: ["externalUrl"] });
  });
export type CreateTaskInput = z.infer<typeof createTaskInput>;

/** REQ-TSK-001 — `p8_presenter_write` (0037) is the authority; a member who is neither the
 *  session's presenter nor an org admin is refused `42501` by the insert itself. */
export async function createTask(locale: string, input: CreateTaskInput): Promise<string> {
  const parsed = createTaskInput.parse(input);
  const { session, supabase } = await sessionClient(locale);
  const formSchema: FormField[] | null =
    parsed.kind === "form" ? parsed.formQuestions!.map((label, i): FormField => ({ id: `q${i + 1}`, label, type: "text" })) : null;
  const { data, error } = await supabase
    .from("session_tasks")
    .insert({
      org_id: session.orgId,
      session_id: parsed.sessionId,
      kind: parsed.kind,
      title: parsed.title,
      description: parsed.description ?? null,
      material_id: parsed.kind === "read_material" ? parsed.materialId : null,
      form_schema: formSchema,
      external_url: parsed.kind === "external" ? parsed.externalUrl : null,
    })
    .select("id")
    .single();
  if (error) throw new Error(mapTaskError(error));
  return data.id as string;
}

function mapTaskError(error: { code?: string; message: string }): string {
  if (error.code === "42501") return "not_authorized";
  return `session_tasks: ${error.message}`;
}

const toggleInput = z.object({ taskId: z.uuid(), completed: z.boolean() });

/** REQ-TSK-004: self-declared, for checklist/external (and, as a plain "mark done" toggle, for
 *  read_material too — REQ-TSK-001's acceptance only asks for a matching affordance per kind, not
 *  a specific detection mechanism, and there is no read-receipt tracking in this product to
 *  auto-detect it). `form` tasks are marked complete by `submitTaskFormResponse` instead — this
 *  function is never called for them from the UI, though nothing stops a client from calling it,
 *  since REQ-TSK-002 makes a task's completion state inconsequential either way (no check-in path
 *  and no scoring rule ever reads it). */
export async function toggleTaskCompletion(locale: string, input: z.infer<typeof toggleInput>): Promise<boolean> {
  const { taskId, completed } = toggleInput.parse(input);
  const { session, supabase } = await sessionClient(locale);
  if (completed) {
    const { error } = await supabase.from("task_completions").upsert({ org_id: session.orgId, task_id: taskId, member_id: session.memberId }, { onConflict: "task_id,member_id" });
    if (error) throw new Error(`task_completions: ${error.message}`);
  } else {
    const { error } = await supabase.from("task_completions").delete().eq("task_id", taskId).eq("member_id", session.memberId);
    if (error) throw new Error(`task_completions: ${error.message}`);
  }
  return true;
}

const submitFormInput = z.object({ taskId: z.uuid(), response: z.record(z.string(), z.string().max(5000)) });

/** REQ-TSK-003: the response is stored (visible to the session's presenters and to admins,
 *  `responses_read`, 03 §5.5b) and, in the same call, marks the task complete for REQ-TSK-004's
 *  progress view — a form task's completion IS having answered it. */
export async function submitTaskFormResponse(locale: string, input: z.infer<typeof submitFormInput>): Promise<boolean> {
  const { taskId, response } = submitFormInput.parse(input);
  const { session, supabase } = await sessionClient(locale);

  const { error: responseError } = await supabase
    .from("task_form_responses")
    .upsert({ org_id: session.orgId, task_id: taskId, member_id: session.memberId, response, updated_at: new Date().toISOString() }, { onConflict: "task_id,member_id" });
  if (responseError) throw new Error(`task_form_responses: ${responseError.message}`);

  const { error: completionError } = await supabase
    .from("task_completions")
    .upsert({ org_id: session.orgId, task_id: taskId, member_id: session.memberId }, { onConflict: "task_id,member_id" });
  if (completionError) throw new Error(`task_completions: ${completionError.message}`);

  return true;
}
