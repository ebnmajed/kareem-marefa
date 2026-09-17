# 05 — Scoring Engine

**Status:** `draft` · **Serves:** `REQ-PTS-001` … `REQ-PTS-014`, `REQ-LDR-001` … `REQ-LDR-008`,
`REQ-REC-001` … `REQ-REC-009`
**Cites:** `02-domain-model.md` (frozen), `03-permissions-rls.md`

> Two properties govern every design choice here: **any balance must be recomputable from the
> ledger** (`REQ-PTS-011`), and **an org admin must be able to reconfigure everything without a
> deploy** (`REQ-PTS-014`). Everything below follows from those two.

---

## 1. The action catalogue

**The catalogue is code. Its values are data.** (`REQ-PTS-010`.)

That split is the anti-gaming mechanism. An org admin can set any point value, cap or cooldown; an
org admin **cannot add an action**. So `rsvp` and `reaction` are not "set to zero by default" —
they are **absent from the catalogue**, and no configuration can bring them back. D42's rules are
structural rather than a default someone can talk themselves out of.

### 1.1 Attendee actions — `point_actor = 'attendee'`

| `action_key` | العربية | Default | Cap | Trigger | Source |
|---|---|---|---|---|---|
| `check_in` | تسجيل حضور مؤكَّد | **20** | — | `check_ins` insert | `REQ-CHK-009`, A10 |
| `rating_submitted` | تقييم جلسة | **5** | 1/session | `ratings` insert | A10 |
| `comment` | تعليق | **2** | **5/session** | `comments` insert | A10, `REQ-PTS-006` |
| `photo` | صورة | **3** | **5/session** | `photos` insert | A10, `REQ-PTS-006` |
| `streak_month` | سلسلة الشهر | **15** | 1/month | streak job | A10, `REQ-REC-005` |

### 1.2 Presenter actions — `point_actor = 'presenter'`

| `action_key` | العربية | Default | Cap | Trigger |
|---|---|---|---|---|
| `proposal_accepted` | قبول مقترح | **10** | — | proposal → `approved` |
| `session_delivered` | تقديم جلسة | **50** | — | session → `completed` |
| `attendee_bonus` | مكافأة لكل حاضر | **2** each | **60** | session → `completed` |
| `rating_bonus` | مكافأة التقييم العالي | **20** | 1/session | avg ≥ 4.0 with ≥ 5 ratings |
| `materials_uploaded` | رفع المواد بعد الجلسة | **10** | 1/session | first `after`-phase material post-completion |

### 1.3 Negative actions — present, **enabled**, and worth **0** (D40, `REQ-PTS-008`)

| `action_key` | العربية | Default | Trigger |
|---|---|---|---|
| `no_show` | تغيّب بعد الحجز | **0** | confirmed RSVP, no check-in, at `completed` (OQ-004) |
| `late_cancellation` | إلغاء متأخر | **0** | cancel after the cutoff |
| `comment_removed` | حُذف تعليق | **0** | moderator removal |
| `photo_removed` | حُذفت صورة | **0** | moderator removal |

They ship `enabled = true` with `points = 0` rather than `enabled = false`, so the ledger records
the **event** whether or not the org penalises it (`REQ-RSV-007`). An org turning on a penalty then
changes one number, and gets a history of the events that would have been penalised — which is what
an admin actually wants before deciding.

### 1.4 Never in the catalogue

**`rsvp` · `reaction` · `view` · `bookmark` · `task_completion`.** D42 and D30. Not configurable,
not present, not addable.

### 1.5 The co-presenter multiplier, stated honestly

A5 gives every presenter full presenter points. A two-presenter session therefore costs
2 × (50 + up to 60 + 20 + 10) = up to **280** points rather than 140.

**That is intended** — co-presenting is not half a job — but it is a real inflation lever, which is
why **OQ-021 caps co-presenters at 4** (org-configurable). Uncapped, a "panel" of twelve is an
unbounded points multiplier and twelve certificates.

---

## 2. The ledger

`ENT-points_ledger`. **Append-only at the database**: `revoke update, delete` from `anon`,
`authenticated` **and `service_role`** (`03` §5.7a). Not even the worker can rewrite history.

### 2.1 Idempotency keys

