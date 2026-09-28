// `ui/session-cta` — REQ-UIX-033, REQ-UIX-007, REQ-UIX-015, REQ-SES-013, DEC-186 §6.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import type { SessionCtaProps, SessionCtaState } from "@/components/ui";
import { SessionCta } from "@/components/ui/session-cta";

// `ButtonLink` is `@/i18n/navigation`'s `Link`, which reads the locale from next-intl's context.
function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="ar" messages={{}}>
      {children}
    </NextIntlClientProvider>
  );
}

function draw(props: SessionCtaProps) {
  return render(
    <Wrap>
      <SessionCta {...props} />
    </Wrap>,
  );
}

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

/** An action that never answers — the state a press leaves the control in until the server does. */
const never = () => new Promise<void>(() => {});
const CHECK_IN = "/app/sessions/s1/check-in";

function controls(container: HTMLElement) {
  return container.querySelectorAll("button, a[href], input, select, textarea, [tabindex]");
}

describe("SessionCta — the three states that are a control", () => {
  it("reserve: one button, named by its label and its chip, inside its own form", () => {
    const { container } = draw({ state: { kind: "reserve", act: { action: never } }, label: "احجز مقعدك", chip: "12 من 40" });
    // jsdom's name computation pads the inline spans with spaces a browser does not; the words and
    // their order are what is asserted.
    const button = screen.getByRole("button", { name: /^احجز مقعدك\s*،\s*12 من 40$/ });
    expect(button).toHaveAttribute("type", "submit");
    expect(button.closest("form")).not.toBeNull();
    expect(controls(container)).toHaveLength(1);
    expect(within(button).getByText("12 من 40").tagName).toBe("BDI");
  });

  it("waitlist: the same control with its own words — the primitive does not choose them", () => {
    draw({ state: { kind: "waitlist", act: { action: never } }, label: "انضمّ إلى قائمة الانتظار", chip: "3 في الانتظار" });
    expect(screen.getByRole("button", { name: /^انضمّ إلى قائمة الانتظار\s*،\s*3 في الانتظار$/ })).toBeInTheDocument();
  });

  it("check in: a link when the act is an href, and the signal variant", () => {
    draw({ state: { kind: "checkIn", act: { href: CHECK_IN } }, label: "سجّل حضورك" });
    const link = screen.getByRole("link", { name: "سجّل حضورك" });
    expect(link).toHaveAttribute("href", `/ar${CHECK_IN}`);
    expect(link.className).toContain("bg-signal");
    expect(link.className).toContain("w-full");
  });

  it("no chip, no separator: a control with no chip is named by its label alone", () => {
    draw({ state: { kind: "reserve", act: { action: never } }, label: "احجز مقعدك" });
    expect(screen.getByRole("button")).toHaveAccessibleName("احجز مقعدك");
  });
});

describe("SessionCta — the chip is Button's trailing slot, and never wraps", () => {
  it("★ on a button the chip is a flex child after the label, not inside the label's run", () => {
    draw({ state: { kind: "reserve", act: { action: never } }, label: "احجز مقعدك", chip: "12 من 40" });
    const button = screen.getByRole("button");
    const label = button.querySelector('[data-part="label"]')!;
    const chip = button.querySelector('[data-part="chip"]')!;
    expect(label).toHaveTextContent("احجز مقعدك");
    expect(label.contains(chip)).toBe(false);
    // Label first, chip after it, in document order.
    expect(label.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(chip.className).toContain("whitespace-nowrap");
  });

  it("the chip stays while pending, beside the kept label", () => {
    draw({ state: { kind: "reserve", act: { action: never } }, label: "احجز مقعدك", chip: "12 من 40", pending: true });
    expect(screen.getByRole("button").querySelector('[data-part="chip"]')).toHaveTextContent("12 من 40");
  });

  it("a face puts the word at the start and the chip at the end, with no fixed height", () => {
    const { container } = draw({ state: { kind: "attended" }, label: "حضرت", chip: "+50" });
    const face = container.querySelector('[data-part="face"]')!;
    const parts = Array.from(face.children).map((el) => el.getAttribute("data-part") ?? el.querySelector("[data-part]")?.getAttribute("data-part"));
    expect(parts).toEqual(["label", "chip"]);
    expect(face.className).not.toMatch(/(^|\s)(pg:)?h-\d/);
    expect(face.className).toContain("pg:min-h-13");
  });
});

describe("SessionCta — pending keeps the label, and nothing is confirmed early (REQ-UIX-007)", () => {
  it("while pending the label stays, the spinner speaks, and a second press is impossible", () => {
    draw({ state: { kind: "reserve", act: { action: never } }, label: "احجز مقعدك", chip: "12 من 40", pending: true, pendingLabel: "جارٍ الحجز…" });
    const button = screen.getByRole("button", { name: /احجز مقعدك/ });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("احجز مقعدك");
    expect(screen.getByRole("status", { name: "جارٍ الحجز…" })).toBeInTheDocument();
  });

  it("★ a press never moves it to «booked» — only the caller's next render does", async () => {
    const user = userEvent.setup();
    const { container } = draw({ state: { kind: "reserve", act: { action: never } }, label: "احجز مقعدك", chip: "12 من 40" });
    await user.click(screen.getByRole("button"));
    // The action is in flight and never answers: the face is still the reserve button, busy.
    expect(screen.getByRole("button", { name: /احجز مقعدك/ })).toHaveAttribute("aria-busy", "true");
    expect(container.textContent).not.toMatch(/محجوز/);
  });

  it("holds no state of its own — the source has no useState, no reducer and no effect", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/ui/session-cta.tsx"), "utf8").replace(/\/\/.*$/gm, "");
    expect(source).not.toMatch(/\buse(State|Reducer|Effect|LayoutEffect|Optimistic|Transition)\b/);
  });
});

