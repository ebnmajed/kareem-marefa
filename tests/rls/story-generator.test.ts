// Wave 26, PR D — the story generator and the feed's reads (supabase/proposed/sessions/01_story_generator.sql,
// 02_story_feed.sql; REQ-STO-001, 002, 003, 004, 006, 018; DEC-248 §5, DEC-251 §4).
//
// ★ Each of the eight triggers fired twice leaves ONE frame — the idempotency is `story_frames_one_per_trigger`
// (0198), and every path is driven as the role that drives it in the product: the admin's publish, the worker's clock
// (service_role), the worker's photo record, the presenter's material. The definer hooks are tested as those callers,
// never as the owner; the owner only arranges time and state.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";
import type { M2Fixture } from "./fixture-m2";

afterAll(() => pool.end());

async function setup(tx: Tx): Promise<M2Fixture> {
  const f = (await seed(tx)) as unknown as M2Fixture;
  await applyProposed(tx, "sessions/01_story_generator.sql");
  await applyProposed(tx, "sessions/02_story_feed.sql");
  await tx.asOwner();
  return f;
}

const framesOf = async (tx: Tx, session: string, kind?: string) => {
  await tx.asOwner();
  return tx.q<{ kind: string; trigger_key: string; session_day_id: string | null; photo_id: string | null; triggered_at: Date }>(
    `select kind::text as kind, trigger_key, session_day_id, photo_id, triggered_at from public.story_frames
      where session_id = $1 ${kind ? "and kind = $2" : ""} order by triggered_at, trigger_key`,
    kind ? [session, kind] : [session],
  );
};

const clock = async (tx: Tx, at?: string) => {
  await tx.asServiceRole();
  const [{ n }] = await tx.q<{ n: number }>(at ? `select public.clock_story_frames(${at}) as n` : `select public.clock_story_frames() as n`);
  await tx.asOwner();
  return n;
};

const daysOf = (tx: Tx, session: string) =>
  tx.q<{ id: string; starts_at: Date; ends_at: Date }>(`select id, starts_at, ends_at from public.session_days where session_id = $1 order by starts_at`, [session]);

/** Moves the fixture's published session to start `fromMin` minutes from now, for `lenMin`, its deadline at the start. */
async function moveTo(tx: Tx, session: string, fromMin: number, lenMin: number) {
  await tx.asOwner();
  await tx.q(
    `update public.sessions
        set rsvp_deadline_at = now() + ($2 || ' minutes')::interval,
            cancellation_cutoff_at = now() + ($2 || ' minutes')::interval,
            starts_at = now() + ($2 || ' minutes')::interval,
            ends_at   = now() + ($2 || ' minutes')::interval + ($3 || ' minutes')::interval
      where id = $1`,
    [session, String(fromMin), String(lenMin)],
  );
}

describe("trigger 1 — published (REQ-STO-001)", () => {
  it("the admin's publish writes one frame with no author; publishing again and a second generate write nothing", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      await tx.q(`select public.publish_session($1)`, [f.m2.a.draft]);
      await tx.q(`select public.publish_session($1)`, [f.m2.a.draft]);
      const rows = await framesOf(tx, f.m2.a.draft, "published");
      expect(rows.map((r) => r.trigger_key)).toEqual(["published"]);
      const [{ author_id }] = await tx.q<{ author_id: string | null }>(`select author_id from public.story_frames where session_id = $1`, [f.m2.a.draft]);
      expect(author_id).toBeNull();
      const [{ id }] = await tx.q<{ id: string | null }>(`select public.generate_story_frame($1, 'published', 'published', now()) as id`, [f.m2.a.draft]);
      expect(id).toBeNull();
      expect(await framesOf(tx, f.m2.a.draft, "published")).toHaveLength(1);
    });
  });
});

