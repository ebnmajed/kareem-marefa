import "server-only";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";

// The survey (REQ-SUR-001 … 009, DEC-160 §3). Everything here goes through one
// of five definer functions, because the survey's tables are readable by almost
// no client role: the six authoring tables are staff-select, and the register,
// the responses and the answers are selectable by NOBODY.
//
// ★ The one rule this module keeps, above the usual DAL rules: no function
// here ever puts an answer into an Error message, a log line or a redirect —
// a breadcrumb carrying a member and an answer is the pairing the whole design
// removes (DEC-160 §3.5). Refusals are mapped to message KEYS and nothing else.
//
// The screens: SCR-065 (`/app/admin/surveys`), SCR-064
// (`/app/admin/sessions/[id]/survey`) and the survey half of SCR-015
// (`/app/sessions/[id]/rate`).

export type SurveyQuestionKind = "scale_1_5" | "single_choice" | "multi_choice" | "free_text";

export interface SurveyOptionDTO {
  id: string;
  label: string;
}

export interface SurveyQuestionDTO {
  id: string;
  kind: SurveyQuestionKind;
  prompt: string;
  required: boolean;
  options: SurveyOptionDTO[];
}

export interface SurveyTemplateSummary {
  id: string;
  title: string;
  questionCount: number;
  /** How many sessions were given a survey from this template (SCR-065's list). */
  sessionCount: number;
  updatedAt: string;
}

export interface SurveyTemplateDTO {
  id: string;
  title: string;
  questions: SurveyQuestionDTO[];
}

/** What the rate screen renders below the rating — `null` when the session has
 *  no survey, which is REQ-SUR-001's «shows nothing about one, anywhere». */
export interface MemberSurveyDTO {
  surveyId: string;
  title: string;
  /** Read from the register. The member cannot read their own answers — by design. */
  answered: boolean;
  questions: SurveyQuestionDTO[];
}

export interface SurveyResultQuestion extends Omit<SurveyQuestionDTO, "options"> {
  /** ★ `null` while the question is withheld: its count is part of the withhold
   *  (`DEC-163`), because two reads a response apart would otherwise say which
   *  question the newest respondent answered. */
  answeredCount: number | null;
  withheld: boolean;
  mean: number | null;
  /** A scale's five values, or a choice's options in their authored order. */
  distribution: { id?: string; value?: number; label?: string; count: number }[] | null;
  texts: string[] | null;
}

export interface SurveyResultsDTO {
  status: "no_survey" | "withheld" | "ok";
  surveyId: string | null;
  title: string | null;
  /** Rendered only when it is later than the session's completion (§8 case 4). */
  attachedAt: string | null;
  min: number;
  /** ★ `null` while the results are withheld — the count is part of the withhold. */
  responseCount: number | null;
  eligibleCount: number;
  questions: SurveyResultQuestion[];
}

// ── the shapes the two writing screens send ────────────────────────────────

const optionInput = z.string().trim().min(1).max(120);

export const surveyQuestionInput = z.object({
  kind: z.enum(["scale_1_5", "single_choice", "multi_choice", "free_text"]),
  prompt: z.string().trim().min(1).max(300),
  required: z.boolean(),
  options: z.array(optionInput).max(20),
});
export type SurveyQuestionInput = z.infer<typeof surveyQuestionInput>;

export const saveTemplateInput = z.object({
  templateId: z.uuid().nullable(),
  title: z.string().trim().min(1).max(200),
  questions: z.array(surveyQuestionInput).min(1).max(50),
});
export type SaveTemplateInput = z.infer<typeof saveTemplateInput>;

export const answerInput = z.object({
  questionId: z.uuid(),
  scaleValue: z.number().int().min(1).max(5).optional(),
  optionIds: z.array(z.uuid()).optional(),
  textValue: z.string().max(2000).optional(),
});
export type AnswerInput = z.infer<typeof answerInput>;

/** Every outcome the two writing paths can hand a screen. The SQL returns an
 *  envelope for each (DEC-043), and each maps to one message key. */
export type SaveTemplateOutcome =
  | { status: "ok"; templateId: string }
  | { status: "invalid_title" }
  | { status: "empty" }
  | { status: "title_taken" }
  | { status: "invalid"; at: number; field: "kind" | "prompt" | "options" };

