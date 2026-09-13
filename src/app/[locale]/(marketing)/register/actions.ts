"use server";

import { headers } from "next/headers";
import { supabase } from "@/lib/supabase";
import {
  validateRegistration,
  type RegistrationErrors,
  type Role,
} from "@/lib/schema";
import {
  createFormToken,
  HONEYPOT_FIELD,
  isRateLimited,
  MIN_SUBMIT_MS,
  verifyFormToken,
} from "@/lib/anti-spam";

export type RegistrationState = {
  status: "idle" | "error" | "success" | "duplicate";
  /** Which success/duplicate panel to show. */
  role?: Role;
  /** Field errors are message keys under `register.errors`; `form` carries
   * whole-form failures. */
  errors?: RegistrationErrors & { form?: "network" | "rateLimited" | "retry" };
  /** Replacement min-time token. On the JS path the server-rendered token
   * in the DOM is never re-minted, so a too-fast/expired verdict must ship
   * a fresh one or retries would loop on the same stale token. */
  freshToken?: string;
  /** Echo of submitted values — React 19 resets uncontrolled inputs when the
   * action completes (including on failure), so inputs bind these as
   * defaultValue. Also what keeps the no-JS POST path lossless. */
  values?: {
    role: string;
    name: string;
    email: string;
    topicTitle: string;
    topicDescription: string;
    topicCategory: string;
  };
};

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

export async function submitRegistration(
  _prev: RegistrationState,
  formData: FormData,
): Promise<RegistrationState> {
  const values = {
    role: str(formData.get("role")),
    name: str(formData.get("name")),
    email: str(formData.get("email")),
    topicTitle: str(formData.get("topicTitle")),
    topicDescription: str(formData.get("topicDescription")),
    topicCategory: str(formData.get("topicCategory")),
  };
  const locale = str(formData.get("locale")) === "en" ? "en" : "ar";
  const fakeRole: Role = values.role === "provider" ? "provider" : "attendee";

  // Layer 1 — honeypot: fake success, never insert.
  if (str(formData.get(HONEYPOT_FIELD)) !== "") {
    console.warn("[anti-spam] honeypot hit");
    return { status: "success", role: fakeRole, values };
  }

  // Layer 2 — signed min-time token. Only a TAMPERED signature gets the
  // fake success (that's a bot signal); too-fast and expired are states a
  // real person hits (quick fix-and-resubmit after a no-JS error; a tab
  // left open past the token's 2h life), so they get a real, retryable
  // error plus a fresh token. Expired tokens have already proven patience,
  // so their replacement is backdated past the minimum wait; too-fast
  // replacements still enforce it.
  const verdict = verifyFormToken(str(formData.get("form_token")));
  if (verdict === "invalid") {
    console.warn("[anti-spam] form token invalid");
    return { status: "success", role: fakeRole, values };
  }
  if (verdict === "tooFast" || verdict === "expired") {
    console.warn(`[anti-spam] form token ${verdict}`);
    return {
      status: "error",
      errors: { form: "retry" },
      values,
      freshToken: createFormToken(
        verdict === "expired" ? Date.now() - MIN_SUBMIT_MS - 1000 : Date.now(),
      ),
    };
  }

  const { data, errors } = validateRegistration({ ...values, locale });
  if (!data) return { status: "error", errors, values };

  // Layer 3 — tripwire: a REAL, retryable error (legitimate users share
  // corporate NAT IPs — never swallow their registrations as fake success).
  // Leftmost x-forwarded-for entry is trustworthy on Vercel (the platform
  // sets it; client-supplied values are stripped). Revisit if this ever
  // deploys behind a different proxy chain.
  const ip =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  if (isRateLimited(ip, data.email)) {
    console.warn("[anti-spam] rate limited", ip);
    return { status: "error", errors: { form: "rateLimited" }, values };
  }

  const { error } = await supabase.from("registrations").insert({
    name: data.name,
    email: data.email,
    role: data.role,
    locale: data.locale,
    topic_title: data.role === "provider" ? data.topicTitle : null,
    topic_description: data.role === "provider" ? data.topicDescription : null,
    topic_category: data.role === "provider" ? data.topicCategory : null,
  });

  if (error) {
    if (error.code === "23505") {
      return { status: "duplicate", role: data.role, values };
    }
    console.error("[register] insert failed", error.code, error.message);
    return { status: "error", errors: { form: "network" }, values };
  }

  return { status: "success", role: data.role, values };
}
