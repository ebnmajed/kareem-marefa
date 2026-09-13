// M2 rows on both orgs, so the isolation sweep is never vacuous for a table
// and every per-policy case has something to read. Built as the owner inside
// the caller's transaction (DEC-040, wave 0).
//
// Per org: one published session (presenter = members[0], a confirmed RSVP
// and a check-in by members[1], a live code, an attempt), one completed
// session (a check-in and a rating by members[1]), a draft proposal by
// members[0] with members[1] as co-presenter, a comment thread, a reaction,
// a report — and the transitions the RPCs will later write.

import type { Tx } from "./db";
import type { Fixture, Org } from "./fixture";

export interface M2Org {
  published: string;
  completed: string;
  draft: string;
  proposal: string;
  codeId: string;
  checkInPublished: string;
  checkInCompleted: string;
  commentId: string;
  replyId: string;
  ratingId: string;
}

export interface M2Fixture extends Fixture {
  m2: { a: M2Org; b: M2Org };
}

async function orgRows(tx: Tx, o: Org): Promise<M2Org> {
  const presenter = o.members[0];
  const attendee = o.members[1] ?? o.members[0];
  const q = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => tx.q<T>(sql, params);

  const session = async (title: string, state: string, offsetH: number) =>
    (
      await q<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                      venue_id, capacity, rsvp_deadline_at, cancellation_cutoff_at, state, published_at, completed_at)
         values ($1, $2, 'ملخص الجلسة', $3, 'introductory',
                 now() + ($4 || ' hours')::interval, 60, now() + ($4 || ' hours')::interval + interval '1 hour',
                 $5, 30, now() + ($4 || ' hours')::interval, now() + ($4 || ' hours')::interval,
                 $6::public.session_state,
                 case when $6 in ('published','in_progress','completed','archived') then now() - interval '1 day' end,
                 case when $6 = 'completed' then now() - interval '1 hour' end)
         returning id`,
        [o.id, title, o.categoryId, String(offsetH), o.venueId, state],
      )
    )[0].id;

  const published = await session(`جلسة منشورة — ${o.name}`, "published", 24);
  const completed = await session(`جلسة مكتملة — ${o.name}`, "completed", -48);
  const draft = await session(`مسودة — ${o.name}`, "draft", 72);

  for (const s of [published, completed, draft]) {
    await q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [o.id, s, presenter.memberId]);
    await q(`insert into public.session_state_transitions (org_id, session_id, from_state, to_state, actor_id, is_manual) values ($1, $2, null, 'draft', $3, true)`, [o.id, s, o.admin.memberId]);
  }

  const proposal = (
    await q<{ id: string }>(
      `insert into public.proposals (org_id, proposer_id, title, abstract, category_id, level, state)
       values ($1, $2, $3, 'فكرة جلسة', $4, 'intermediate', 'draft') returning id`,
      [o.id, presenter.memberId, `اقتراح — ${o.name}`, o.categoryId],
    )
  )[0].id;
  await q(`insert into public.proposal_presenters (org_id, proposal_id, member_id) values ($1, $2, $3)`, [o.id, proposal, attendee.memberId]);

  await q(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [o.id, published, attendee.memberId]);
  const codeId = (
    await q<{ id: string }>(
      `insert into public.check_in_codes (org_id, session_id, code, valid_from, valid_until)
       values ($1, $2, 'ACDEFG', now() - interval '1 minute', now() + interval '10 minutes') returning id`,
      [o.id, published],
    )
  )[0].id;
  await q(`insert into public.check_in_attempts (org_id, session_id, member_id, submitted_code, succeeded) values ($1, $2, $3, 'ACDEFG', true)`, [o.id, published, attendee.memberId]);
  const checkInPublished = (
    await q<{ id: string }>(
      `insert into public.check_ins (org_id, session_id, member_id, method, code_id, session_window)
       values ($1, $2, $3, 'code', $4, 'empty'::tstzrange) returning id`,
      [o.id, published, attendee.memberId, codeId],
    )
  )[0].id;
  const checkInCompleted = (
    await q<{ id: string }>(
      `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
       values ($1, $2, $3, 'manual', 'نسي هاتفه', $4, 'empty'::tstzrange) returning id`,
      [o.id, completed, attendee.memberId, o.admin.memberId],
    )
  )[0].id;

  const commentId = (
    await q<{ id: string }>(`insert into public.comments (org_id, session_id, author_id, body) values ($1, $2, $3, 'سؤال عن الجلسة') returning id`, [o.id, published, attendee.memberId])
  )[0].id;
  const replyId = (
    await q<{ id: string }>(`insert into public.comments (org_id, session_id, author_id, parent_id, body) values ($1, $2, $3, $4, 'إجابة') returning id`, [o.id, published, presenter.memberId, commentId])
  )[0].id;
  await q(`insert into public.reactions (org_id, comment_id, member_id, kind) values ($1, $2, $3, 'like')`, [o.id, commentId, presenter.memberId]);
  await q(`insert into public.reports (org_id, target, comment_id, reporter_id, reason) values ($1, 'comment', $2, $3, 'محتوى غير مناسب')`, [o.id, replyId, attendee.memberId]);

  const ratingId = (
    await q<{ id: string }>(
      `insert into public.ratings (org_id, session_id, member_id, check_in_id, session_stars, presenter_stars, comment)
       values ($1, $2, $3, $4, 5, 4, 'جلسة ممتازة') returning id`,
      [o.id, completed, attendee.memberId, checkInCompleted],
    )
  )[0].id;

  return { published, completed, draft, proposal, codeId, checkInPublished, checkInCompleted, commentId, replyId, ratingId };
}

/** Adds the M2 rows to a base fixture. Call as the owner; returns to the owner. */
export async function seedM2(tx: Tx, f: Fixture): Promise<M2Fixture> {
  await tx.asOwner();
  const a = await orgRows(tx, f.a);
  const b = await orgRows(tx, f.b);
  return { ...f, m2: { a, b } };
}
