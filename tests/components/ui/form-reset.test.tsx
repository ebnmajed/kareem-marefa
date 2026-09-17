// The form-reset defect across the house controls — REQ-UIX-011 (wave 8, sync 2).
//
// React calls the native `form.reset()` after EVERY `<form action>` submission,
// a refusal as much as a success. A reset puts each control back to its
// DEFAULT, and React never keeps a select's default, or a controlled checkbox's
// or radio's, in step with what is on show — so a refused form showed the value
// the control mounted with while its state held another, and the next
// submission posted it. Each case submits once through `useActionState` and
// reads what is on show; the «raw» cases pin the defect in React itself, so a
// green primitive case means the primitive repairs it, not that it never was.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useActionState, useState } from "react";
import { describe, expect, it } from "vitest";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup } from "@/components/ui/radio-group";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type Attempt = { attempt: number; posted: string };
const refuse =
  (field: string) =>
  async (previous: Attempt, formData: FormData): Promise<Attempt> => ({
    attempt: previous.attempt + 1,
    posted: formData.has(field) ? String(formData.get(field)) : "∅",
  });

async function submit() {
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "احفظ" })));
}

function Shell({ field, children }: { field: string; children: (state: Attempt) => React.ReactNode }) {
  const [state, dispatch] = useActionState(refuse(field), { attempt: 0, posted: "" });
  return (
    <form action={dispatch}>
      {children(state)}
      <p>{`المحاولة ${state.attempt} · ${state.posted}`}</p>
      <button type="submit">احفظ</button>
    </form>
  );
}

describe("a controlled select", () => {
  function Venue({ raw }: { raw?: boolean }) {
    const [venue, setVenue] = useState("hall");
    const options = [
      <option key="hall" value="hall">القاعة الكبرى</option>,
      <option key="lab" value="lab">المختبر</option>,
    ];
    return (
      <Shell field="venue">
        {() =>
          raw ? (
            <select aria-label="المكان" name="venue" value={venue} onChange={(e) => setVenue(e.target.value)}>
              {options}
            </select>
          ) : (
            <Select aria-label="المكان" name="venue" value={venue} onChange={(e) => setVenue(e.target.value)}>
              {options}
            </Select>
          )
        }
      </Shell>
    );
  }

  it("the defect: a raw controlled select falls back to its mount value after the reset", async () => {
    render(<Venue raw />);
    fireEvent.change(screen.getByLabelText("المكان"), { target: { value: "lab" } });
    await submit();
    expect(screen.getByText("المحاولة 1 · lab")).toBeInTheDocument();
    expect(screen.getByLabelText("المكان")).toHaveValue("hall");
  });

  it("ui/select shows what its state holds after the reset — and posts it the second time", async () => {
    render(<Venue />);
    fireEvent.change(screen.getByLabelText("المكان"), { target: { value: "lab" } });
    await submit();
    expect(screen.getByLabelText("المكان")).toHaveValue("lab");
    await submit();
    expect(screen.getByText("المحاولة 2 · lab")).toBeInTheDocument();
  });
});

describe("an uncontrolled select", () => {
  it("keeps the member's choice through the reset", async () => {
    render(
      <Shell field="badge">
        {() => (
          <Select aria-label="الشارة" name="badge" defaultValue="">
            <option value="">اختر شارة</option>
            <option value="regular">حاضر دائم</option>
          </Select>
        )}
      </Shell>,
    );
    fireEvent.change(screen.getByLabelText("الشارة"), { target: { value: "regular" } });
    await submit();
    expect(screen.getByText("المحاولة 1 · regular")).toBeInTheDocument();
    expect(screen.getByLabelText("الشارة")).toHaveValue("regular");
  });
});

describe("a controlled switch", () => {
  function WalkIns({ raw }: { raw?: boolean }) {
    const [on, setOn] = useState(false);
    return (
      <Shell field="allowWalkIns">
        {() =>
          raw ? (
            <input type="checkbox" role="switch" aria-label="الحضور دون حجز" name="allowWalkIns" checked={on} onChange={(e) => setOn(e.target.checked)} />
          ) : (
            <Switch name="allowWalkIns" label="الحضور دون حجز" checked={on} onCheckedChange={setOn} />
          )
        }
      </Shell>
    );
  }

  it("the defect: a raw controlled checkbox falls back to its mount value after the reset", async () => {
    render(<WalkIns raw />);
    fireEvent.click(screen.getByRole("switch"));
    await submit();
    expect(screen.getByText("المحاولة 1 · on")).toBeInTheDocument();
    expect(screen.getByRole("switch")).not.toBeChecked();
  });

  it("ui/switch stays on after the reset — and posts on the second time", async () => {
    render(<WalkIns />);
    fireEvent.click(screen.getByRole("switch"));
    await submit();
    expect(screen.getByRole("switch")).toBeChecked();
    await submit();
    expect(screen.getByText("المحاولة 2 · on")).toBeInTheDocument();
  });
});

describe("a controlled radio group", () => {
  function Mode() {
    const [mode, setMode] = useState("automatic");
    return (
      <Shell field="certificateMode">
        {() => (
          <RadioGroup
            name="certificateMode"
            legend="إصدار الشهادات"
            value={mode}
            onChange={setMode}
            options={[
              { value: "automatic", label: "تلقائيًا" },
              { value: "review", label: "بعد المراجعة" },
            ]}
          />
        )}
      </Shell>
    );
  }

  it("ui/radio-group keeps the chosen option after the reset — and posts it the second time", async () => {
    render(<Mode />);
    fireEvent.click(screen.getByRole("radio", { name: "بعد المراجعة" }));
    await submit();
    expect(screen.getByText("المحاولة 1 · review")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "بعد المراجعة" })).toBeChecked();
    await submit();
    expect(screen.getByText("المحاولة 2 · review")).toBeInTheDocument();
  });
});

describe("a controlled checkbox", () => {
  function Download() {
    const [on, setOn] = useState(false);
    return (
      <Shell field="allowDownload">
        {() => <Checkbox name="allowDownload" label="السماح بالتنزيل" checked={on} onChange={(e) => setOn(e.target.checked)} />}
      </Shell>
    );
  }

  it("ui/checkbox stays checked after the reset — and posts it the second time", async () => {
    render(<Download />);
    fireEvent.click(screen.getByRole("checkbox", { name: "السماح بالتنزيل" }));
    await submit();
    expect(screen.getByRole("checkbox", { name: "السماح بالتنزيل" })).toBeChecked();
    await submit();
    expect(screen.getByText("المحاولة 2 · on")).toBeInTheDocument();
  });
});
