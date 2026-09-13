"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { destinationFor, provision } from "@/lib/auth/flow";

// REQ-AUT-004: the choice is permanent because members.org_id is immutable.
// The shape is validated here; provision_member() re-derives whether this
// user may join that org from the domain list — the org id in the form is
// a reference, not an authority.
const input = z.object({ org: z.uuid(), next: z.string().max(2048).optional() });

export async function chooseOrg(formData: FormData) {
  const parsed = input.safeParse({ org: formData.get("org")?.toString(), next: formData.get("next")?.toString() });
  if (!parsed.success) redirect("/ar/choose-org?error=1");

  const supabase = await createServerClient();
  const envelope = await provision(supabase, parsed.data.org);
  if (envelope.status === "provisioned") await supabase.auth.refreshSession();
  redirect(destinationFor(envelope, parsed.data.next));
}