export type AttachOutcome =
  | { status: "ok"; surveyId: string }
  | { status: "already_attached" }
  | { status: "template_empty" };

export type DetachOutcome = { status: "ok" } | { status: "no_survey" } | { status: "has_responses" };

export type SubmitOutcome =
  | { status: "ok" }
  | { status: "no_survey" }
  /** ★ Nothing was answered, so nothing was written — not even the
   *  participation. The member keeps their one response for a later visit. */
  | { status: "empty" }
  | { status: "already_answered" }
  | { status: "not_eligible"; reason: "not_checked_in" | "window_closed" }
  | { status: "invalid"; missing: string[]; invalid: string[] };

// ★★ AN ENVELOPE IS MAPPED, NEVER CAST. `data as SaveTemplateOutcome` compiles
// and is a lie: the function returns `template_id` and the DTO says
// `templateId`, so the id was `undefined` at runtime and the editor redirected
// to `/app/admin/surveys/undefined`. NOTHING caught it — `tsc` believes a cast,
// the RLS suite reads the envelope in SQL's own words, and the component test
// MOCKED the action with the camelCase shape the real stack never produced, so
// the mock was more correct than the code. The two readers below are the only
// place the two spellings meet, and `tests/unit/survey-dal-envelopes.test.ts`
// feeds them the database's actual keys.

type Envelope = Record<string, unknown> & { status: string };

/** A refusal the caller may act on becomes a key; anything else is `generic`. */
function rpcError(error: { message: string }, what: string): Error {
  if (/not_authorized|stale_claims|not_a_member/.test(error.message)) return new Error("not_permitted");
  if (/not_found/.test(error.message)) return new Error("not_found");
  // ★ Deliberately not `error.message` for anything else: a Postgres message
  // can quote the row that failed, and on this module's paths that row is an
  // answer. The caller renders `generic`.
  return new Error(`${what}: generic`);
}

// ── SCR-065 — the templates ────────────────────────────────────────────────

/**
 * The survey's audience is `admin` AND `moderator` (REQ-SUR-005) — the reverse
 * of the rating's, where per-rater rows are admin-only. `null` is the page's
 * `notFound()`: a member who guesses the URL learns nothing from a 404 that an
 * empty list would not have told them anyway, and the database refuses the read
 * whatever this returns.
 */
async function requireStaff(locale: string) {
  const client = await sessionClient(locale);
  return client.session.role === "admin" || client.session.role === "moderator" ? client : null;
}

export async function listSurveyTemplates(locale: string): Promise<SurveyTemplateSummary[] | null> {
  const staff = await requireStaff(locale);
  if (!staff) return null;
  const { session, supabase } = staff;
  const { data, error } = await supabase
    .from("survey_templates")
    .select("id, title, updated_at, survey_template_questions(count), surveys(count)")
    .eq("org_id", session.orgId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`survey_templates: ${error.message}`);

  type Row = { id: string; title: string; updated_at: string; survey_template_questions: { count: number }[]; surveys: { count: number }[] };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    title: r.title,
    questionCount: r.survey_template_questions?.[0]?.count ?? 0,
    sessionCount: r.surveys?.[0]?.count ?? 0,
    updatedAt: r.updated_at,
  }));
}