```
<rule_key>:<source>:<source_id>:<member_id>:<epoch>
```

Examples:
```
check_in:check_in:8f3a…:2b1c…:v1
attendee_bonus:session_delivered:d4e5…:9a7b…:v1
streak_month:streak:2026-09:9a7b…:v1
```

`unique (idempotency_key)` plus `on conflict do nothing` — **the only conflict action compatible
with an append-only table**, since `do update` would be a rewrite.

★ **For the `check_in` rule the epoch is mechanical since wave 9 (`DEC-155`, `0113`).** Attendance
is awarded **once per member per session** (`REQ-SES-017`), so its key is
`check_in:check_in:<the check-in on the last day attended>:<member>:v<N>`, where **`N` is one more
than the member's reversed attendance awards for that session**. The first award is `v1` — the key
this section has always shown — and an award after an admin's removal and re-add (`REQ-CHK-017`) is
`v2`, with no dependence on a timestamp. It is the **second** line of defence: the award is first
guarded by «no attendance award for this session and member still stands», under a lock
(`DEC-151`). **For every other rule the epoch is exactly what the next paragraph says**, and §4.3's
deliberate re-award of `check_in`, should one ever be needed, takes a prefix of its own rather than
this suffix.

**The epoch suffix is the important part.** Every accidental replay — a retried job, a duplicated
webhook, a double-click — collides and writes nothing. A **deliberate** recompute is a different
act: bump the epoch to `v2` and the same events produce new rows. So the system can tell the
difference between "this ran twice by mistake" and "we decided to re-award this", which a plain
unique constraint cannot.

### 2.2 Awarding

```sql
create function award_points(p_rule text, p_member uuid, p_source ledger_source,
                             p_source_id uuid, p_session uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.scoring_rules; used int; amount int; key text;
begin
  select * into r from public.scoring_rules
   where org_id = (select org_id from public.members where id = p_member)
     and action_key = p_rule;
  if r is null or not r.enabled then return; end if;

  -- cap (REQ-PTS-006)
  if r.cap_per_session is not null and p_session is not null then
    select coalesce(sum(amount),0) into used from public.points_ledger
     where member_id = p_member and session_id = p_session and rule_key = p_rule;
    if used >= r.cap_per_session * r.points then return; end if;
  end if;

  -- cooldown (REQ-PTS-007): inside the window, award nothing and fail nothing
  if r.cooldown is not null and exists (
       select 1 from public.points_ledger
        where member_id = p_member and rule_key = p_rule
          and occurred_at > now() - r.cooldown) then
    return;
  end if;

  key := format('%s:%s:%s:%s:v1', p_rule, p_source, p_source_id, p_member);

  insert into public.points_ledger (org_id, member_id, amount, source, source_id, session_id,
                                    reason, rule_key, rule_version, idempotency_key)
  values ((select org_id from public.members where id = p_member),
          p_member, r.points, p_source, p_source_id, p_session,
          r.reason_ar, p_rule, r.version, key)
  on conflict (idempotency_key) do nothing;      -- REQ-PTS-012
end $$;
```

Two behaviours worth stating: a capped or cooled-down award **returns silently** rather than
raising, because the member's action (posting the sixth comment) must succeed even though it earns
nothing; and `rule_version` is stamped onto the row, so a ledger entry always explains itself
against the configuration that produced it, not against today's (`REQ-PTS-004`).

### 2.3 Balances

`ENT-points_balances`, maintained by trigger (`02` §5 DDL).

**Why a rollup is safe here and would be a mistake almost anywhere else:** the ledger is
*insert-only*. The rollup is a pure left fold with nothing to un-apply — there is no update or
delete that could require reversing a contribution. That property is what makes the optimisation
sound, and it is why the ledger's `revoke update, delete` is not merely tidy: **the rollup's
correctness depends on it.**

A nightly job (`JOB-audit_balances`) re-derives every balance with `sum()` and compares via
`last_entry_id`, alerting on divergence (`REQ-PTS-011`). The rollup is an optimisation that must
always agree with the ledger; the ledger is the truth.

### 2.4 Reversal, never deletion

`REQ-PTS-013`, OQ-014. Removing a comment or photo writes a **compensating row**:

