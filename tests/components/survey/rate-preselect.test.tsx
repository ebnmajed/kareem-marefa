// The after-session mail's «قيّم الجلسة 1 … 5» — `?stars=N` pre-selects, it never rates (`DEC-289`, the owner's ruling
// on PR #115; REQ-RAT-001, REQ-RAT-003, REQ-UIX-066).
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { preselectStars } from "@/app/[locale]/app/sessions/[id]/rate/preselect";
import { RateForm } from "@/app/[locale]/app/sessions/[id]/rate/rate-form";
import type { RatingDTO } from "@/lib/dal/ratings";
import ratings from "@/messages/ar/ratings.json";
import survey from "@/messages/ar/survey.json";
import ui from "@/messages/ar/ui.json";

const submit = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
vi.mock("@/app/[locale]/app/sessions/[id]/rate/actions", () => ({ submitRatingAction: submit, updateRatingAction: update }));

const OPEN = { eligible: true, existing: null };
const EXISTING = { id: "r1", sessionStars: 2, presenterStars: 3, comment: null } as unknown as RatingDTO;

describe("preselectStars — the link's number, validated, and only where it may apply", () => {
  it("1 … 5 on a first rating in an open window", () => {
    for (const n of [1, 2, 3, 4, 5]) expect(preselectStars(String(n), OPEN)).toBe(n);
  });

  it("anything else is ignored — never a guess", () => {
    for (const raw of ["0", "6", "2.5", "-1", "abc", "", " ", undefined, ["3", "4"]]) expect(preselectStars(raw as never, OPEN), String(raw)).toBeNull();
  });

  it("★ ignored once the member has rated — a link never overwrites a rating", () => {
    expect(preselectStars("5", { eligible: true, existing: EXISTING })).toBeNull();
  });

  it("★ ignored when the window has closed (REQ-RAT-003)", () => {
    expect(preselectStars("5", { eligible: false, existing: null })).toBeNull();
  });
});

function renderForm(props: { preselect?: 1 | 2 | 3 | 4 | 5; existing?: RatingDTO | null }) {
  return render(
    <NextIntlClientProvider locale="ar" messages={{ ...ratings, ...survey, ...ui }}>
      <RateForm locale="ar" sessionId="sess" checkInId="ci" existing={props.existing ?? null} preselect={props.preselect} survey={null} />
    </NextIntlClientProvider>,
  );
}

// By the field's name — the group's accessible name also carries its «مطلوب» marker.
const checked = (field: "sessionStars" | "presenterStars") =>
  [...document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${field}"]`)].filter((r) => r.checked).map((r) => r.value);

describe("RateForm with a pre-selected star", () => {
  it("★ the tapped star is checked on the SESSION's row; the presenter's is untouched; nothing is submitted", () => {
    renderForm({ preselect: 4 });
    expect(checked("sessionStars")).toEqual(["4"]);
    expect(checked("presenterStars")).toEqual([]);
    expect(submit).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("an existing rating wins over the link", () => {
    renderForm({ preselect: 5, existing: EXISTING });
    expect(checked("sessionStars")).toEqual(["2"]);
  });

  it("no link, no pre-selection — the form as it always opened", () => {
    renderForm({});
    expect(checked("sessionStars")).toEqual([]);
  });
});
