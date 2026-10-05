// ★ THE CERTIFICATE CANVAS — wave 23, slice 3b (REQ-UIX-111, DEC-236 C3 – C5, DEC-238 §3).
//
// An org's attendance template, opened in the rebuilt studio:
//   · ONE page per certificate — the strip shows the composition's one preset (DEC-148);
//   · الحقول lists the certificate's fields, «مستخدم» where the template names them, and no {اسم الإنجاز} for an
//     attendance template ({المستوى} is the achievement family's);
//   · the checks fit the org's LONGEST member name at the name layer's max lines, and say so, naming the layer (C4);
//   · «معاينة بعضو» renders a real member's name through the one renderer (C5) — and the export queue keeps the
//     saved document's own fingerprint: a preview adds no row to `export_artifacts`.
// Captures at 1280 beside `AdminCertDesigner.dc.html`.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const DB_URL = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.env.E2E_SHOTS_DIR ?? ".qa-shots/rtl";
const PASSWORD = "correct-horse-battery-staple-9";
const DESKTOP = { width: 1280, height: 900 };

test.skip(!SERVICE_KEY || !PUBLISHABLE_KEY, "needs local Supabase: run `npm run test:e2e:local`");
test.describe.configure({ mode: "serial" });

const LONG_NAME = "عبدالرحمن بن عبدالعزيز بن محمد بن عبدالله بن سليمان بن إبراهيم بن عبدالكريم بن فهد بن خالد بن سعود آل الطويل جدًّا";

let admin: ReturnType<typeof createClient>;
let db: pg.Client;
let orgId = "";
let adminEmail = "";
let memberId = "";
let documentId = "";
const userIds: string[] = [];