describe("triggers 5 and 7 — live and the recap, one-day (n = 1)", () => {
  it("the clock's start writes one live frame keyed on the day; the minutely clock finds it and writes no second", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const s = f.m2.a.published;
      await moveTo(tx, s, -10, 60);
      const [day] = await daysOf(tx, s);
      await tx.asServiceRole();
      await tx.q(`select public.clock_start_sessions()`);
      await tx.q(`select public.clock_start_sessions()`);
      await clock(tx);
      await clock(tx);
      const live = await framesOf(tx, s, "live");
      expect(live.map((r) => [r.trigger_key, r.session_day_id])).toEqual([[day.id, day.id]]);
    });
  });

  it("completion writes one recap; archive and reopen write no second", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const s = f.m2.a.published;
      await moveTo(tx, s, -30, 20);
      await tx.asServiceRole();
      await tx.q(`select public.clock_start_sessions()`);
      await tx.q(`select public.clock_complete_sessions()`);
      await tx.q(`select public.clock_complete_sessions()`);
      await tx.asOwner();
      await tx.q(`update public.sessions set state = 'archived' where id = $1`, [s]);
      await tx.q(`update public.sessions set state = 'completed' where id = $1`, [s]);
      expect((await framesOf(tx, s, "recap")).map((r) => r.trigger_key)).toEqual(["completed"]);
    });
  });
});

describe("triggers 2 and 3 — registration, only when it does not coincide (DEC-251 §4.3)", () => {
  it("no priority window: no registration_opened frame; with one, exactly one, at the window's end", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const s = f.m2.a.published; // published_at = now() − 1 day (fixture-m2)
      await clock(tx);
      expect(await framesOf(tx, s, "registration_opened")).toEqual([]);

      await tx.q(`update public.perks set enabled = true where org_id = $1 and key = 'priority_rsvp'`, [f.a.id]);
      await tx.q(`update public.org_settings set priority_rsvp_hours = 1 where org_id = $1`, [f.a.id]);
      await clock(tx);
      await clock(tx);
      const rows = await framesOf(tx, s, "registration_opened");
      expect(rows).toHaveLength(1);
      const [{ expected }] = await tx.q<{ expected: Date }>(`select published_at + interval '1 hour' as expected from public.sessions where id = $1`, [s]);
      expect(rows[0].triggered_at).toEqual(expected);
    });
  });

  it("the default deadline IS the start: no registration_closed; a deadline before the start writes one, once", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const s = f.m2.a.published;
      await clock(tx, `now() + interval '25 hours'`);
      expect(await framesOf(tx, s, "registration_closed")).toEqual([]);

      await tx.q(`update public.sessions set rsvp_deadline_at = now() - interval '1 minute' where id = $1`, [s]);
      await clock(tx);
      await clock(tx);
      expect(await framesOf(tx, s, "registration_closed")).toHaveLength(1);
    });
  });
});

describe("triggers 4 and 5 at n days — one per day (DEC-251 §4.4)", () => {
  it("a three-day workshop writes three starts_soon and three live frames, each once", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const s = f.m2.a.draft; // starts in 72 hours, one day
      for (const [from, to] of [
        [96, 97],
        [120, 121],
      ]) {
        await tx.q(
          `insert into public.session_days (org_id, session_id, position, starts_at, ends_at, venue_id)
           values ($1, $2, 1, now() + ($3 || ' hours')::interval, now() + ($4 || ' hours')::interval, $5)`,
          [f.a.id, s, String(from), String(to), f.a.venueId],
        );
      }
      await tx.as(f.a.admin.claims);
      await tx.q(`select public.publish_session($1)`, [s]);
      const days = await daysOf(tx, s);
      expect(days).toHaveLength(3);

      for (const d of days) {
        for (let i = 0; i < 2; i++) await clock(tx, `'${d.starts_at.toISOString()}'::timestamptz - interval '23 hours'`);
      }
      const soon = await framesOf(tx, s, "starts_soon");
      expect(soon.map((r) => r.session_day_id)).toEqual(days.map((d) => d.id));

      // The session runs from its first day; day 1's live is the state trigger's, days 2 and 3 the clock's.
      await tx.q(`update public.sessions set state = 'in_progress' where id = $1`, [s]);
      for (const d of days) {
        for (let i = 0; i < 2; i++) await clock(tx, `'${d.starts_at.toISOString()}'::timestamptz + interval '10 minutes'`);
      }
      const live = await framesOf(tx, s, "live");
      expect(live.map((r) => r.trigger_key).sort()).toEqual(days.map((d) => d.id).sort());
    });
  });
});

