// The approved email design — the eleven blocks, the seven designed messages, and the facts they draw.
// `REQ-NTF-018`, `REQ-NTF-019`, `REQ-EVT-017`, `REQ-LDR-009`, `DEC-289`.
import { describe, expect, it } from "vitest";
import {
  ago,
  blocksToTemplateText,
  compileBlocks,
  formatFacts,
  initials,
  MAIL,
  platformDesign,
  preheaderFor,
  readDocument,
  renderEmail,
  SAMPLE_CASES,
  SAMPLE_MEMBER,
  SAMPLE_ORG,
  ticketRef,
  weekLabel,
  type CompileContext,
  type EmailBlock,
} from "@kareem/mail-runtime";

const ORIGIN = "https://app.kareem.example";
const SESSION = "11111111-1111-4111-8111-111111111111";
const FSI = String.fromCharCode(0x2068);
const PDI = String.fromCharCode(0x2069);
const plain = (s: string) => s.replaceAll(FSI, "").replaceAll(PDI, "");

const ctx = (payload: Record<string, unknown> = {}): CompileContext => ({
  payload,
  palette: { fgBody: MAIL.text, fgMuted: MAIL.muted, fgHeading: MAIL.text, surface: MAIL.raised, edge: MAIL.line, accent: MAIL.lime, onAccent: MAIL.limeInk },
  logoUrl: null,
  preferencesUrl: null,
  appOrigin: ORIGIN,
  org: "كريم معرفة",
});
const one = (block: EmailBlock, payload: Record<string, unknown> = {}) => compileBlocks({ schemaVersion: 1, blocks: [block] }, ctx(payload));

const sample = (id: string) => SAMPLE_CASES.find((c) => c.id === id)!;
const render = (id: string, extra: Partial<Parameters<typeof renderEmail>[0]> = {}) => {
  const s = sample(id);
  return renderEmail({ key: s.key, payload: s.payload, member: s.member ?? SAMPLE_MEMBER, org: SAMPLE_ORG, appUrl: ORIGIN, ...extra });
};

const DESIGNED = ["MSG-session_published", "MSG-rsvp_confirmed", "MSG-reminder_7d", "MSG-reminder_1d", "MSG-session_comment", "MSG-leaderboard_weekly", "MSG-check_in_confirmed.certificate"];

