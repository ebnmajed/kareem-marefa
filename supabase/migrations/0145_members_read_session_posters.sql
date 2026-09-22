-- 0145 · a member reads the poster of a session they can see.
-- Lead, wave 12 (DEC-172, REQ-UIX-026) — found by D1, the whole-poster demonstrable.
-- Serves: 03 §193 («read own session's poster»), REQ-DSG-001, REQ-UIX-026
--
-- ★ THE DEFECT. `exports_read` (0055) admits an artifact when
-- `exists (select 1 from design_documents d where d.id = document_id)` — and
-- that subquery runs under the caller's RLS, where `documents_read` shows a
-- session-bound document only to an org admin or that session's presenter. So
-- an ordinary member read ZERO poster renders: every timeline card and event
-- page fell back to the typographic placeholder, while an anonymous visitor to
-- /s/[id] saw the same poster through 0080's public-card path. Measured locally:
-- one org, a member 0 artifacts, an admin 2.
--
-- ★ THE FIX IS ONE MORE PERMISSIVE POLICY, nothing dropped (additive — main
-- runs on this schema first). A render is readable when its document IS a
-- session's poster (`session_posters`, P1 org read) and that session is one the
-- caller may read (`sessions_read` — published, in progress, completed,
-- archived or cancelled; a draft only to staff and its presenter). Both
-- subqueries run under the caller's RLS on purpose: the visibility of the
-- poster follows the visibility of the session, and nothing new decides it.
-- The design document itself stays admin/presenter-only; only its render is
-- read. `select` is already granted to `authenticated` (0055).
--
-- 03 §8.2 rows this adds:
--   | `POL-export_artifacts.select.session_poster` | A plain member reads the render of a published session's poster; a draft's stays hidden; another org — even its admin — reads nothing; a render of a document that is no session's poster stays admin-only. |

create policy "exports_read_session_poster" on public.export_artifacts for select to authenticated
  using (org_id = public.auth_org_id()
         and exists (select 1
                       from public.session_posters sp
                       join public.sessions s on s.id = sp.session_id
                      where sp.document_id = export_artifacts.document_id));