```
amount      = -(the original award)
source      = 'reversal'
source_id   = the original ledger row id
reason      = 'حُذف المحتوى'
idempotency = reversal:<original_ledger_id>:v1
```

The *penalty* (`comment_removed`) is a **separate** action, off by default. Two movements, both
visible in the member's history, both explainable:

- Without the reversal, deleting a comment after earning its points is free points.
- Without the separation, an org that wants no penalties still cannot avoid one.

---

## 3. Configuration

### 3.1 Schema

`ENT-scoring_rules`, one row per org per `action_key`. Editable: `points`, `enabled`,
`cap_per_session`, `cap_per_period`, `cap_period`, `cooldown`, `reason_ar`.
Not editable: `action_key`, `actor`.

Every write bumps `version` and appends to `ENT-scoring_config_history` with actor, timestamp, old
and new value (`REQ-PTS-005`) — inside the same transaction, so a change and its audit row commit
together.

### 3.2 What an org's configuration looks like

```json
{
  "org": "كريم معرفة",
  "version": 7,
  "rules": [
    { "action_key": "check_in",           "actor": "attendee",  "points": 20, "enabled": true,
      "reason_ar": "تسجيل حضور مؤكَّد" },
    { "action_key": "rating_submitted",   "actor": "attendee",  "points": 5,  "enabled": true,
      "cap_per_session": 1, "reason_ar": "تقييم جلسة" },
    { "action_key": "comment",            "actor": "attendee",  "points": 2,  "enabled": true,
      "cap_per_session": 5, "cooldown": "60 seconds", "reason_ar": "تعليق" },
    { "action_key": "photo",              "actor": "attendee",  "points": 3,  "enabled": true,
      "cap_per_session": 5, "reason_ar": "صورة من الجلسة" },
    { "action_key": "streak_month",       "actor": "attendee",  "points": 15, "enabled": true,
      "reason_ar": "سلسلة: ٣ حضور في الشهر" },

    { "action_key": "proposal_accepted",  "actor": "presenter", "points": 10, "enabled": true,
      "reason_ar": "قبول مقترح" },
    { "action_key": "session_delivered",  "actor": "presenter", "points": 50, "enabled": true,
      "reason_ar": "تقديم جلسة" },
    { "action_key": "attendee_bonus",     "actor": "presenter", "points": 2,  "enabled": true,
      "cap_per_session": 30, "reason_ar": "مكافأة لكل حاضر" },
    { "action_key": "rating_bonus",       "actor": "presenter", "points": 20, "enabled": true,
      "cap_per_session": 1, "reason_ar": "تقييم عالٍ للجلسة" },
    { "action_key": "materials_uploaded", "actor": "presenter", "points": 10, "enabled": true,
      "cap_per_session": 1, "reason_ar": "رفع مواد الجلسة" },

    { "action_key": "no_show",            "actor": "attendee",  "points": 0,  "enabled": true,
      "reason_ar": "تغيّب بعد الحجز" },
    { "action_key": "late_cancellation",  "actor": "attendee",  "points": 0,  "enabled": true,
      "reason_ar": "إلغاء متأخر" },
    { "action_key": "comment_removed",    "actor": "attendee",  "points": 0,  "enabled": true,
      "reason_ar": "حُذف تعليق" },
    { "action_key": "photo_removed",      "actor": "attendee",  "points": 0,  "enabled": true,
      "reason_ar": "حُذفت صورة" }
  ]
}
```

`attendee_bonus` carries `cap_per_session: 30` because the cap is expressed in **award count**, and
30 × 2 points = A10's **60-point** ceiling. A10's cap is in points; the schema's is in occurrences.
Stated here because getting it backwards produces a cap that is wrong by a factor of the point
value, and nothing would visibly fail.

**`reason_ar` is Arabic in the configuration** because it is the string a member reads in their own
history (`REQ-PTS-003`). Arabic is the source language — there is no English original of these.

### 3.3 Changes apply forward only

Changing a value affects **future** awards. Historical rows keep their `rule_version` and their
amount (`REQ-PTS-004`). A member's balance is never silently rewritten by an admin editing a
number, which is what makes `REQ-PTS-003`'s promise — every point is explainable — survivable.

---