describe("the eleven blocks — each draws what its facts say, and nothing when they are absent", () => {
  it("every one reads, and is dropped as malformed rather than guessed when its tone is wrong", () => {
    const { dropped } = readDocument({ schemaVersion: 1, blocks: [{ type: "hero", id: "h", text: "x", label: "", tone: "pink" }] });
    expect(dropped).toEqual([{ id: "h", type: "hero", reason: "malformed" }]);
  });

  it("when: the day block, the weekday and time, the venue — and no row with none of them", () => {
    const out = one({ type: "when", id: "w" }, { date_day: "18", date_month: "أكتوبر", weekday: "الأحد", time: "4:00 م", venue: "مكتب شبه الجزيرة" });
    const html = out.rows.join("");
    expect(html).toContain(">18<");
    expect(html).toContain("الأحد · 4:00 م");
    expect(plain(out.text[0]!)).toBe("الأحد 18 أكتوبر\n4:00 م\nمكتب شبه الجزيرة");
    expect(one({ type: "when", id: "w" }).rows).toEqual([]);
  });

  it("seats: the count in words — all six Arabic forms — over a bar, and nothing without a capacity", () => {
    const words = (n: number) => plain(one({ type: "seats", id: "s" }, { seats_left: n, seats_taken_pct: 50 }).text[0]!);
    expect(words(0)).toBe("لا مقاعد متبقية");
    expect(words(1)).toBe("مقعد واحد متبقٍ");
    expect(words(2)).toBe("مقعدان متبقيان");
    expect(words(5)).toBe("5 مقاعد متبقية");
    expect(words(12)).toBe("12 مقعدًا متبقيًا");
    expect(words(100)).toBe("100 مقعد متبقٍ");
    expect(one({ type: "seats", id: "s" }, { seats_left: 12, seats_taken_pct: 70 }).rows.join("")).toContain('width="70%"');
    expect(one({ type: "seats", id: "s" }).rows).toEqual([]);
  });

  it("ticket: the QR is the session's EVENT PAGE through our QR route — never a check-in code (`DEC-289` §4)", () => {
    const url = `${ORIGIN}/ar/app/sessions/${SESSION}`;
    const html = one({ type: "ticket", id: "t", label: "تذكرتك", tone: "lime" }, { title: "جلسة", url, ticket_ref: "KM-ABC123" }).rows.join("");
    expect(html).toContain(`/api/mail/qr?p=${encodeURIComponent(`/ar/app/sessions/${SESSION}`)}`);
    expect(html).toMatch(/<div dir="ltr"[^>]*>KM-ABC123<\/div>/);
    expect(html).toContain(`background:${MAIL.lime}`);
  });

  it("hero and stats: a figure-led value is drawn left-to-right, so «+20» and «↑ 2» never flip", () => {
    expect(one({ type: "hero", id: "h", text: "#4", label: "↑ 2", tone: "lime" }).rows.join("")).toMatch(/dir="ltr"[^>]*>#4</);
    expect(one({ type: "hero", id: "h", text: "#4", label: "↑ 2", tone: "lime" }).rows.join("")).toMatch(/<div dir="ltr"[^>]*>↑ 2</);
    const stats = one({ type: "stats", id: "s", items: [{ label: "نقطة عند الحضور", value: "{{points}}" }, { label: "سيحضرون", value: "{{going}}" }] }, { points: "+20", going: 38 });
    expect(stats.rows.join("")).toMatch(new RegExp(`<div dir="ltr"[^>]*>${FSI}\\+20${PDI}<`));
    // An empty figure is no cell.
    expect(one({ type: "stats", id: "s", items: [{ label: "x", value: "{{none}}" }] }).rows).toEqual([]);
  });

  it("quote: the commenter, the comment in a bubble, the session, the counts in words", () => {
    const out = one({ type: "quote", id: "q", label: "علّق على جلستك" }, { actor: "سارة القحطاني", actor_initials: "سق", ago: "قبل 5 دقائق", comment: "سؤال؟", title: "جلسة", likes: 24, comments: 1 });
    const text = plain(out.text[0]!);
    expect(text).toContain("سارة القحطاني — علّق على جلستك · قبل 5 دقائق");
    expect(text).toContain("«سؤال؟»");
    expect(text).toContain("24 إعجابًا · تعليق واحد");
    expect(one({ type: "quote", id: "q", label: "x" }, { actor: "س" }).rows).toEqual([]);
  });

  it("leaderboard: the top three, «···», and always the recipient's own row — once, when they are in the top", () => {
    const top = [1, 2, 3].map((rank) => ({ rank, name: `عضو ${rank}`, initials: "ع", team: "#9B7CFF", points: 1000 - rank }));
    const below = one({ type: "leaderboard", id: "l" }, { top, me: { rank: 7, name: "أنا", initials: "أ", team: null, points: 10 } });
    expect(below.rows.join("")).toContain("···");
    expect(plain(below.text[0]!).split("\n")).toHaveLength(4);
    const inside = one({ type: "leaderboard", id: "l" }, { top, me: { rank: 2, name: "عضو 2", initials: "ع", team: null, points: 998 } });
    expect(inside.rows.join("")).not.toContain("···");
    expect(plain(inside.text[0]!).split("\n")).toHaveLength(3);
    // A team colour from data is a hex or nothing.
    expect(one({ type: "leaderboard", id: "l" }, { top: [{ rank: 1, name: "x", points: 1, team: "red;}" }] }).rows.join("")).not.toContain("red;}");
  });

  it("rating: five numbered links to the rating page, and none to a page we would not send", () => {
    const html = one({ type: "rating", id: "r", label: "قيّم الجلسة" }, { rate_url: `${ORIGIN}/ar/app/sessions/${SESSION}/rate` }).rows.join("");
    for (const n of [1, 2, 3, 4, 5]) expect(html).toContain(`/rate?stars=${n}"`);
    expect(one({ type: "rating", id: "r", label: "x" }, { rate_url: "javascript:alert(1)" }).dropped).toHaveLength(1);
  });

  it("links: quiet text links, a URL we would not send dropped loudly", () => {
    const out = one({ type: "links", id: "l", items: [{ label: "عرض الجلسة", value: "{{url}}" }, { label: "خطر", value: "{{bad}}" }] }, { url: `${ORIGIN}/x`, bad: "javascript:1" });
    expect(out.rows.join("")).toContain(`href="${ORIGIN}/x"`);
    expect(out.rows.join("")).not.toContain("javascript:");
    expect(out.dropped).toEqual([{ id: "l", type: "links", reason: "malformed" }]);
  });

  it("the stored template text names the bindings, never a value (REQ-NTF-013)", () => {
    const text = blocksToTemplateText({ schemaVersion: 1, blocks: platformDesign("MSG-rsvp_confirmed")!.blocks });
    expect(text).toContain("{{title}}");
    expect(text).toContain("{{going_count}}");
    expect(text).not.toContain("سارة");
  });
});

describe("the seven designed messages", () => {
  it.each(DESIGNED)("%s renders whole from its sample: no row lost, one lime button at most, a preheader", (id) => {
    const out = render(id);
    expect(out.dropped).toEqual([]);
    const lime = out.html.match(new RegExp(`<td dir="rtl" align="center" bgcolor="${MAIL.lime}"`, "g")) ?? [];
    expect(lime.length).toBeLessThanOrEqual(1);
    expect(out.html).toMatch(/<div style="display:none;[^"]*">[^<]+/);
    expect(out.html).not.toMatch(/[٠-٩]/);
    // ★ The owner's ruling on PR #115 (`DEC-289` §2): the seven greet the member first, as every message does.
    expect(out.text.startsWith("مرحبًا")).toBe(true);
  });

  it("the header: the hosted mark, «كريم معرفة», and the HOST company at the inline end", () => {
    const out = render("MSG-session_published");
    expect(out.html).toContain(`src="${ORIGIN}/email/logo-mark@2x.png"`);
    expect(out.html).toContain(">كريم معرفة<");
    expect(out.html).toContain(">شبه الجزيرة<");
  });

  it("new-session: the poster at 16:9 through the wide route; with no poster, no image row", () => {
    expect(render("MSG-session_published").html).toContain(`src="${ORIGIN}/api/s/${SESSION}/wide"`);
    expect(render("MSG-session_published.bare").html).not.toContain("/api/s/");
  });

  it("★ after-session sends at check-in with NO points figure, and the certificate only when one is issued", () => {
    const bare = render("MSG-check_in_confirmed");
    // The body only — the font link in the head carries «Bhaijaan+2».
    expect(bare.html.slice(bare.html.indexOf("<body"))).not.toMatch(/\+\d/);
    expect(bare.text).not.toContain("نقطة");
    expect(bare.html).not.toContain("شهادة حضور");
    const issued = render("MSG-check_in_confirmed.certificate");
    expect(issued.html).toContain("شهادة حضور");
    expect(issued.html).toContain(`href="${ORIGIN}/ar/verify/AB12-CD34"`);
  });

  it("the reminders differ by their countdown alone", () => {
    // After the greeting, the hero.
    expect(render("MSG-reminder_7d").text.split("\n\n")[1]!.startsWith("7 أيام")).toBe(true);
    expect(render("MSG-reminder_1d").text.split("\n\n")[1]!.startsWith("غدًا")).toBe(true);
  });

  it("every designed message has its own preheader, and the rest fall back to the subject", () => {
    for (const id of DESIGNED) expect(preheaderFor(sample(id).key), id).not.toBe("");
    const out = render("MSG-role_changed");
    expect(out.html).toContain(`mso-hide:all">${out.subject}`);
  });

  it("the footer: settings always, and the per-type stop only when the worker passes one (REQ-NTF-019)", () => {
    expect(render("MSG-session_published").html).not.toContain("إيقاف هذه الرسائل");
    const out = render("MSG-session_published", { unsubscribeUrl: `${ORIGIN}/ar/unsubscribe?t=x` });
    expect(out.html).toContain("إيقاف هذه الرسائل");
    expect(out.html).toContain(`href="${ORIGIN}/ar/app/me/settings"`);
  });

  it("★ no brand kit reaches a mail — a kit and no kit render the same bytes (`DEC-289`)", () => {
    const kit = { light: { fgBody: "#123456", fgMuted: "#654321", surface: "#abcdef", fgHeading: "#111111", node: "#e8b23a" } };
    expect(render("MSG-rsvp_confirmed", { brand: kit }).html).toBe(render("MSG-rsvp_confirmed").html);
  });
});

describe("the facts, worded (`formatFacts()`)", () => {
  const RIYADH = "Asia/Riyadh";

  it("the date words in the org's zone, Western digits; a sender's own venue wins", () => {
    const out = formatFacts({ starts_at: "2026-10-18T13:00:00Z", venue: "قاعة أ" }, { venue: "قاعة ب" }, RIYADH);
    expect(out).toMatchObject({ date_day: "18", date_month: "أكتوبر", weekday: "الأحد", time: "4:00 م" });
    expect(out.venue).toBeUndefined();
  });

  it("seats from capacity and the confirmed count; points signed and read, never a literal; none when none", () => {
    expect(formatFacts({ capacity: 40, going_count: 28, points_on_attend: 20 }, {}, RIYADH)).toMatchObject({ seats_left: 12, seats_taken_pct: 70, going_count: 28, points_on_attend: "+20" });
    expect(formatFacts({ points_on_attend: 0 }, {}, RIYADH).points_on_attend).toBeUndefined();
    expect(formatFacts({ capacity: null, going_count: 3 }, {}, RIYADH).seats_left).toBeUndefined();
  });

  it("the week's close: the span, the change, the board's initials", () => {
    expect(weekLabel("2026-10-11", "2026-10-17")).toBe("11 – 17 أكتوبر");
    expect(weekLabel("2026-09-27", "2026-10-03")).toBe("27 سبتمبر – 3 أكتوبر");
    expect(formatFacts({}, { rank_delta: 2 }, RIYADH).rank_change).toBe("↑ 2");
    expect(formatFacts({}, { rank_delta: -1 }, RIYADH).rank_change).toBe("↓ 1");
    expect(formatFacts({}, { rank_delta: 0 }, RIYADH).rank_change).toBeUndefined();
    expect(formatFacts({}, { top: [{ rank: 1, name: "سارة القحطاني", points: 5 }] }, RIYADH).top).toEqual([{ rank: 1, name: "سارة القحطاني", points: 5, initials: "سق" }]);
  });

  it("names, references and times a person reads", () => {
    expect(initials("الوليد باعقبة")).toBe("وب");
    expect(ticketRef("44444444-4444-4444-8444-444444444444")).toBe("KM-444444");
    const now = new Date("2026-10-14T12:00:00Z");
    expect(ago(new Date("2026-10-14T11:55:00Z"), now)).toBe("قبل 5 دقائق");
    expect(ago(new Date("2026-10-14T10:00:00Z"), now)).toBe("قبل ساعتين");
    expect(ago(new Date("2026-10-13T12:00:00Z"), now)).toBe("أمس");
  });
});