describe("trigger 6 — a photograph becomes visible (DEC-251 §4.1)", () => {
  const record = (tx: Tx, f: M2Fixture, id: string) =>
    tx.q(`select public.record_photo_upload($1, $2, $3, $4, $5, 2048, $6)`, [
      id,
      f.a.id,
      f.m2.a.completed,
      f.a.members[1].memberId,
      `${f.a.id}/sessions/${f.m2.a.completed}/photos/${id}.jpg`,
      "b".repeat(64),
    ]);

  it("the worker's record writes one photo frame naming the photograph; a second record, a hide and a restore write none", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const [{ id }] = await tx.q<{ id: string }>(`select gen_random_uuid() as id`);
      await tx.asServiceRole();
      await record(tx, f, id);
      await record(tx, f, id);
      await tx.asOwner();
      await tx.q(`update public.photos set hidden_at = now(), hidden_reason = 'takedown' where id = $1`, [id]);
      await tx.q(`update public.photos set hidden_at = null, hidden_reason = null where id = $1`, [id]);
      expect((await framesOf(tx, f.m2.a.completed, "photo")).map((r) => [r.trigger_key, r.photo_id])).toEqual([[id, id]]);
    });
  });

  it("a hidden photograph's frame is not a member's to read, and returns with it", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const [{ id }] = await tx.q<{ id: string }>(`select gen_random_uuid() as id`);
      await tx.asServiceRole();
      await record(tx, f, id);
      await tx.asOwner();
      await tx.q(`update public.photos set hidden_at = now(), hidden_reason = 'takedown' where id = $1`, [id]);
      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select frame_id from public.story_feed() where photo_id = $1`, [id])).toEqual([]);
      await tx.asOwner();
      await tx.q(`update public.photos set hidden_at = null, hidden_reason = null where id = $1`, [id]);
      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select frame_id from public.story_feed() where photo_id = $1`, [id])).toHaveLength(1);
    });
  });
});

describe("trigger 8 — materials added, once per session per org-local day", () => {
  const link = async (tx: Tx, f: M2Fixture, session: string, phase: "before" | "after") => {
    await tx.as(f.a.members[0].claims); // the presenter, as under p8_presenter_write
    await tx.q(
      `insert into public.materials (org_id, session_id, kind, title, external_url, added_by, phase)
       values ($1, $2, 'external_link', 'تسجيل الجلسة', 'https://example.com/recording', $3, $4)`,
      [f.a.id, session, f.a.members[0].memberId, phase],
    );
    await tx.asOwner();
  };

  it("two links on a completed session the same day make one frame", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await link(tx, f, f.m2.a.completed, "after");
      await link(tx, f, f.m2.a.completed, "after");
      const rows = await framesOf(tx, f.m2.a.completed, "materials");
      expect(rows).toHaveLength(1);
      expect(rows[0].trigger_key).toMatch(/^materials:\d{4}-\d{2}-\d{2}$/);
    });
  });

  it("a «بعد» material before completion is not yet a member's, so it makes no frame; a «قبل» one does", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await link(tx, f, f.m2.a.published, "after");
      expect(await framesOf(tx, f.m2.a.published, "materials")).toEqual([]);
      await link(tx, f, f.m2.a.published, "before");
      expect(await framesOf(tx, f.m2.a.published, "materials")).toHaveLength(1);
    });
  });
});

describe("cancelling ends the story (REQ-STO-018)", () => {
  it("the generator writes nothing for a cancelled session, and the feed shows staff none of its frames", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const s = f.m2.a.published;
      await tx.q(`update public.sessions set state = 'cancelled', cancelled_at = now(), cancellation_reason = 'تعذّر الحضور' where id = $1`, [s]);
      const [{ id }] = await tx.q<{ id: string | null }>(`select public.generate_story_frame($1, 'materials', 'materials:x', now()) as id`, [s]);
      expect(id).toBeNull();
      await tx.as(f.a.admin.claims);
      expect((await tx.q(`select 1 from public.story_frames where session_id = $1`, [s])).length).toBeGreaterThan(0); // staff read
      expect(await tx.q(`select 1 from public.story_feed() where session_id = $1`, [s])).toEqual([]);
    });
  });
});

