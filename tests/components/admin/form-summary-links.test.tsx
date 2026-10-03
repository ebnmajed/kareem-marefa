// Wave 8, F4: on five of this track's forms the error summary's links focused
// nothing. `summaryErrors()` targets a field's NAME by default, and these forms
// give each `<Field>` a prefixed id («v-name», «s-timezone», «direct-title») —
// so every link pointed at an element that does not exist. REQ-UIX-009:
// «activating a summary item moves focus to the named control».
//
// Each case: an action that refuses one field, a submit, a click on the
// summary's link, and the focus on that field's control.
import type React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { DirectSessionForm } from "@/app/[locale]/app/admin/sessions/direct-session-form";
import { formStateFrom, withErrors, type FormState } from "@/lib/form-state";
import adminAr from "@/messages/ar/admin.json";
import proposalsAr from "@/messages/ar/proposals.json";
import uiAr from "@/messages/ar/ui.json";

const messages = { ...adminAr, ...proposalsAr, ...uiAr };

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="ar" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

/** An action that refuses exactly one field, the way the real ones do. */
function refusing<F extends string>(field: F, key: string) {
  return async (prev: FormState<F>, formData: FormData): Promise<FormState<F>> =>
    withErrors(formStateFrom<F>(formData, { fields: [field], previous: prev }), { [field]: key } as Partial<Record<F, string>>);
}

async function submitAndFollow(container: HTMLElement, controlId: string) {
  fireEvent.submit(container.querySelector("form")!);
  const summary = await screen.findByRole("alert");
  const link = await waitFor(() => within(summary).getAllByRole("link")[0]);
  fireEvent.click(link);
  expect(document.activeElement?.id).toBe(controlId);
}

describe("the error summary's links focus the control on this track's forms (F4)", () => {
  it("the direct-session form on the sessions list", async () => {
    const { container } = render(
      <Wrap>
        <main>
          <DirectSessionForm action={refusing("title", "titleRequired")} categories={[{ id: "c1", name: "تقارير" }]} members={[]} />
        </main>
      </Wrap>,
    );
    await submitAndFollow(container, "direct-title");
  });
});