export async function getSurveyTemplate(locale: string, templateId: string): Promise<SurveyTemplateDTO | null> {
  if (!z.uuid().safeParse(templateId).success) return null;
  const staff = await requireStaff(locale);
  if (!staff) return null;
  const { session, supabase } = staff;
  const { data, error } = await supabase
    .from("survey_templates")
    .select("id, title, survey_template_questions(id, kind, prompt, required, position, survey_template_options(id, label, position))")
    .eq("id", templateId)
    .eq("org_id", session.orgId)
    .maybeSingle();
  if (error) throw new Error(`survey_templates: ${error.message}`);
  if (!data) return null;

  type QRow = { id: string; kind: SurveyQuestionKind; prompt: string; required: boolean; position: number; survey_template_options: { id: string; label: string; position: number }[] };
  const row = data as unknown as { id: string; title: string; survey_template_questions: QRow[] };
  return {
    id: row.id,
    title: row.title,
    questions: [...(row.survey_template_questions ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((q) => ({
        id: q.id,
        kind: q.kind,
        prompt: q.prompt,
        required: q.required,
        options: [...(q.survey_template_options ?? [])].sort((a, b) => a.position - b.position).map((o) => ({ id: o.id, label: o.label })),
      })),
  };
}

export async function saveSurveyTemplate(locale: string, input: SaveTemplateInput): Promise<SaveTemplateOutcome> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("survey_template_save", {
    p_template: input.templateId,
    p_title: input.title,
    // The ARRAY ORDER is the question order: `position` is assigned in SQL and
    // never sent (docs/plan/notes/event.md §2 A).
    p_questions: input.questions.map((q) => ({
      kind: q.kind,
      prompt: q.prompt,
      required: q.required,
      options: q.kind === "single_choice" || q.kind === "multi_choice" ? q.options : [],
    })),
  });
  if (error) throw rpcError(error, "survey_template_save");

  const row = (data ?? { status: "generic" }) as Envelope;
  if (row.status === "ok") return { status: "ok", templateId: String(row.template_id) };
  if (row.status === "invalid") {
    return { status: "invalid", at: Number(row.at), field: row.field as "kind" | "prompt" | "options" };
  }
  return { status: row.status as "invalid_title" | "empty" | "title_taken" };
}

export async function deleteSurveyTemplate(locale: string, templateId: string): Promise<void> {
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("survey_template_delete", { p_template: templateId });
  if (error) throw rpcError(error, "survey_template_delete");
}

// ── SCR-064 — attach, detach, results ──────────────────────────────────────

export async function attachSurvey(locale: string, sessionId: string, templateId: string): Promise<AttachOutcome> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("survey_attach", { p_session: sessionId, p_template: templateId });
  if (error) throw rpcError(error, "survey_attach");

  const row = (data ?? { status: "already_attached" }) as Envelope;
  return row.status === "ok"
    ? { status: "ok", surveyId: String(row.survey_id) }
    : { status: row.status as "already_attached" | "template_empty" };
}

export async function detachSurvey(locale: string, sessionId: string): Promise<DetachOutcome> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("survey_detach", { p_session: sessionId });
  if (error) throw rpcError(error, "survey_detach");
  return data as DetachOutcome;
}

type ResultsRow = {
  status: "no_survey" | "withheld" | "ok";
  survey_id?: string;
  title?: string;
  attached_at?: string;
  min?: number;
  response_count?: number;
  eligible_count?: number;
  questions?: {
    id: string; kind: SurveyQuestionKind; prompt: string; required: boolean;
    answered_count: number | null; withheld: boolean; mean: number | string | null;
    distribution: { id?: string; value?: number; label?: string; count: number }[] | null;
    texts: string[] | null;
  }[];
};

/**
 * SCR-064's read, and the CSV's — ★ ALREADY WITHHELD.
 *
 * `public.survey_results()` is the only way a response or an answer leaves the
 * database, and both exits call it, so `REQ-SUR-007`'s «the withhold applies to
 * the export exactly as it does to the screen» is true by construction. This
 * function shapes; it never decides what may be shown.
 */
export async function getSurveyResults(locale: string, sessionId: string): Promise<SurveyResultsDTO | null> {
  const staff = await requireStaff(locale);
  if (!staff) return null;
  const { supabase } = staff;
  const { data, error } = await supabase.rpc("survey_results", { p_session: sessionId });
  if (error) throw rpcError(error, "survey_results");
  const row = (data ?? { status: "no_survey" }) as ResultsRow;

  return {
    status: row.status,
    surveyId: row.survey_id ?? null,
    title: row.title ?? null,
    attachedAt: row.attached_at ?? null,
    min: row.min ?? 3,
    responseCount: row.response_count ?? null,
    eligibleCount: row.eligible_count ?? 0,
    questions: (row.questions ?? []).map((q) => ({
      id: q.id,
      kind: q.kind,
      prompt: q.prompt,
      required: q.required,
      answeredCount: q.answered_count ?? null,
      withheld: q.withheld,
      mean: q.mean === null || q.mean === undefined ? null : Number(q.mean),
      distribution: q.distribution,
      texts: q.texts,
    })),
  };
}

// ── SCR-015 — the member's half ────────────────────────────────────────────

