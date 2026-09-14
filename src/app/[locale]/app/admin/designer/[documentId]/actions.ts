"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requestExports, retryExport } from "@/lib/dal/designer";

// SCR-057's export queue — REQ-DSG-011, REQ-DSG-012.
//
// Server Actions, unlike the autosave beside them, and the difference is the
// payload: these carry ids. The DOCUMENT never crosses an action boundary —
// that is what forced autosave onto a Route Handler (the 1 MB cap, `04`
// §4.2) — because `request_render()` reads the saved document itself. You
// export what is saved, which is also the only thing that could be correct.
//
// `"use server"` modules export async functions and types alone.

async function originOf(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function queueExports(formData: FormData) {
  const documentId = formData.get("documentId")?.toString() ?? "";
  const screen = `/ar/app/admin/designer/${documentId}`;
  const result = await requestExports("ar", documentId, await originOf());
  if ("status" in result) redirect(`${screen}?export=not_authorized`);
  redirect(`${screen}?export=queued`);
}

export async function retryArtifact(formData: FormData) {
  const documentId = formData.get("documentId")?.toString() ?? "";
  const screen = `/ar/app/admin/designer/${documentId}`;
  const result = await retryExport("ar", formData.get("artifactId")?.toString() ?? "");
  redirect(`${screen}?export=${result.status === "ok" ? "retried" : "not_authorized"}`);
}