## 4. Recompute

### 4.1 Verify (nightly, non-destructive)

`JOB-audit_balances` recomputes every balance from the ledger and compares. Divergence alerts; it
does **not** self-heal, because a rollup that silently corrects itself hides the bug that caused
the divergence.

### 4.2 Rebuild the rollup (safe, no ledger writes)

`truncate points_balances; insert … select member_id, sum(amount) … group by member_id`. The ledger
is untouched, so this is always safe and is the first response to any divergence alert.

### 4.3 Re-award (deliberate, rare, epoch-bumped)

Needed when a rule was wrong and the org wants history corrected. Procedure:

1. Write a `DECISIONS.md` entry. Re-awarding changes members' balances; it is not a maintenance
   task.
2. Bump the epoch for the affected `rule_key` (`v1` → `v2`).
3. Replay the source events through `award_points()`. New keys, so new rows.
4. **Do not delete the old rows.** Write compensating reversals if the old award must be undone.

The ledger keeps both movements and the member sees both, with reasons. This is slower and more
visible than a `delete from points_ledger where rule_key = …`, which is exactly why the `revoke`
exists.

---

## 5. Badges, levels, streaks, perks

### 5.1 Badges — `REQ-REC-001`, `REQ-REC-002`

Eight ship enabled, all org-editable (OQ-011):

| `key` | العربية | Rule | Certificate? |
|---|---|---|---|
| `first_check_in` | أول حضور | first verified check-in | no |
| `first_session` | أول جلسة | first session delivered | no |
| `voice_heard` | صوت مسموع | 5 sessions delivered | **yes** |
| `regular` | حاضر دائم | 10 check-ins | no |
| `monthly_streak` | سلسلة الشهر | a full monthly streak | no |
| `trusted_opinion` | رأي يُعتد به | 20 ratings submitted | no |
| `rated_presenter` | مُقدِّم مُقيَّم | avg ≥ 4.5 over ≥ 3 sessions | **yes** |
| `annual` | كريم المعرفة السنوي | annual recognition | **yes** |

Only three carry certificates (OQ-020) — eight certificates for eight badges would devalue all
eight. `annual` is the badge behind the live marketing copy's promise of **«تكريم سنوي»**, which
is why it exists rather than being invented here.

Badge evaluation is idempotent via `unique (member_id, badge_id)`. Retiring a badge does not
revoke it (`REQ-REC-001`).

### 5.2 Levels — `REQ-REC-003`, `REQ-REC-004`

| # | العنوان | Points | Grants |
|---|---|---|---|
| 1 | **مشارِك** | 0 | — |
| 2 | **مشارِك نشِط** | 100 | — |
| 3 | **صاحب أثر** | 300 | **priority RSVP** |
| 4 | **كريم معرفة** | 700 | **hosting** (when the org gates it) |
| 5 | **سفير المعرفة** | 1500 | — |

Deliberately shaped: level 2 is one session attended plus a little; level 5 takes sustained
participation over a year. §6's guidance is explicit that early levels must be easy, later ones
progressively harder, and **levels must be tied to real privileges** — hence 3 and 4.

Level is derived from `points_balances.total_points` and cached in `current_level_id`. Lowering a
threshold promotes members immediately; raising one **does not demote** without an explicit admin
action (`REQ-REC-003`). Taking a level away from someone who earned it, because an admin adjusted a
number, is the kind of thing that ends participation in an internal initiative.

### 5.3 Streaks — `REQ-REC-005`

Default: **3 check-ins in a calendar month → 15 points**. Month boundaries use the **org's time
zone** (A20) — evaluating in UTC would move the boundary by three hours in `Asia/Riyadh` and
occasionally award the wrong month.

Idempotent by `unique (member_id, rule_id, period_start)` on `ENT-streak_awards`.

### 5.4 Perks — `REQ-REC-006` … `REQ-REC-008`

| `key` | Granted by | Default | Mechanics |
|---|---|---|---|
| `priority_rsvp` | level 3 | enabled | A 24-hour head start before general RSVP (OQ-012) |
| `can_host` | level 4 | **disabled** | Gates proposing; off unless the org turns it on |

