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
import { seedM6 } from "./fixture-m6";
import { seedM7, type M7Fixture } from "./fixture-m7";

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
  // wave 27 (0203, REQ-PRF-012): each org's company carries one domain — deliberately NOT the org's own, so no fixture
  // sign-in is placed by it; the isolation sweep meets a real row of org B behind the wall.
  await tx.q(`insert into public.company_domains (org_id, company_id, domain) values ($1, $2, $3)`, [o.id, c.id, `co.${domain}`]);
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
export async function seed(tx: Tx): Promise<M7Fixture> {
  const f = await seedM7(tx, await seedM6(tx, await seedM5(tx, await seedM4(tx, await seedM3(tx, await seedM2(tx, await seedBase(tx)))))));
  // wave 16 (0162, DEC-197): each org's first member has a mark of what they have seen, so the isolation
  // sweep meets a real row of org B behind the wall — and org A's member sees their own.
  await tx.asOwner();
  for (const org of [f.a, f.b]) {
    await tx.q(`insert into public.member_seen_marks (member_id, org_id, points_total, all_time_rank, company_id) values ($1, $2, 680, 5, $3)`, [org.members[0].memberId, org.id, org.companyId]);
    // wave 18 (0164, DEC-206 §3): one published announcement per org, so the sweep meets org B's behind the wall.
    await tx.q(`insert into public.feed_announcements (org_id, author_id, body) values ($1, $2, $3)`, [org.id, org.admin.memberId, `إعلان ${org.slug}`]);
  }
  // wave 26 (0198, DEC-248 §5): each org's published session has a story — a generated frame and an attendee's
  // video — with a view, a reaction and a removal request, so the sweep meets a real row of org B in all four tables.
  for (const [org, m2] of [[f.a, f.m2.a], [f.b, f.m2.b]] as const) {
    const [{ id: frame }] = await tx.q<{ id: string }>(
      `insert into public.story_frames (org_id, session_id, kind, trigger_key, triggered_at) values ($1, $2, 'published', 'published', now() - interval '1 hour') returning id`,
      [org.id, m2.published],
    );
    const [{ id: video }] = await tx.q<{ id: string }>(
      `insert into public.story_frames (org_id, session_id, kind, trigger_key, triggered_at, author_id, caption, video_path, poster_path, duration_ms)
       values ($1, $2, 'video', gen_random_uuid()::text, now() - interval '30 minutes', $3, 'من القاعة', $4, $5, 12000) returning id`,
      [org.id, m2.published, org.mod.memberId, `${org.id}/sessions/${m2.published}/frames/x/video.mp4`, `${org.id}/sessions/${m2.published}/frames/x/poster.webp`],
    );
    await tx.q(`insert into public.story_views (org_id, member_id, frame_id) values ($1, $2, $3)`, [org.id, org.members[0].memberId, frame]);
    await tx.q(`insert into public.story_reactions (org_id, frame_id, member_id, kind) values ($1, $2, $3, 'clap')`, [org.id, frame, org.members[0].memberId]);
    await tx.q(`insert into public.story_frame_takedowns (org_id, frame_id, requester_id) values ($1, $2, $3)`, [org.id, video, org.members[0].memberId]);
  }
  return f;
}

/** A per-run token on the two slugs. `orgs.slug` is unique platform-wide, and
 *  the drill (tests/rls/platform-alerts.test.ts) is run against PRODUCTION at
 *  Launch inside a rolled-back transaction: on Launch day the real org
 *  `kareem` already existed there and every case failed on
 *  `orgs_slug_key` before seeding anything (DEC-062). Every other fixture row
 *  is org-scoped or randomly keyed; the slug was the one global literal. */
const RUN = randomUUID().slice(0, 8);

export async function seedBase(tx: Tx): Promise<Fixture> {
  await tx.asOwner();
  const a = await org(tx, "كريم معرفة", `kareem-${RUN}`, "KM", "kareem.example", [
    ["admin", "مشرف كريم"],
    ["mod", "منظم كريم"],
    ["sara", "سارة العتيبي"],
    ["yaman", "يمان رضا"],
  ]);
  const b = await org(tx, "مؤسسة أخرى", `other-${RUN}`, "OT", "other.example", [
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
