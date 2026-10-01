// Shared fixtures for the members' component tests — SCR-019, SCR-020 (wave 19).
import { cloneElement, isValidElement, type ReactNode } from "react";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import members from "@/messages/ar/members.json";
import sessions from "@/messages/ar/sessions.json";
import app from "@/messages/ar/app.json";
import ui from "@/messages/ar/ui.json";

export const messages = { ...members, ...sessions, ...app, ...ui };

/** A stand-in for `next-intl/server`'s `getTranslations`, over the real Arabic catalogue. */
export async function translations(namespace?: string) {
  return createTranslator({ locale: "ar", messages, namespace: namespace as never });
}

export function Wrap({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="ar" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

/** Renders async server components down to client-renderable elements. */
export async function resolveServer(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(resolveServer));
  if (!isValidElement(node)) return node;
  const type = node.type as unknown;
  if (typeof type === "function" && type.constructor.name === "AsyncFunction") {
    return resolveServer(await (type as (props: unknown) => Promise<ReactNode>)(node.props));
  }
  const props = { ...(node.props as Record<string, unknown>) };
  let changed = false;
  for (const [key, value] of Object.entries(props)) {
    if (isValidElement(value) || Array.isArray(value)) {
      props[key] = await resolveServer(value as ReactNode);
      changed = true;
    }
  }
  return changed ? cloneElement(node, props) : node;
}

export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const C1 = "00000000-0000-4000-8000-0000000000c1";