describe("story_feed() — the member's view, for everyone (REQ-STO-002, 003, 006)", () => {
  it("a member reads their org's visible frames, unseen until they view one, and no other org's", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.members[1].claims);
      const rows = await tx.q<{ frame_id: string; kind: string; seen: boolean }>(`select frame_id, kind::text as kind, seen from public.story_feed() order by kind::text`);
      expect(rows.map((r) => [r.kind, r.seen])).toEqual([
        ["published", false],
        ["video", false],
      ]);
      await tx.q(`insert into public.story_views (org_id, member_id, frame_id) values ($1, $2, $3)`, [f.a.id, f.a.members[1].memberId, rows[0].frame_id]);
      expect((await tx.q<{ seen: boolean }>(`select seen from public.story_feed() where frame_id = $1`, [rows[0].frame_id]))[0].seen).toBe(true);

      await tx.as(f.b.members[0].claims);
      expect(await tx.q(`select 1 from public.story_feed() where session_id = $1`, [f.m2.a.published])).toEqual([]);
    });
  });

  it("★ staff, whose policy admits expired frames, read the same 24 hours a member does", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.q(`update public.story_frames set triggered_at = now() - interval '24 hours' where org_id = $1 and kind = 'published'`, [f.a.id]);
      await tx.as(f.a.admin.claims);
      expect(await tx.q(`select kind::text as kind from public.story_feed() where kind = 'published'`)).toEqual([]);
      expect(await tx.q(`select kind::text as kind from public.story_feed(now() - interval '1 hour') where kind = 'published'`)).toHaveLength(1);
    });
  });

  it("an author's own processing video reaches the author's feed and nobody else's", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.q(`update public.story_frames set state = 'processing' where org_id = $1 and kind = 'video'`, [f.a.id]);
      const [{ author }] = await tx.q<{ author: string }>(`select author_id as author from public.story_frames where org_id = $1 and kind = 'video'`, [f.a.id]);
      const authorPerson = [...f.a.members, f.a.admin, f.a.mod].find((p) => p.memberId === author);
      const other = f.a.members.find((p) => p.memberId !== author);
      await tx.as(authorPerson!.claims);
      expect(await tx.q(`select state::text as state from public.story_feed() where kind = 'video'`)).toEqual([{ state: "processing" }]);
      await tx.as(other!.claims);
      expect(await tx.q(`select 1 from public.story_feed() where kind = 'video'`)).toEqual([]);
    });
  });
});

describe("story_recap_figures() and story_live_count() — numbers, never who", () => {
  it("the rating is withheld below the org's minimum and shown at it; another org gets no row", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.members[1].claims);
      const [withheld] = await tx.q<{ attended: number; rating_count: number; rating_avg: string | null; rating_min: number }>(
        `select * from public.story_recap_figures($1)`,
        [f.m2.a.completed],
      );
      expect(withheld).toEqual({ attended: 1, rating_count: 1, rating_avg: null, rating_min: 3 });
      await tx.asOwner();
      await tx.q(`update public.org_settings set rating_min_aggregate = 1 where org_id = $1`, [f.a.id]);
      await tx.as(f.a.members[1].claims);
      const [shown] = await tx.q<{ rating_avg: string }>(`select rating_avg from public.story_recap_figures($1)`, [f.m2.a.completed]);
      expect(Number(shown.rating_avg)).toBe(5);
      expect(await tx.q(`select * from public.story_recap_figures($1)`, [f.m2.a.draft])).toEqual([]);
      await tx.as(f.b.members[0].claims);
      expect(await tx.q(`select * from public.story_recap_figures($1)`, [f.m2.a.completed])).toEqual([]);
    });
  });

  it("a day's live count is a number for the org and null for another", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const [day] = await daysOf(tx, f.m2.a.published);
      await tx.as(f.a.members[1].claims);
      const [{ n }] = await tx.q<{ n: number | null }>(`select public.story_live_count($1, $2) as n`, [f.m2.a.published, day.id]);
      expect(n).toBe(1);
      await tx.as(f.b.members[0].claims);
      const [{ n: other }] = await tx.q<{ n: number | null }>(`select public.story_live_count($1, $2) as n`, [f.m2.a.published, day.id]);
      expect(other).toBeNull();
    });
  });
});

describe("who may call what", () => {
  it("no client role and not the worker may call the generator; only the worker may run the clock", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select public.generate_story_frame($1, 'published', 'x', now())`, [f.m2.a.published]))).toBe(PERMISSION_DENIED);
      expect(await errorCode(() => tx.q(`select public.clock_story_frames()`))).toBe(PERMISSION_DENIED);
      await tx.asServiceRole();
      expect(await errorCode(() => tx.q(`select public.generate_story_frame($1, 'published', 'x', now())`, [f.m2.a.published]))).toBe(PERMISSION_DENIED);
      await tx.asAnon();
      expect(await errorCode(() => tx.q(`select * from public.story_feed()`))).toBe(PERMISSION_DENIED);
    });
  });
});