**Priority RSVP is a head start, never a displacement** (`REQ-RSV-009`). A perk holder does not
take a seat from someone who has one, and does not jump an existing waitlist. Watching a confirmed
seat disappear is a worse experience than not getting one, and the perk keeps all its value as a
head start.

**`can_host` ships disabled** (`REQ-REC-008`) — gating who may propose is a serious cultural choice
for a knowledge-sharing initiative whose whole premise is «لست بحاجة لأن تكون خبيرًا». It is
available because D48 requires it, and off because the product's own copy argues against it.

Grants are **materialised** into `ENT-member_perks` and re-evaluated on level or badge change, so
the RSVP hot path is one indexed lookup rather than a recursive computation.

---

## 6. Leaderboards

### 6.1 The four boards

| Board | Computation | Frozen? |
|---|---|---|
| **All-time** (`REQ-LDR-001`) | Live from `points_balances` | No — it has no period, so no denominator problem |
| **Monthly / seasonal** (`REQ-LDR-002`) | Snapshot at period end | **Yes** |
| **Per-topic** (`REQ-LDR-003`) | Ledger rows with a `session_id`, grouped by that session's category | **Yes** |
| **سباق الشركات** (`REQ-LDR-004`) | Aggregated by `members.company_id` | **Yes**, denominator included |

Ledger rows with **no `session_id`** — manual adjustments, most badges — are **excluded** from
topic boards rather than assigned to an arbitrary category (`REQ-LDR-003`).

### 6.2 The company metric, and why the snapshot is mandatory

A11 requires both numbers shown and the admin to choose the ranking metric; the default is
**points per active member**, so a large شركة cannot win on headcount.

```
total_points            = Σ points of members whose company_id = C in [period_start, period_end)
points_per_active_member = total_points / active_member_count(C, at snapshot time)
```

**The denominator is time-dependent, and that is the whole problem.** Computed live, deactivating
one member **retroactively raises that company's score for every past period** — last quarter's
published standings change, and a certificate already issued to the winner (`REQ-CRT-012`) now
names the wrong company.

So `active_member_count` is **frozen into the snapshot** (`ENT-leaderboard_snapshots`,
`REQ-LDR-006`, DEC-016). Snapshots are required, not an optimisation.

**And it is still gameable**, so say so: shrinking the denominator raises the score. Two
containments — deactivation requires a **reason** and is audited (`REQ-AUT-008`), and both metrics
are always displayed (`REQ-LDR-004`), so a company with a suspiciously small active roster is
visible to everyone looking at the board.

### 6.3 Opting out

`REQ-LDR-008`. An opted-out member is filtered from others' view, still sees their own rank, and
**still counts toward their company's total** — so opting out cannot be used to protect a company
average, which would turn a privacy control into a tactic.

---

## 7. Manual adjustment

`REQ-PTS-009`, D41. An org admin adds or removes points with a **mandatory reason**, through an
`assert_fresh_admin()`-gated RPC that writes **both** the ledger row and the audit row in one
transaction.

```
amount      = ±n
source      = 'manual_adjustment'
actor_id    = the admin
reason      = mandatory, Arabic, member-visible
idempotency = manual:<uuid>:v1        -- a fresh uuid; manual adjustments are not deduplicated
```

**The member sees the adjustment and its reason** in their own history. An adjustment a member
cannot see or understand is exactly what `REQ-PTS-003` exists to prevent — points that appear
without explanation are the fastest way to lose trust in a scoring system.

---

## 8. Member-facing history

`/app/me/points` (`REQ-PTS-003`). Every row shows: the date, the amount signed and coloured, the
Arabic `reason`, and a link to the session or content that caused it. Filterable by session and by
month; the running balance reconciles to `points_balances`.

Four things the screen deliberately shows:

- **Zero-point rows.** A capped sixth comment writes no row — but the **cap** is explained in
  place: «بلغت الحد الأقصى للتعليقات في هذه الجلسة».
- **Reversals**, with their reason, next to the award they reverse.
- **Manual adjustments**, with the admin's reason.
- **What earns what**, read live from `scoring_rules` — so the explanation is never a hard-coded
  list that drifts from the configuration.

The test of this screen is `REQ-PTS-003`'s wording: a member must be able to explain every point
they hold **without asking anyone**.