describe("SessionCta — the three faces that offer nothing to press but what they say", () => {
  it("★ booked: a fact, not a control — its one control is the cancel beneath it, described by the note", () => {
    const { container } = draw({
      state: {
        kind: "booked",
        cancel: { label: "إلغاء الحجز (سيُسجَّل كإلغاء متأخر)", act: { action: never }, note: "تجاوزت آخر موعد للإلغاء دون تأخر." },
      },
      label: "محجوز",
      chip: "13 من 40",
    });
    expect(controls(container)).toHaveLength(1);
    const cancel = screen.getByRole("button", { name: "إلغاء الحجز (سيُسجَّل كإلغاء متأخر)" });
    expect(cancel).toHaveAccessibleDescription("تجاوزت آخر موعد للإلغاء دون تأخر.");
    const face = screen.getByText("محجوز").closest("p")!;
    expect(face.compareDocumentPosition(cancel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("booked on the waitlist is the same face with its own words and the clock glyph, and «leave» beneath", () => {
    draw({
      state: { kind: "booked", hold: "waitlist", cancel: { label: "غادر قائمة الانتظار", act: { action: never } } },
      label: "على قائمة الانتظار",
      chip: "ترتيبك 3",
    });
    expect(screen.getByRole("button", { name: "غادر قائمة الانتظار" })).toBeInTheDocument();
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-describedby");
    expect(screen.getByText("ترتيبك 3").tagName).toBe("BDI");
  });

  it("attended: a fact with its chip — the amount is the caller's computed words, never the primitive's", () => {
    const { container } = draw({ state: { kind: "attended" }, label: "حضرت", chip: "+50" });
    expect(controls(container)).toHaveLength(0);
    expect(screen.getByText("+50").tagName).toBe("BDI");
  });

  it("★ none: the label and the reason in words — never a disabled control with no reason (REQ-SES-013)", () => {
    const { container } = draw({ state: { kind: "none", reason: "انتهى وقت الحجز لهذه الجلسة" }, label: "الحجز مغلق" });
    expect(controls(container)).toHaveLength(0);
    expect(container.querySelector("[disabled], [aria-disabled]")).toBeNull();
    expect(screen.getByText("الحجز مغلق")).toBeVisible();
    expect(screen.getByText("انتهى وقت الحجز لهذه الجلسة")).toBeVisible();
  });

  it("renders no heading and no landmark — the page owns the region «الحضور»", () => {
    const states: SessionCtaState[] = [
      { kind: "reserve", act: { action: never } },
      { kind: "booked", cancel: { label: "إلغاء الحجز", act: { action: never } } },
      { kind: "attended" },
      { kind: "none", reason: "أُلغيت الجلسة" },
    ];
    for (const state of states) {
      const { container, unmount } = draw({ state, label: "—" });
      expect(container.querySelector("h1, h2, h3, h4, section, nav, aside, [role=region]"), state.kind).toBeNull();
      unmount();
    }
  });
});

describe("SessionCta — tokens only, composition, and the scope", () => {
  const source = readFileSync(resolve(process.cwd(), "src/components/ui/session-cta.tsx"), "utf8");

  it("holds no hex, no literal duration and no raw palette name", () => {
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/\bduration-\d|\d+ms\b/);
    expect(source).not.toMatch(/\b(?:navy|silver|slate)-\d|\bplay-(?:ink|surface|line|bone|muted|lime|coral|paper|edge)\b/);
  });

  it("★ composes Button and never overrides one of its classes — it adds only `w-full`", () => {
    draw({ state: { kind: "reserve", act: { action: never } }, label: "احجز مقعدك" });
    const got = screen.getByRole("button").className.split(/\s+/).filter(Boolean);
    // No second value for a property Button already sets: radius, height, colour, justification.
    for (const foreign of ["justify-between", "rounded-full", "rounded-pill", "h-13", "bg-accent", "text-on-accent"]) {
      expect(got, foreign).not.toContain(foreign);
    }
    expect(got).toContain("w-full");
  });

  it("renders every state inside the scope, right to left, and is accessible", async () => {
    const { container } = render(
      <Wrap>
        <div className="theme-play flex flex-col gap-6" dir="rtl">
          <SessionCta state={{ kind: "reserve", act: { action: never } }} label="احجز مقعدك" chip="12 من 40" />
          <SessionCta state={{ kind: "waitlist", act: { action: never } }} label="انضمّ إلى قائمة الانتظار" chip="3 في الانتظار" />
          <SessionCta
            state={{ kind: "booked", cancel: { label: "إلغاء الحجز", act: { action: never }, note: "يمكنك الإلغاء حتى الساعة 5:00 م." } }}
            label="محجوز"
            chip="13 من 40"
          />
          <SessionCta state={{ kind: "booked", hold: "waitlist", cancel: { label: "غادر قائمة الانتظار", act: { action: never } } }} label="على قائمة الانتظار" chip="ترتيبك 3" />
          <SessionCta state={{ kind: "checkIn", act: { href: CHECK_IN } }} label="سجّل حضورك" />
          <SessionCta state={{ kind: "attended" }} label="حضرت" chip="+50" />
          <SessionCta state={{ kind: "none", reason: "انتهى وقت الحجز لهذه الجلسة" }} label="الحجز مغلق" />
          <SessionCta state={{ kind: "reserve", act: { action: never } }} label="احجز مقعدك" pending pendingLabel="جارٍ الحجز…" />
        </div>
      </Wrap>,
    );
    await expectAccessible(container);
  });
});
