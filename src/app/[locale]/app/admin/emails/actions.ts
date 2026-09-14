"use server";

import { redirect } from "next/navigation";
import { deleteTemplate, saveTemplate, templateInput } from "@/lib/dal/notifications";

// Zod first, then the DAL (REQ-NFR-002). The authority is neither: the
// `notification_templates_validate` trigger (0026) refuses a body missing a
// declared required field and a key outside `08` §1, for every writer. These
// actions only turn its errcodes into something SCR-058 can say.

const SCREEN = "/ar/app/admin/emails";

export async function saveEmailTemplate(formData: FormData) {
  const parsed = templateInput.safeParse({
    key: formData.get("key")?.toString() ?? "",
    subject: formData.get("subject")?.toString() ?? "",
    body: formData.get("body")?.toString() ?? "",
    requiredFields: (formData.get("requiredFields")?.toString() ?? "")
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean),
  });
  if (!parsed.success) redirect(`${SCREEN}?error=generic`);

  try {
    await saveTemplate("ar", parsed.data);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "generic";
    const known = ["missing_required_field", "unknown_message_key", "not_permitted"];
    redirect(`${SCREEN}?error=${known.includes(reason) ? reason : "generic"}&key=${encodeURIComponent(parsed.data.key)}`);
  }
  redirect(`${SCREEN}?saved=1&key=${encodeURIComponent(parsed.data.key)}`);
}

export async function removeEmailTemplate(formData: FormData) {
  try {
    await deleteTemplate("ar", formData.get("id")?.toString() ?? "");
  } catch {
    redirect(`${SCREEN}?error=generic`);
  }
  redirect(`${SCREEN}?saved=1`);
}
