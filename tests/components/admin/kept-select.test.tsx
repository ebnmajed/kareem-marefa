// `components/admin/kept-select.tsx` — REQ-UIX-011. React resets a
// `<form action>` after every submission, a refusal included, and never keeps
// a `<select>`'s default in step: a plain `ui/select` came back showing the
// option it mounted with. Each case submits once and reads what is on show.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useActionState, useState } from "react";
import { describe, expect, it } from "vitest";
import { KeptSelect } from "@/components/admin/kept-select";
import { Select } from "@/components/ui/select";

type Refused = { attempt: number; badge: string };
const refuse = async (previous: Refused, formData: FormData): Promise<Refused> => ({ attempt: previous.attempt + 1, badge: String(formData.get("badge") ?? "") });

function Uncontrolled({ Control }: { Control: typeof Select }) {
  const [state, dispatch] = useActionState(refuse, { attempt: 0, badge: "" });
  return (
    <form action={dispatch}>
      <Control aria-label="الشارة" name="badge" defaultValue={state.badge}>
        <option value="">اختر شارة</option>
        <option value="regular">حاضر دائم</option>
        <option value="voice">صوت مسموع</option>
      </Control>
      <p>{`المحاولة ${state.attempt}`}</p>
      <button type="submit">امنح</button>
    </form>
  );
}

function Controlled({ Control }: { Control: typeof Select }) {
  const [metric, setMetric] = useState("check_ins_count");
  const [state, dispatch] = useActionState(refuse, { attempt: 0, badge: "" });
  return (
    <form action={dispatch}>
      <Control aria-label="المقياس" name="metric" value={metric} onChange={(e) => setMetric(e.target.value)}>
        <option value="check_ins_count">الحضور</option>
        <option value="sessions_delivered_count">الجلسات المقدَّمة</option>
      </Control>
      <p>{`المحاولة ${state.attempt} · ${metric}`}</p>
      <button type="submit">احفظ</button>
    </form>
  );
}

async function submit(name: string) {
  await act(async () => fireEvent.click(screen.getByRole("button", { name })));
}

describe("KeptSelect", () => {
  it("the defect it exists for: a plain select comes back showing the option it mounted with", async () => {
    render(<Uncontrolled Control={Select} />);
    fireEvent.change(screen.getByLabelText("الشارة"), { target: { value: "regular" } });
    await submit("امنح");
    expect(screen.getByText("المحاولة 1")).toBeInTheDocument();
    expect(screen.getByLabelText("الشارة")).toHaveValue("");
  });

  it("an uncontrolled choice survives the reset after a refusal, and after a second one", async () => {
    render(<Uncontrolled Control={KeptSelect} />);
    fireEvent.change(screen.getByLabelText("الشارة"), { target: { value: "regular" } });
    await submit("امنح");
    expect(screen.getByText("المحاولة 1")).toBeInTheDocument();
    expect(screen.getByLabelText("الشارة")).toHaveValue("regular");

    fireEvent.change(screen.getByLabelText("الشارة"), { target: { value: "voice" } });
    await submit("امنح");
    expect(screen.getByText("المحاولة 2")).toBeInTheDocument();
    expect(screen.getByLabelText("الشارة")).toHaveValue("voice");
  });

  it("a controlled select shows what its state holds after the reset, not its first option", async () => {
    render(<Controlled Control={KeptSelect} />);
    fireEvent.change(screen.getByLabelText("المقياس"), { target: { value: "sessions_delivered_count" } });
    await submit("احفظ");
    expect(screen.getByText("المحاولة 1 · sessions_delivered_count")).toBeInTheDocument();
    expect(screen.getByLabelText("المقياس")).toHaveValue("sessions_delivered_count");
  });

  it("a plain controlled select does not — its state and its screen disagree", async () => {
    render(<Controlled Control={Select} />);
    fireEvent.change(screen.getByLabelText("المقياس"), { target: { value: "sessions_delivered_count" } });
    await submit("احفظ");
    expect(screen.getByText("المحاولة 1 · sessions_delivered_count")).toBeInTheDocument();
    expect(screen.getByLabelText("المقياس")).toHaveValue("check_ins_count");
  });
});