async function provisionMemberId(email: string): Promise<string> {
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, { cookies: { getAll: () => [], setAll: () => {} } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const { data, error: rpcError } = await client.rpc("provision_member");
  if (rpcError) throw rpcError;
  return (data as { member_id: string }).member_id;
}

test.beforeAll(async ({}, testInfo) => {
  admin = createClient(SUPABASE_URL, SERVICE_KEY!, { auth: { persistSession: false } });
  db = new pg.Client(DB_URL);
  await db.connect();
  const tag = `${testInfo.workerIndex}-${Date.now()}`;
  const domain = `cert23-${tag}.example`;
  adminEmail = `boss@${domain}`;
  const { rows: orgRows } = await db.query<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
     values ('مؤسسة الشهادات', $1, 'CT', gen_random_uuid(), $2) returning id`,
    [`cert23-${tag}`, adminEmail],
  );
  orgId = orgRows[0].id;
  await db.query(`insert into public.org_settings (org_id) values ($1)`, [orgId]);
  await db.query(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [orgId, domain]);
  for (const [email, name] of [[adminEmail, "مشرفة الشهادات"], [`long@${domain}`, LONG_NAME]] as const) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    userIds.push(data.user.id);
    const id = await provisionMemberId(email);
    if (email !== adminEmail) memberId = id;
  }
  await db.query(`update public.members set display_name = $2 where id = $1`, [memberId, LONG_NAME]);

  // The platform's landscape attendance certificate, copied into the org's library as its own template.
  // ★ LEDGER (wave 27, PR D, DEC-254 §3): the org's own seeded template — there is no live platform row to read.
  const { rows: platform } = await db.query<{ document: { master: { width: number; height: number } } }>(
    `select v.document from public.design_template_versions v
       join public.design_templates t on t.id = v.template_id
      where t.org_id = $1 and t.purpose = 'certificate' and t.family = 'attendance'
        and (v.document->'master'->>'width')::int > (v.document->'master'->>'height')::int
      order by t.is_default desc, v.version desc limit 1`,
    [orgId],
  );
  // The name layer held to ONE line, so the org's longest name (120 characters at most, `0004`) cannot fit it at the
  // template's floor — the check must say so. Every other byte is the platform's.
  const document = platform[0].document as unknown as { master: unknown; layers: Array<{ id: string; autoFit?: { mode: string; maxLines?: number } }> };
  for (const layer of document.layers) if (layer.id === "l_recipient") layer.autoFit = { mode: "shrink-then-wrap", maxLines: 1 };
  const { rows: template } = await db.query<{ id: string }>(
    `insert into public.design_templates (org_id, scope, purpose, family, name) values ($1, 'org', 'certificate', 'attendance', 'شهادة حضور عرضية') returning id`,
    [orgId],
  );
  const { rows: version } = await db.query<{ id: string }>(
    `insert into public.design_template_versions (template_id, version, document, published_at) values ($1, 1, $2::jsonb, now()) returning id`,
    [template[0].id, JSON.stringify(document)],
  );
  const { rows: doc } = await db.query<{ id: string }>(
    `insert into public.design_documents (org_id, purpose, document, template_version_id, draft_for_template_id)
     values ($1, 'certificate', $2::jsonb, $3, $4) returning id`,
    [orgId, JSON.stringify(document), version[0].id, template[0].id],
  );
  documentId = doc[0].id;
});

test.afterAll(async () => {
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  if (orgId) await db.query(`delete from public.orgs where id = $1`, [orgId]);
  await db.end();
});

async function signIn(context: BrowserContext, email: string) {
  const jar: { name: string; value: string }[] = [];
  const client = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => jar,
      setAll: (list) => {
        for (const { name, value } of list) jar.push({ name, value });
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  jar.length = 0;
  await client.auth.refreshSession();
  await context.addCookies(jar.map((c) => ({ name: c.name, value: c.value, domain: "localhost", path: "/" })));
}

const main = (page: Page) => page.locator("#main");
const panel = (page: Page) => main(page).getByRole("tablist", { name: "لوحات المحرّر", exact: true });
const railPanel = (page: Page) => main(page).getByRole("tabpanel").first();
async function rail(page: Page, name: string) {
  await panel(page).getByRole("tab", name === "الفحوصات" ? { name: /^الفحوصات/ } : { name, exact: true }).click();
}
const artifacts = async () => Number((await db.query<{ n: string }>(`select count(*)::text as n from public.export_artifacts where document_id = $1`, [documentId])).rows[0].n);

test("★ the certificate canvas — one page, its fields used or not, the longest name checked, a real member previewed", async ({ context, page }) => {
  test.skip(test.info().project.name === "phone", "the editor is desktop-only (06 §2)");
  test.slow();
  await signIn(context, adminEmail);
  await page.setViewportSize(DESKTOP);
  await page.goto(`/ar/app/admin/designer/${documentId}`);
  await expect(main(page).getByRole("heading", { name: "شهادة حضور عرضية", level: 1 })).toBeVisible();

  // ONE page per certificate: the strip carries its one preset.
  const strip = main(page).getByRole("navigation", { name: "المقاسات" }).first();
  await expect(strip.getByRole("button")).toHaveCount(1);
  await expect(strip.getByRole("button", { name: /شهادة عرضية/ })).toHaveAttribute("aria-pressed", "true");

  // الحقول: the name and the QR are used; the achievement's field is not offered on an attendance template.
  await rail(page, "الحقول");
  await expect(railPanel(page).getByRole("button", { name: /^\{اسم المستفيد\}\s*مستخدم/ })).toBeVisible();
  await expect(railPanel(page).getByRole("button", { name: /^\{رابط التحقّق\}\s*مستخدم/ })).toBeVisible();
  await expect(railPanel(page).getByRole("button", { name: /اسم الإنجاز/ })).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/wave23-designer-certificate-fields-1280.png` });

  // C4: the org's longest member name does not fit the name layer — said, naming the layer.
  await rail(page, "الفحوصات");
  await expect(railPanel(page).getByText(/أطول «اسم المستفيد» في المؤسسة لا يتّسع في الطبقة/).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/wave23-designer-certificate-checks-1280.png` });

  // C5: «معاينة بعضو» renders a real member's name through the one renderer — and writes no export row.
  const before = await artifacts();
  await main(page).getByRole("combobox", { name: "معاينة بعضو" }).selectOption({ label: LONG_NAME });
  await expect(page).toHaveURL(new RegExp(`member=${memberId}`));
  const canvas = main(page).getByRole("region", { name: "المعاينة" }).frameLocator('iframe[title="لوحة التصميم"]');
  await expect(canvas.locator('[data-layer="l_recipient"]')).toContainText("عبدالرحمن");
  expect(await artifacts()).toBe(before);
  await page.screenshot({ path: `${SHOTS}/wave23-designer-preview-member-1280.png` });
});