export async function getSurveyForMember(locale: string, sessionId: string): Promise<MemberSurveyDTO | null> {
  if (!z.uuid().safeParse(sessionId).success) return null;
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("survey_for_member", { p_session: sessionId });
  if (error) throw rpcError(error, "survey_for_member");
  if (!data) return null;   // no survey, or a caller who may not answer it

  const row = data as { survey_id: string; title: string; answered: boolean; questions: SurveyQuestionDTO[] };
  return {
    surveyId: row.survey_id,
    title: row.title,
    answered: row.answered,
    questions: row.questions ?? [],
  };
}

export async function submitSurveyResponse(locale: string, sessionId: string, answers: AnswerInput[]): Promise<SubmitOutcome> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("submit_survey_response", {
    p_session: sessionId,
    // Only the three shapes the function accepts; nothing else the form held
    // travels with them — no request id, no correlation id (DEC-160 §3.2).
    p_answers: answers.map((a) => ({
      question_id: a.questionId,
      ...(a.scaleValue !== undefined ? { scale_value: a.scaleValue } : {}),
      ...(a.optionIds !== undefined ? { option_ids: a.optionIds } : {}),
      ...(a.textValue !== undefined ? { text_value: a.textValue } : {}),
    })),
  });
  if (error) throw rpcError(error, "submit_survey_response");
  return data as SubmitOutcome;
}

// ── contract 6 — the CSV's rows, for the lead's audited export ─────────────

export interface SurveyExportSheet {
  sessionTitle: string;
  withheld: boolean;
  headers: string[];
  rows: string[][];
}

const KIND_LABEL: Record<SurveyQuestionKind, string> = {
  scale_1_5: "مقياس 1–5",
  single_choice: "اختيار واحد",
  multi_choice: "اختيار متعدد",
  free_text: "نص حر",
};

/**
 * ★ Contract 6. The rows, **already withheld**, for `admin-exports.ts` to run
 * through `buildCsv()` and audit. Western digits everywhere (`DEC-124`), Arabic
 * headers, one row per value so a spreadsheet can pivot it, and the numeric
 * columns carrying nothing but numbers so Excel parses them.
 *
 * A withheld result is a file with ONE row saying so — never an empty file,
 * which reads as «there were no answers».
 */
export async function getSurveyExportRows(locale: string, sessionId: string): Promise<SurveyExportSheet | null> {
  const { supabase } = await sessionClient(locale);
  const [results, { data: sessionRow }] = await Promise.all([
    getSurveyResults(locale, sessionId),
    supabase.from("sessions").select("title").eq("id", sessionId).maybeSingle(),
  ]);
  if (!results || results.status === "no_survey") return null;

  const sessionTitle = (sessionRow?.title as string | undefined) ?? "";
  const headers = ["السؤال", "النوع", "عدد المجيبين", "القيمة", "العدد", "المتوسط"];

  if (results.status === "withheld") {
    return {
      sessionTitle,
      withheld: true,
      headers,
      rows: [["النتائج محجوبة حتى يبلغ عدد الاستجابات الحد الأدنى", String(results.min), "", "", "", ""]],
    };
  }

  const rows: string[][] = [
    // The response rate, in the same columns: both numbers parse as numbers.
    ["نسبة الاستجابة", "ملخص", String(results.responseCount ?? 0), "من الحضور المؤهلين", String(results.eligibleCount), ""],
  ];

  for (const q of results.questions) {
    // A withheld question has no count to print — the cell is empty rather than
    // a zero, which would be a number the withhold did not release.
    const head = [q.prompt, KIND_LABEL[q.kind], q.answeredCount === null ? "" : String(q.answeredCount)];
    if (q.withheld) {
      rows.push([...head, "محجوبة", "", ""]);
      continue;
    }
    if (q.kind === "free_text") {
      for (const text of q.texts ?? []) rows.push([...head, text, "", ""]);
      if ((q.texts ?? []).length === 0) rows.push([...head, "", "", ""]);
      continue;
    }
    for (const cell of q.distribution ?? []) {
      rows.push([...head, cell.label ?? String(cell.value ?? ""), String(cell.count), q.mean === null ? "" : String(q.mean)]);
    }
  }

  return { sessionTitle, withheld: false, headers, rows };
}
