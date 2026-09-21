// M3 rows on both orgs (migration 0026), so the isolation sweep is never
// vacuous for a notify table and every per-policy case has something to
// read. Built as the owner inside the caller's transaction, after the M2 rows.
//
// Per org: members[0] has one unread inbox notification about the published
// session, one preference row (email off for `social`), one calendar
// connection (tokens set — the sweep proves no role can select them) and one
// synced calendar event for the published session; the org has one Arabic
// email template and one delivered email to members[0]. `notify()` itself is
// exercised by tests/rls/notify-contract.test.ts; the fixture inserts rows
// directly because it arranges history, not behaviour.

import type { Tx } from "./db";
import type { M2Fixture, M2Org } from "./fixture-m2";
import type { Org } from "./fixture";

export interface M3Org {
  notificationId: string;
  preferenceId: string;
  templateId: string;
  deliveryId: string;
  connectionId: string;
  calendarEventId: string;
}

export interface M3Fixture extends M2Fixture {
  m3: { a: M3Org; b: M3Org };
}

async function orgRows(tx: Tx, o: Org, m2: M2Org): Promise<M3Org> {
  const member = o.members[0];
  const q = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => tx.q<T>(sql, params);

  const notificationId = (
    await q<{ id: string }>(
      `insert into public.notifications (org_id, member_id, key, payload, session_id)
       values ($1, $2, 'MSG-session_published', jsonb_build_object('session_id', $3::uuid, 'title', 'جلسة منشورة'), $3)
       returning id`,
      [o.id, member.memberId, m2.published],
    )
  )[0].id;

  const preferenceId = (
    await q<{ id: string }>(
      `insert into public.notification_preferences (org_id, member_id, category, channel, enabled)
       values ($1, $2, 'social', 'email', false) returning id`,
      [o.id, member.memberId],
    )
  )[0].id;

  const templateId = (
    await q<{ id: string }>(
      `insert into public.notification_templates (org_id, key, channel, locale, subject, body, required_fields)
       values ($1, 'MSG-session_published', 'email', 'ar', 'جلسة جديدة: {{title}}',
               'مرحبًا {{member.name}}، نُشرت جلسة {{title}}.', '{member.name,title}')
       returning id`,
      [o.id],
    )
  )[0].id;

  const deliveryId = (
    await q<{ id: string }>(
      `insert into public.email_deliveries (org_id, member_id, notification_id, key, provider_message_id, status, sent_at, delivered_at)
       values ($1, $2, $3, 'MSG-session_published', $4, 'delivered', now() - interval '1 hour', now() - interval '59 minutes')
       returning id`,
      [o.id, member.memberId, notificationId, `sink-${o.slug}-${notificationId.slice(0, 8)}`],
    )
  )[0].id;

  const connectionId = (
    await q<{ id: string }>(
      `insert into public.calendar_connections (org_id, member_id, provider, access_token_encrypted, refresh_token_encrypted, expires_at, scope)
       values ($1, $2, 'google', 'enc:access-token-never-readable', 'enc:refresh-token-never-readable',
               now() + interval '1 hour', 'https://www.googleapis.com/auth/calendar.events')
       returning id`,
      [o.id, member.memberId],
    )
  )[0].id;

  const calendarEventId = (
    await q<{ id: string }>(
      `insert into public.calendar_events (org_id, member_id, session_id, provider_event_id, state, last_synced_at)
       values ($1, $2, $3, $4, 'synced', now() - interval '30 minutes') returning id`,
      [o.id, member.memberId, m2.published, `gcal-${o.slug}-${m2.published.slice(0, 8)}`],
    )
  )[0].id;

  return { notificationId, preferenceId, templateId, deliveryId, connectionId, calendarEventId };
}

/** Adds the M3 rows to an M2 fixture. Call as the owner; returns to the owner. */
export async function seedM3(tx: Tx, f: M2Fixture): Promise<M3Fixture> {
  await tx.asOwner();
  const a = await orgRows(tx, f.a, f.m2.a);
  const b = await orgRows(tx, f.b, f.m2.b);
  return { ...f, m3: { a, b } };
}
