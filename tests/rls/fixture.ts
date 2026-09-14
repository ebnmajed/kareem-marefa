// Two orgs, or every isolation test is meaningless (13 §3.1).
//
//   org A "كريم معرفة"  — admin_a, mod_a, member_a1, member_a2
//   org B "مؤسسة أخرى"  — admin_b, mod_b, member_b1
//
// Built as the owner (postgres, bypassrls) with direct inserts, so the
// fixture does not depend on the very RPCs the suite tests. Everything is
// inside the caller's transaction and disappears on rollback.

import { randomUUID } from "node:crypto";
import type { Claims, Tx } from "./db";
import { seedM2, type M2Fixture } from "./fixture-m2";
import { seedM3 } from "./fixture-m3";
import { seedM4 } from "./fixture-m4";
import { seedM5, type M5Fixture } from "./fixture-m5";

export interface Person {
  authUserId: string;
  memberId: string;
  email: string;
  orgId: string;
  role: "admin" | "moderator" | "member";
  claims: Claims;
}

export interface Org {
  id: string;
  slug: string;
  name: string;
  domain: string;
  settingsId: string;
  companyId: string;
  categoryId: string;
  venueId: string;
  admin: Person;
  mod: Person;
  members: Person[];
}

export interface Fixture {
  a: Org;
  b: Org;
  /** A Google account on no org's list. */
  stranger: { authUserId: string; email: string };
  /** A platform admin with no member row. */
  platformAdmin: { authUserId: string; email: string };
}

async function authUser(tx: Tx, email: string, name: string) {
  const id = randomUUID();
  await tx.q(
    `insert into auth.users (id, email, raw_user_meta_data)
     values ($1, $2, $3::jsonb)`,
    [id, email, JSON.stringify({ full_name: name, avatar_url: "https://lh3.googleusercontent.com/a/x" })],
  );
  return id;
}

async function person(tx: Tx, org: { id: string; domain: string }, local: string, name: string, role: Person["role"], companyId: string | null): Promise<Person> {
  const email = `${local}@${org.domain}`;
  const authUserId = await authUser(tx, email, name);
  const [row] = await tx.q<{ id: string; claims_version: number }>(
    `insert into public.members (org_id, auth_user_id, email, display_name, org_role, company_id)
     values ($1, $2, $3, $4, $5, $6) returning id, claims_version`,
    [org.id, authUserId, email, name, role, companyId],
  );
  return {
    authUserId,
    memberId: row.id,
    email,
    orgId: org.id,
    role,
    claims: {
      sub: authUserId,
      email,
      org_id: org.id,
      member_id: row.id,
      org_role: role,
      status: "active",
      claims_version: row.claims_version,
      org_status: "active",
    },
  };
}

async function org(tx: Tx, name: string, slug: string, prefix: string, domain: string, people: [string, string][]): Promise<Org> {
  const [o] = await tx.q<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by)
     values ($1, $2, $3, $4) returning id`,
    [name, slug, prefix, randomUUID()],
  );
  const [s] = await tx.q<{ id: string }>(`insert into public.org_settings (org_id) values ($1) returning id`, [o.id]);
  await tx.q(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [o.id, domain]);
  const [c] = await tx.q<{ id: string }>(`insert into public.companies (org_id, name) values ($1, $2) returning id`, [o.id, `شركة ${name}`]);
  const [cat] = await tx.q<{ id: string }>(`insert into public.categories (org_id, name) values ($1, $2) returning id`, [o.id, "فني"]);
  const [v] = await tx.q<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, $2, 40) returning id`, [o.id, `قاعة ${name}`]);
  const base = { id: o.id, domain };
  const admin = await person(tx, base, people[0][0], people[0][1], "admin", c.id);
  const mod = await person(tx, base, people[1][0], people[1][1], "moderator", c.id);
  const members: Person[] = [];
  for (const [local, n] of people.slice(2)) members.push(await person(tx, base, local, n, "member", c.id));
  return { id: o.id, slug, name, domain, settingsId: s.id, companyId: c.id, categoryId: cat.id, venueId: v.id, admin, mod, members };
}

/** The base fixture plus the M2 rows (sessions, RSVPs, check-ins, comments, ratings…). */
export async function seed(tx: Tx): Promise<M5Fixture> {
  return seedM5(tx, await seedM4(tx, await seedM3(tx, await seedM2(tx, await seedBase(tx)))));
}

export async function seedBase(tx: Tx): Promise<Fixture> {
  await tx.asOwner();
  const a = await org(tx, "كريم معرفة", "kareem", "KM", "kareem.example", [
    ["admin", "مشرف كريم"],
    ["mod", "منظم كريم"],
    ["sara", "سارة العتيبي"],
    ["yaman", "يمان رضا"],
  ]);
  const b = await org(tx, "مؤسسة أخرى", "other", "OT", "other.example", [
    ["admin", "مشرف أخرى"],
    ["mod", "منظم أخرى"],
    ["nora", "نورة"],
  ]);
  const strangerEmail = "someone@nowhere.example";
  const stranger = { authUserId: await authUser(tx, strangerEmail, "غريب"), email: strangerEmail };
  const paEmail = "platform@kareem-platform.example";
  const platformAdmin = { authUserId: await authUser(tx, paEmail, "مدير المنصة"), email: paEmail };
  await tx.q(`insert into public.platform_admins (auth_user_id) values ($1)`, [platformAdmin.authUserId]);
  // Every isolation assertion needs rows on BOTH sides for every table.
  for (const o of [a, b]) {
    await tx.q(`insert into public.member_interests (org_id, member_id, category_id) values ($1, $2, $3)`, [o.id, o.members[0].memberId, o.categoryId]);
    await tx.q(`insert into public.scoring_config_history (org_id, scope, field, old_value, new_value) values ($1, 'org_settings', 'time_zone', '"x"', '"y"')`, [o.id]);
    await tx.q(`insert into public.audit_log (org_id, actor_id, actor_role, action) values ($1, $2, 'admin', 'fixture.seeded')`, [o.id, o.admin.memberId]);
    await tx.q(`insert into public.audit_log (org_id, actor_id, actor_role, action) values ($1, $2, 'moderator', 'fixture.seeded')`, [o.id, o.mod.memberId]);
  }
  return { a, b, stranger, platformAdmin };
}
