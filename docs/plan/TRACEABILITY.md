# TRACEABILITY

**Generated — do not edit by hand.** Run `node scripts/traceability.mjs`.

<!-- TRACEABILITY:START -->

## Summary

| Artifact | Count |
|---|---|
| Requirements (`REQ-*`) | **251** |
| Entities (`ENT-*`) | **64** |
| Stories (`STORY-*`) | **112** |
| Screens cited (`SCR-*`) | 53 |
| Jobs cited (`JOB-*`) | 34 |
| Messages cited (`MSG-*`) | 19 |

## Cross-cutting requirements

These have no single screen and no single job **by nature** — they are properties of the whole
system. Each still has a story and a milestone; only gap report 2 exempts them. The list lives in
`scripts/traceability.mjs`, so adding to it is a reviewable diff.

| Requirement | Why it has no single screen or job |
|---|---|
| `REQ-INT-001` | RTL is the rendering mode of every screen |
| `REQ-INT-002` | every string on every screen |
| `REQ-INT-003` | every date and number everywhere |
| `REQ-INT-004` | every layout |
| `REQ-INT-005` | every text node |
| `REQ-INT-008` | every route |
| `REQ-INT-009` | every screen’s first paint |
| `REQ-NFR-001` | a property of every table in the schema |
| `REQ-NFR-002` | every server action and route handler |
| `REQ-NFR-003` | a header on every response |
| `REQ-NFR-004` | a property of every data read in the product |
| `REQ-NFR-005` | enforced at the edges of many surfaces at once |
| `REQ-NFR-009` | every screen at 375px |
| `REQ-NFR-010` | a property of the schema and its query plans |
| `REQ-NFR-011` | a constraint on decisions, not a feature — nothing is built |
| `REQ-NFR-016` | the deployment, not a screen |
| `REQ-NFR-017` | the environments themselves |
| `REQ-NFR-018` | the test suites |
| `REQ-NFR-020` | every migration |

## Matrix

### ADM

| Requirement | Entities | Policies | Screens | Jobs | Messages | Stories | M |
|---|---|---|---|---|---|---|---|
| `REQ-ADM-001` | `ENT-platform_admins` | — | `SCR-080` | — | — | `STORY-ADM-001` | M8 |
| `REQ-ADM-002` | `ENT-impersonation_sessions` `ENT-platform_admins` | `POL-super_admin.no_data_plane` | `SCR-085` | `JOB-expire_impersonation` | — | `STORY-ADM-002` | M8 |
| `REQ-ADM-003` | — | — | `SCR-080` `SCR-084` | — | — | `STORY-ADM-001` | M8 |
| `REQ-ADM-004` | — | — | `SCR-011` `SCR-040` `SCR-043` +5 | — | — | `STORY-ADM-003` | M7 |
| `REQ-ADM-005` | — | — | `SCR-042` | — | — | `STORY-ADM-004` | M7 |
| `REQ-ADM-006` | — | `POL-categories.update.admin` `POL-companies.update.admin` +1 | `SCR-046` | — | — | `STORY-ADM-004` | M7 |
| `REQ-ADM-007` | — | — | `SCR-047` | — | — | `STORY-ADM-004` | M7 |
| `REQ-ADM-008` | — | — | `SCR-048` | — | — | `STORY-ADM-004` | M7 |
| `REQ-ADM-009` | — | `POL-admin_list_members.select.admin` | `SCR-049` | — | — | `STORY-ADM-005` | M7 |
| `REQ-ADM-010` | — | — | `SCR-050` | — | — | `STORY-ADM-006` | M7 |
| `REQ-ADM-011` | — | — | `SCR-053` | — | — | `STORY-ADM-007` | M7 |
| `REQ-ADM-012` | — | — | `SCR-054` | — | — | `STORY-ADM-007` | M7 |
| `REQ-ADM-013` | — | — | `SCR-011` `SCR-043` `SCR-044` +4 | — | — | `STORY-ADM-007` | M7 |
| `REQ-ADM-014` | — | — | `SCR-058` | — | — | `STORY-ADM-007` | M7 |
| `REQ-ADM-015` | — | — | `SCR-011` `SCR-043` `SCR-044` +4 | — | — | `STORY-ADM-007` | M7 |
| `REQ-ADM-016` | — | — | `SCR-060` | — | — | `STORY-ADM-007` | M7 |
| `REQ-ADM-017` | — | `POL-write_admin_export_audit.execute.admin` | `SCR-059` `SCR-061` `SCR-062` | — | — | `STORY-ADM-008` | M7 |
| `REQ-ADM-018` | `ENT-audit_log` | `POL-comments.removal_audit` | `SCR-059` `SCR-061` `SCR-062` | — | — | `STORY-ADM-008` | M7 |
| `REQ-ADM-019` | `ENT-impersonation_sessions` | `POL-impersonation_sessions.select` | `SCR-085` | — | — | `STORY-ADM-002` | M8 |
| `REQ-ADM-020` | `ENT-ratings` | `POL-org_settings.update.admin` `POL-task_form_responses.select` | `SCR-044` `SCR-050` `SCR-062` | — | — | `STORY-ADM-005` | M7 |

### AUT

| Requirement | Entities | Policies | Screens | Jobs | Messages | Stories | M |
|---|---|---|---|---|---|---|---|
| `REQ-AUT-001` | — | — | `SCR-002` | — | — | `STORY-AUT-001` | M1 |
| `REQ-AUT-002` | — | — | `SCR-002` | — | — | `STORY-AUT-001` | M1 |
| `REQ-AUT-003` | `ENT-members` `ENT-org_domains` | — | `SCR-082` | — | — | `STORY-AUT-002` | M1 |
| `REQ-AUT-004` | `ENT-org_domains` | `POL-provision_member.ambiguous` | `SCR-003` | — | — | `STORY-AUT-002` | M1 |
| `REQ-AUT-005` | — | — | `SCR-002` | — | — | `STORY-AUT-003` | M1 |
| `REQ-AUT-006` | — | `POL-provision_member.no_match` | `SCR-004` | — | — | `STORY-AUT-003` | M1 |
| `REQ-AUT-007` | `ENT-members` | — | `SCR-049` | — | — | `STORY-AUT-004` | M1 |
| `REQ-AUT-008` | `ENT-leaderboard_entries` `ENT-leaderboard_snapshots` | — | `SCR-049` | — | — | `STORY-AUT-004` | M1 |

### CAL

| Requirement | Entities | Policies | Screens | Jobs | Messages | Stories | M |
|---|---|---|---|---|---|---|---|
| `REQ-CAL-001` | — | — | `SCR-012` `SCR-025` | — | — | `STORY-CAL-001` | M3 |
| `REQ-CAL-002` | — | — | `SCR-012` `SCR-025` | — | — | `STORY-CAL-001` | M3 |
| `REQ-CAL-003` | `ENT-calendar_connections` `ENT-calendar_events` | — | `SCR-025` | `JOB-refresh_calendar_tokens` | — | `STORY-CAL-002` | M3 |
| `REQ-CAL-004` | `ENT-calendar_events` | — | `SCR-025` | `JOB-calendar_delete` `JOB-calendar_upsert` +1 | — | `STORY-CAL-003` | M3 |
| `REQ-CAL-005` | `ENT-calendar_events` | — | `SCR-025` | `JOB-calendar_delete` `JOB-calendar_upsert` +1 | — | `STORY-CAL-003` | M3 |
| `REQ-CAL-006` | `ENT-calendar_events` | — | `SCR-025` | `JOB-calendar_delete` `JOB-calendar_upsert` +1 | — | `STORY-CAL-003` | M3 |
| `REQ-CAL-007` | `ENT-calendar_connections` `ENT-calendar_events` | — | `SCR-025` | `JOB-calendar_delete` `JOB-calendar_upsert` +1 | — | `STORY-CAL-002` | M3 |
| `REQ-CAL-008` | `ENT-calendar_events` | — | `SCR-025` | `JOB-calendar_delete` `JOB-calendar_upsert` +1 | — | `STORY-CAL-004` | M3 |

### CHK

| Requirement | Entities | Policies | Screens | Jobs | Messages | Stories | M |
|---|---|---|---|---|---|---|---|
| `REQ-CHK-001` | — | — | `SCR-016` | — | — | `STORY-CHK-001` | M2 |
| `REQ-CHK-002` | `ENT-check_in_codes` | — | `SCR-016` | `JOB-rotate_check_in_code` | — | `STORY-CHK-001` | M2 |
| `REQ-CHK-003` | `ENT-check_ins` | — | `SCR-014` | — | — | `STORY-CHK-002` | M2 |
| `REQ-CHK-004` | `ENT-check_ins` | — | `SCR-014` | — | — | `STORY-CHK-002` | M2 |
| `REQ-CHK-005` | `ENT-check_ins` | — | `SCR-014` | — | — | `STORY-CHK-002` | M2 |
| `REQ-CHK-006` | `ENT-check_in_attempts` `ENT-check_ins` | `POL-check_ins.rate_limit` `POL-check_ins.single_use` | `SCR-014` | — | — | `STORY-CHK-003` | M2 |
| `REQ-CHK-007` | `ENT-check_in_codes` | — | `SCR-016` | `JOB-rotate_check_in_code` | — | `STORY-CHK-004` | M2 |
| `REQ-CHK-008` | `ENT-check_ins` | — | `SCR-044` | — | — | `STORY-CHK-004` | M2 |
| `REQ-CHK-009` | `ENT-certificates` `ENT-check_ins` | `POL-issue_certificate.check_in` | `SCR-014` | `JOB-issue_certificates` | — | `STORY-CHK-005` | M2 |
| `REQ-CHK-010` | — | — | `SCR-014` | — | — | `STORY-CHK-005` | M2 |
| `REQ-CHK-011` | `ENT-check_ins` | — | `SCR-014` | — | — | `STORY-CHK-005` | M2 |
| `REQ-CHK-012` | — | — | `SCR-014` `SCR-044` | — | — | `STORY-CHK-006` | M2 |
| `REQ-CHK-013` | `ENT-check_ins` | — | `SCR-014` | — | — | `STORY-CHK-006` | M2 |
| `REQ-CHK-014` | — | — | `SCR-016` | — | — | `STORY-CHK-006` | M2 |

### CRT

| Requirement | Entities | Policies | Screens | Jobs | Messages | Stories | M |
|---|---|---|---|---|---|---|---|
| `REQ-CRT-001` | `ENT-certificates` | `POL-certificates.constraints` | `SCR-045` | — | — | `STORY-CRT-001` | M6 |
| `REQ-CRT-002` | `ENT-certificates` | `POL-certificates.fanout` | `SCR-043` `SCR-057` | — | — | `STORY-CRT-001` | M6 |
| `REQ-CRT-003` | `ENT-certificates` | `POL-certificates.constraints` `POL-issue_certificate.idempotent` | `SCR-045` | `JOB-issue_certificates` | — | `STORY-CRT-002` | M6 |
| `REQ-CRT-004` | `ENT-certificates` | `POL-certificates.select.held` `POL-issue_certificate.mode` | `SCR-045` | — | — | `STORY-CRT-002` | M6 |
| `REQ-CRT-005` | `ENT-certificates` | — | `SCR-023` | — | — | `STORY-CRT-003` | M6 |
| `REQ-CRT-006` | `ENT-certificates` | — | `SCR-023` | — | — | `STORY-CRT-003` | M6 |
| `REQ-CRT-007` | `ENT-certificates` | `POL-certificates.verify.anon` | `SCR-006` | — | — | `STORY-CRT-005` | M6 |
| `REQ-CRT-008` | `ENT-certificate_serial_counters` `ENT-certificates` | `POL-certificates.serial` `POL-issue_certificate.idempotent` | — | `JOB-issue_certificates` | — | `STORY-CRT-004` | M6 |
| `REQ-CRT-009` | `ENT-certificates` | `POL-certificates.verify.anon` | `SCR-006` | — | — | `STORY-CRT-005` | M6 |
| `REQ-CRT-010` | `ENT-certificates` | — | `SCR-006` | — | — | `STORY-CRT-005` | M6 |
| `REQ-CRT-011` | `ENT-certificates` | `POL-certificates.constraints` `POL-revoke_certificate.reason` | `SCR-006` `SCR-045` | — | — | `STORY-CRT-006` | M6 |
| `REQ-CRT-012` | `ENT-badges` `ENT-certificates` `ENT-leaderboard_entries` +2 | — | `SCR-045` | — | — | `STORY-CRT-006` | M6 |
| `REQ-CRT-013` | `ENT-certificates` | — | `SCR-023` | — | — | `STORY-CRT-003` | M6 |
| `REQ-CRT-014` | `ENT-certificates` `ENT-design_template_versions` `ENT-fonts` | — | `SCR-023` | — | — | `STORY-CRT-006` | M6 |

### DSC

| Requirement | Entities | Policies | Screens | Jobs | Messages | Stories | M |
|---|---|---|---|---|---|---|---|
| `REQ-DSC-001` | `ENT-categories` | — | `SCR-011` `SCR-047` | — | — | `STORY-DSC-001` | M5 |
| `REQ-DSC-002` | `ENT-session_tags` `ENT-tags` | — | `SCR-011` `SCR-047` | — | — | `STORY-DSC-001` | M5 |
| `REQ-DSC-003` | `ENT-sessions` | — | `SCR-011` | `JOB-rebuild_search` | `MSG-presenter_assigned` `MSG-proposal_submitted` +1 | `STORY-DSC-002` | M5 |
| `REQ-DSC-004` | `ENT-session_tags` `ENT-tags` | — | `SCR-047` | — | — | `STORY-DSC-002` | M5 |
| `REQ-DSC-005` | — | — | `SCR-011` | — | — | `STORY-DSC-002` | M5 |
| `REQ-DSC-006` | `ENT-bookmarks` | — | `SCR-024` | — | — | `STORY-DSC-003` | M5 |
| `REQ-DSC-007` | — | — | `SCR-011` | — | — | `STORY-DSC-003` | M5 |

### DSG

| Requirement | Entities | Policies | Screens | Jobs | Messages | Stories | M |
|---|---|---|---|---|---|---|---|
| `REQ-DSG-001` | `ENT-session_posters` | `POL-session_posters.publish` | `SCR-043` | — | — | `STORY-DSG-001` | M6 |
| `REQ-DSG-002` | `ENT-session_posters` | `POL-design_documents.write` | `SCR-043` `SCR-057` | — | — | `STORY-DSG-001` | M6 |
| `REQ-DSG-003` | `ENT-session_posters` | `POL-session_posters.detach` | `SCR-043` | `JOB-regenerate_poster` `JOB-render_variant` | — | `STORY-DSG-002` | M6 |
| `REQ-DSG-004` | — | — | `SCR-055` | — | — | `STORY-DSG-003` | M6 |
| `REQ-DSG-005` | `ENT-design_documents` | `POL-design_template_versions.guard` | `SCR-057` | — | — | `STORY-DSG-003` | M6 |
| `REQ-DSG-006` | `ENT-design_documents` | — | `SCR-057` | — | — | `STORY-DSG-003` | M6 |
| `REQ-DSG-007` | `ENT-design_template_versions` `ENT-design_templates` | `POL-design_template_versions.read` | `SCR-055` | — | — | `STORY-DSG-004` | M6 |
| `REQ-DSG-008` | `ENT-design_template_versions` `ENT-design_templates` | `POL-design_templates.update.platform` | `SCR-055` `SCR-083` | — | — | `STORY-DSG-004` | M6 |
| `REQ-DSG-009` | — | — | `SCR-057` | — | — | `STORY-DSG-005` | M6 |
| `REQ-DSG-010` | — | — | `SCR-057` | — | — | `STORY-DSG-005` | M6 |
| `REQ-DSG-011` | `ENT-export_artifacts` | — | `SCR-057` | `JOB-regenerate_poster` `JOB-render_variant` | — | `STORY-DSG-006` | M6 |
| `REQ-DSG-012` | `ENT-export_artifacts` | — | `SCR-057` | `JOB-regenerate_poster` `JOB-render_variant` | — | `STORY-DSG-006` | M6 |
| `REQ-DSG-013` | `ENT-export_artifacts` | `POL-export_artifacts.cache` `POL-export_artifacts.select` | — | `JOB-regenerate_poster` `JOB-render_variant` | — | `STORY-DSG-006` | M6 |
| `REQ-DSG-014` | `ENT-export_artifacts` | — | `SCR-057` | `JOB-regenerate_poster` `JOB-render_variant` | — | `STORY-DSG-007` | M6 |
| `REQ-DSG-015` | — | — | `SCR-011` `SCR-043` `SCR-057` | — | `MSG-certificate_issued` | `STORY-DSG-007` | M6 |
| `REQ-DSG-016` | `ENT-fonts` | — | `SCR-011` `SCR-043` `SCR-044` +5 | — | — | `STORY-DSG-008` | M6 |
| `REQ-DSG-017` | `ENT-fonts` | `POL-fonts.materialise.admin` | `SCR-057` | `JOB-materialise_font` | — | `STORY-DSG-008` | M6 |
| `REQ-DSG-018` | `ENT-design_assets` | — | `SCR-057` | — | — | `STORY-DSG-009` | M6 |
| `REQ-DSG-019` | `ENT-design_assets` | — | `SCR-057` | — | — | `STORY-DSG-009` | M6 |
| `REQ-DSG-020` | `ENT-session_posters` | — | `SCR-043` | — | — | `STORY-DSG-009` | M6 |
| `REQ-DSG-021` | — | `POL-design_template_versions.guard` | `SCR-059` `SCR-061` `SCR-062` | — | — | `STORY-DSG-010` | M6 |
| `REQ-DSG-022` | `ENT-design_assets` | — | `SCR-057` | — | — | `STORY-DSG-010` | M6 |
| `REQ-DSG-023` | — | — | `SCR-057` | — | — | `STORY-DSG-011` | M6 |
| `REQ-DSG-024` | — | `POL-design_documents.locked` | `SCR-055` | — | — | `STORY-DSG-004` | M6 |
| `REQ-DSG-025` | — | — | `SCR-057` | — | — | `STORY-DSG-005` | M6 |
| `REQ-DSG-026` | `ENT-design_template_versions` `ENT-design_templates` | — | `SCR-055` | — | — | `STORY-DSG-011` | M6 |

### EVT

| Requirement | Entities | Policies | Screens | Jobs | Messages | Stories | M |
|---|---|---|---|---|---|---|---|
| `REQ-EVT-001` | — | — | `SCR-012` | — | — | `STORY-EVT-001` | M2 |
| `REQ-EVT-002` | `ENT-comments` | — | `SCR-012` | — | — | `STORY-EVT-002` | M2 |
| `REQ-EVT-003` | — | — | `SCR-012` | — | — | `STORY-EVT-002` | M2 |
| `REQ-EVT-004` | `ENT-reactions` | — | `SCR-012` | — | — | `STORY-EVT-003` | M2 |
| `REQ-EVT-005` | `ENT-comments` | `POL-ratings.select.admin` | `SCR-012` | — | — | `STORY-EVT-002` | M2 |
| `REQ-EVT-006` | `ENT-comments` | — | `SCR-012` | — | — | `STORY-EVT-003` | M2 |
| `REQ-EVT-007` | — | — | `SCR-012` `SCR-043` | — | — | `STORY-EVT-003` | M2 |
| `REQ-EVT-008` | `ENT-reports` | — | `SCR-012` `SCR-050` | — | — | `STORY-EVT-004` | M2 |
| `REQ-EVT-009` | `ENT-photos` | — | `SCR-012` | — | — | `STORY-EVT-005` | M5 |
| `REQ-EVT-010` | `ENT-photos` | — | `SCR-012` | — | — | `STORY-EVT-005` | M5 |
| `REQ-EVT-011` | `ENT-photos` | — | `SCR-012` | `JOB-process_photo` | — | `STORY-EVT-005` | M5 |
| `REQ-EVT-012` | `ENT-photo_takedowns` `ENT-photos` | — | `SCR-012` `SCR-050` | — | — | `STORY-EVT-006` | M5 |
| `REQ-EVT-013` | `ENT-photo_takedowns` `ENT-photos` | — | `SCR-012` | — | — | `STORY-EVT-005` | M5 |
| `REQ-EVT-014` | `ENT-photos` | `POL-comments.removal_audit` | `SCR-012` `SCR-050` | — | — | `STORY-EVT-006` | M5 |
| `REQ-EVT-015` | — | — | `SCR-012` | — | — | `STORY-EVT-006` | M5 |

### INT

| Requirement | Entities | Policies | Screens | Jobs | Messages | Stories | M |
|---|---|---|---|---|---|---|---|
| `REQ-INT-001` | — | — | — | — | — | `STORY-INT-001` | M1 |
| `REQ-INT-002` | — | — | — | — | `MSG-key` | `STORY-INT-002` | M1 |
| `REQ-INT-003` | — | — | — | — | — | `STORY-INT-002` | M1 |
| `REQ-INT-004` | — | — | — | — | — | `STORY-INT-001` | M1 |
| `REQ-INT-005` | — | — | — | — | — | `STORY-INT-003` | M1 |
| `REQ-INT-006` | — | — | `SCR-063` | — | `MSG-presenter_assigned` `MSG-proposal_submitted` +1 | `STORY-INT-003` | M1 |
| `REQ-INT-007` | — | — | `SCR-012` | — | — | `STORY-INT-003` | M1 |
| `REQ-INT-008` | — | — | — | — | — | `STORY-INT-004` | M1 |
| `REQ-INT-009` | `ENT-fonts` | — | — | — | — | `STORY-INT-004` | M1 |

### LDR

| Requirement | Entities | Policies | Screens | Jobs | Messages | Stories | M |
|---|---|---|---|---|---|---|---|
| `REQ-LDR-001` | — | — | `SCR-027` `SCR-028` | — | — | `STORY-LDR-001` | M4 |
| `REQ-LDR-002` | `ENT-leaderboard_entries` `ENT-leaderboard_snapshots` | — | `SCR-027` `SCR-028` | `JOB-snapshot_leaderboards` | — | `STORY-LDR-001` | M4 |
| `REQ-LDR-003` | `ENT-categories` | — | `SCR-027` `SCR-028` | — | — | `STORY-LDR-002` | M4 |
| `REQ-LDR-004` | `ENT-companies` `ENT-leaderboard_snapshots` | — | `SCR-027` `SCR-028` | — | — | `STORY-LDR-003` | M4 |
| `REQ-LDR-005` | — | — | `SCR-027` `SCR-028` | — | — | `STORY-LDR-003` | M4 |
| `REQ-LDR-006` | `ENT-leaderboard_entries` `ENT-leaderboard_snapshots` | — | `SCR-027` `SCR-028` | `JOB-snapshot_leaderboards` | — | `STORY-LDR-004` | M4 |
| `REQ-LDR-007` | — | — | `SCR-027` `SCR-028` | — | — | `STORY-LDR-004` | M4 |
| `REQ-LDR-008` | — | `POL-leaderboard_entries.opt_out_at_write` `POL-leaderboard_entries.select.opt_out` | `SCR-027` `SCR-028` | — | — | `STORY-LDR-003` | M4 |

### MAT

| Requirement | Entities | Policies | Screens | Jobs | Messages | Stories | M |
|---|---|---|---|---|---|---|---|
| `REQ-MAT-001` | `ENT-materials` | — | `SCR-012` | — | — | `STORY-MAT-001` | M5 |
| `REQ-MAT-002` | `ENT-materials` | — | `SCR-013` | — | — | `STORY-MAT-001` | M5 |
| `REQ-MAT-003` | `ENT-material_pages` `ENT-materials` | — | `SCR-013` | `JOB-convert_document` `JOB-render_pages` | — | `STORY-MAT-002` | M5 |
| `REQ-MAT-004` | `ENT-materials` | — | `SCR-013` | — | — | `STORY-MAT-003` | M5 |
| `REQ-MAT-005` | `ENT-materials` | — | `SCR-013` | — | — | `STORY-MAT-004` | M5 |
| `REQ-MAT-006` | `ENT-materials` | — | `SCR-012` | — | — | `STORY-MAT-004` | M5 |
| `REQ-MAT-007` | `ENT-materials` | — | `SCR-012` `SCR-013` | — | — | `STORY-MAT-005` | M5 |
| `REQ-MAT-008` | `ENT-materials` | — | `SCR-063` | — | — | `STORY-MAT-005` | M5 |
| `REQ-MAT-009` | `ENT-materials` `ENT-org_settings` | — | `SCR-063` | — | — | `STORY-MAT-005` | M5 |
| `REQ-MAT-010` | `ENT-material_versions` `ENT-materials` | — | `SCR-013` | — | — | `STORY-MAT-005` | M5 |
| `REQ-MAT-011` | `ENT-materials` | — | `SCR-011` `SCR-013` `SCR-043` +5 | `JOB-convert_document` `JOB-render_pages` | — | `STORY-MAT-006` | M5 |
| `REQ-MAT-012` | `ENT-material_versions` | — | `SCR-013` | — | — | `STORY-MAT-001` | M5 |

### NFR

| Requirement | Entities | Policies | Screens | Jobs | Messages | Stories | M |
|---|---|---|---|---|---|---|---|
| `REQ-NFR-001` | — | — | — | — | — | `STORY-NFR-001` | M1 |
| `REQ-NFR-002` | — | — | — | — | — | `STORY-NFR-002` | M1 |
| `REQ-NFR-003` | — | — | — | — | — | `STORY-NFR-002` | M1 |
| `REQ-NFR-004` | — | — | — | — | — | `STORY-NFR-003` | M1 |
| `REQ-NFR-005` | `ENT-check_in_attempts` | — | — | — | — | `STORY-NFR-003` | M1 |
| `REQ-NFR-006` | `ENT-audit_log` `ENT-points_ledger` | — | `SCR-062` | — | — | `STORY-NFR-001` | M1 |
| `REQ-NFR-007` | — | — | `SCR-022` | — | — | `STORY-NFR-004` | M8 |
| `REQ-NFR-008` | — | — | `SCR-000` `SCR-011` `SCR-012` +5 | — | — | `STORY-NFR-004` | M8 |
| `REQ-NFR-009` | — | — | — | — | — | `STORY-NFR-004` | M8 |
| `REQ-NFR-010` | — | — | — | — | — | `STORY-NFR-005` | M8 |
| `REQ-NFR-011` | — | — | — | — | — | `STORY-NFR-005` | M8 |
| `REQ-NFR-012` | — | — | — | `JOB-anonymise_members` `JOB-enforce_retention` | — | `STORY-NFR-006` | M8 |
| `REQ-NFR-013` | — | — | `SCR-021` | — | — | `STORY-NFR-006` | M8 |
| `REQ-NFR-014` | — | — | `SCR-080` | — | — | `STORY-NFR-006` | M8 |
| `REQ-NFR-015` | — | — | `SCR-005` | — | — | `STORY-NFR-006` | M8 |
| `REQ-NFR-016` | `ENT-email_deliveries` | — | — | — | — | `STORY-NFR-007` | M0 |
| `REQ-NFR-017` | — | — | — | — | — | `STORY-NFR-007` | M0 |
| `REQ-NFR-018` | — | — | — | — | — | `STORY-NFR-008` | M0 |
| `REQ-NFR-019` | — | — | `SCR-000` `SCR-001` | — | — | `STORY-NFR-008` | M0 |
| `REQ-NFR-020` | `ENT-registrations` | — | — | — | — | `STORY-NFR-008` | M0 |

### NTF

| Requirement | Entities | Policies | Screens | Jobs | Messages | Stories | M |
|---|---|---|---|---|---|---|---|
| `REQ-NTF-001` | — | — | `SCR-026` | — | — | `STORY-NTF-001` | M3 |
| `REQ-NTF-002` | `ENT-notification_templates` | `POL-notification_templates.matrix` | — | `JOB-rating_prompt` `JOB-rsvp_nudge` +3 | — | `STORY-NTF-001` | M3 |
| `REQ-NTF-003` | `ENT-notification_preferences` | — | `SCR-026` | `JOB-rating_prompt` `JOB-rsvp_nudge` +3 | `MSG-account_deactivated` `MSG-calendar_disconnected` +12 | `STORY-NTF-002` | M3 |
| `REQ-NTF-004` | — | — | `SCR-060` | `JOB-rating_prompt` `JOB-rsvp_nudge` +3 | — | `STORY-NTF-003` | M3 |
| `REQ-NTF-005` | — | — | `SCR-026` | `JOB-rating_prompt` `JOB-rsvp_nudge` +3 | — | `STORY-NTF-003` | M3 |
| `REQ-NTF-006` | `ENT-notifications` | — | `SCR-026` | `JOB-rating_prompt` `JOB-rsvp_nudge` +3 | — | `STORY-NTF-004` | M3 |
| `REQ-NTF-007` | `ENT-notification_templates` | `POL-notification_templates.required_fields` | `SCR-058` | `JOB-rating_prompt` `JOB-rsvp_nudge` +3 | — | `STORY-NTF-004` | M3 |
| `REQ-NTF-008` | `ENT-email_deliveries` | — | — | `JOB-rating_prompt` `JOB-rsvp_nudge` +3 | — | `STORY-NTF-004` | M3 |

### PRF

| Requirement | Entities | Policies | Screens | Jobs | Messages | Stories | M |
|---|---|---|---|---|---|---|---|
| `REQ-PRF-001` | `ENT-member_interests` `ENT-members` | — | `SCR-020` `SCR-021` | — | — | `STORY-PRF-001` | M1 |
| `REQ-PRF-002` | `ENT-companies` | — | `SCR-021` `SCR-048` | — | — | `STORY-PRF-001` | M1 |
| `REQ-PRF-003` | `ENT-companies` | — | `SCR-020` | — | — | `STORY-PRF-001` | M1 |
| `REQ-PRF-004` | `ENT-calendar_connections` | — | `SCR-020` | — | — | `STORY-PRF-002` | M1 |
| `REQ-PRF-005` | — | — | `SCR-019` | — | — | `STORY-PRF-003` | M2 |
| `REQ-PRF-006` | — | — | `SCR-021` | `JOB-build_data_export` | — | `STORY-PRF-004` | M8 |
| `REQ-PRF-007` | — | — | `SCR-021` | `JOB-anonymise_members` `JOB-enforce_retention` | — | `STORY-PRF-004` | M8 |

### PRO

| Requirement | Entities | Policies | Screens | Jobs | Messages | Stories | M |
|---|---|---|---|---|---|---|---|
| `REQ-PRO-001` | `ENT-proposals` | — | `SCR-017` | — | — | `STORY-PRO-001` | M2 |
| `REQ-PRO-002` | `ENT-proposals` | — | `SCR-017` | — | — | `STORY-PRO-001` | M2 |
| `REQ-PRO-003` | `ENT-proposal_presenters` `ENT-session_presenters` | — | `SCR-017` | — | — | `STORY-PRO-002` | M2 |
| `REQ-PRO-004` | — | — | `SCR-011` `SCR-012` `SCR-017` +1 | — | — | `STORY-PRO-002` | M2 |
| `REQ-PRO-005` | — | — | `SCR-041` | — | — | `STORY-PRO-003` | M2 |
| `REQ-PRO-006` | `ENT-proposals` `ENT-session_state_transitions` | `POL-proposals.transition.audit` | `SCR-018` `SCR-041` | — | — | `STORY-PRO-003` | M2 |
| `REQ-PRO-007` | — | `POL-session_presenters.assigned_notice` `POL-sessions.transition.legal` | `SCR-041` | — | — | `STORY-PRO-004` | M2 |
| `REQ-PRO-008` | — | — | `SCR-018` | — | — | `STORY-PRO-004` | M2 |

### PTS

| Requirement | Entities | Policies | Screens | Jobs | Messages | Stories | M |
|---|---|---|---|---|---|---|---|
| `REQ-PTS-001` | `ENT-audit_log` `ENT-points_ledger` | — | `SCR-022` | — | — | `STORY-PTS-001` | M4 |
| `REQ-PTS-002` | `ENT-points_ledger` | — | `SCR-022` | — | — | `STORY-PTS-001` | M4 |
| `REQ-PTS-003` | — | `POL-scoring_rules.select` | `SCR-010` `SCR-022` | — | — | `STORY-PTS-006` | M4 |
| `REQ-PTS-004` | `ENT-scoring_rules` | — | `SCR-053` | — | — | `STORY-PTS-003` | M4 |
| `REQ-PTS-005` | `ENT-scoring_config_history` `ENT-scoring_rules` | — | `SCR-053` | — | — | `STORY-PTS-003` | M4 |
| `REQ-PTS-006` | `ENT-scoring_rules` | — | `SCR-022` `SCR-053` | `JOB-award_points` `JOB-award_presenter_points` | — | `STORY-PTS-004` | M4 |
| `REQ-PTS-007` | `ENT-scoring_rules` | — | `SCR-053` | — | — | `STORY-PTS-004` | M4 |
| `REQ-PTS-008` | `ENT-scoring_rules` | — | `SCR-053` | `JOB-complete_session` `JOB-evaluate_no_shows` | — | `STORY-PTS-004` | M4 |
| `REQ-PTS-009` | — | — | `SCR-022` | — | — | `STORY-PTS-005` | M4 |
| `REQ-PTS-010` | `ENT-reactions` `ENT-scoring_rules` | `POL-scoring_rules.catalogue` | `SCR-053` | — | — | `STORY-PTS-005` | M4 |
| `REQ-PTS-011` | `ENT-points_balances` | — | — | `JOB-audit_balances` | — | `STORY-PTS-006` | M4 |
| `REQ-PTS-012` | `ENT-points_ledger` | — | — | `JOB-award_points` `JOB-award_presenter_points` | — | `STORY-PTS-002` | M4 |
| `REQ-PTS-013` | — | — | `SCR-022` | — | — | `STORY-PTS-005` | M4 |
| `REQ-PTS-014` | — | — | `SCR-053` | — | — | `STORY-PTS-003` | M4 |

### RAT

| Requirement | Entities | Policies | Screens | Jobs | Messages | Stories | M |
|---|---|---|---|---|---|---|---|
| `REQ-RAT-001` | `ENT-ratings` | — | `SCR-015` | — | — | `STORY-RAT-001` | M2 |
| `REQ-RAT-002` | `ENT-ratings` | — | `SCR-015` | — | — | `STORY-RAT-001` | M2 |
| `REQ-RAT-003` | `ENT-ratings` | — | `SCR-015` | — | — | `STORY-RAT-001` | M2 |
| `REQ-RAT-004` | `ENT-ratings` | — | `SCR-015` | — | — | `STORY-RAT-002` | M2 |
| `REQ-RAT-005` | `ENT-ratings` | `POL-ratings.select.admin` | `SCR-044` | — | — | `STORY-RAT-002` | M2 |
| `REQ-RAT-006` | `ENT-ratings` | `POL-ratings.select.admin` | `SCR-015` | — | — | `STORY-RAT-002` | M2 |
| `REQ-RAT-007` | — | — | — | `JOB-rating_prompt` `JOB-rsvp_nudge` +3 | `MSG-rating_prompt` | `STORY-RAT-003` | M3 |

### REC

| Requirement | Entities | Policies | Screens | Jobs | Messages | Stories | M |
|---|---|---|---|---|---|---|---|
| `REQ-REC-001` | `ENT-badges` `ENT-member_badges` | `POL-badges.select` `POL-badges.update.admin` | `SCR-054` | — | — | `STORY-REC-001` | M4 |
| `REQ-REC-002` | `ENT-badges` `ENT-member_badges` `ENT-member_perks` | — | `SCR-054` | `JOB-evaluate_badges` `JOB-evaluate_levels_perks` +1 | — | `STORY-REC-001` | M4 |
| `REQ-REC-003` | `ENT-levels` `ENT-member_perks` | — | `SCR-054` | `JOB-evaluate_badges` `JOB-evaluate_levels_perks` +1 | — | `STORY-REC-002` | M4 |
| `REQ-REC-004` | `ENT-levels` | — | `SCR-054` | `JOB-evaluate_badges` `JOB-evaluate_levels_perks` +1 | — | `STORY-REC-002` | M4 |
| `REQ-REC-005` | `ENT-member_perks` `ENT-streak_awards` `ENT-streak_rules` | — | `SCR-054` | `JOB-evaluate_badges` `JOB-evaluate_levels_perks` +1 | — | `STORY-REC-003` | M4 |
| `REQ-REC-006` | `ENT-member_perks` `ENT-perks` | — | `SCR-054` | `JOB-evaluate_badges` `JOB-evaluate_levels_perks` +1 | — | `STORY-REC-004` | M4 |
| `REQ-REC-007` | `ENT-member_perks` `ENT-perks` | — | `SCR-054` | — | — | `STORY-REC-004` | M4 |
| `REQ-REC-008` | `ENT-member_perks` `ENT-perks` | — | `SCR-017` `SCR-054` | — | — | `STORY-REC-004` | M4 |
| `REQ-REC-009` | — | — | `SCR-010` | — | — | `STORY-REC-004` | M4 |

### RSV

| Requirement | Entities | Policies | Screens | Jobs | Messages | Stories | M |
|---|---|---|---|---|---|---|---|
| `REQ-RSV-001` | `ENT-rsvps` | — | `SCR-012` | — | — | `STORY-RSV-001` | M2 |
| `REQ-RSV-002` | `ENT-rsvps` | — | `SCR-012` | — | — | `STORY-RSV-001` | M2 |
| `REQ-RSV-003` | `ENT-rsvps` | — | `SCR-012` | `JOB-calendar_upsert` `JOB-promote_waitlist` | `MSG-rsvp_promoted` | `STORY-RSV-002` | M2 |
| `REQ-RSV-004` | `ENT-calendar_events` `ENT-rsvps` | `POL-rsvps.notice` | `SCR-012` | `JOB-calendar_upsert` `JOB-promote_waitlist` | `MSG-rsvp_promoted` | `STORY-RSV-002` | M2 |
| `REQ-RSV-005` | `ENT-rsvps` | — | `SCR-012` | — | — | `STORY-RSV-003` | M2 |
| `REQ-RSV-006` | `ENT-rsvps` | — | `SCR-012` | — | — | `STORY-RSV-003` | M2 |
| `REQ-RSV-007` | `ENT-rsvps` | — | `SCR-012` | — | — | `STORY-RSV-003` | M2 |
| `REQ-RSV-008` | `ENT-rsvps` | — | `SCR-012` | — | — | `STORY-RSV-004` | M2 |
| `REQ-RSV-009` | `ENT-member_perks` | — | `SCR-012` | — | — | `STORY-RSV-005` | M4 |
| `REQ-RSV-010` | — | — | `SCR-012` | — | — | `STORY-RSV-005` | M4 |
| `REQ-RSV-011` | — | — | `SCR-012` | — | — | `STORY-RSV-001` | M2 |

### SES

| Requirement | Entities | Policies | Screens | Jobs | Messages | Stories | M |
|---|---|---|---|---|---|---|---|
| `REQ-SES-001` | `ENT-sessions` | — | `SCR-012` `SCR-043` `SCR-057` | — | — | `STORY-SES-001` | M2 |
| `REQ-SES-002` | `ENT-sessions` | — | `SCR-043` `SCR-057` | — | — | `STORY-SES-001` | M2 |
| `REQ-SES-003` | `ENT-session_state_transitions` `ENT-sessions` | `POL-session_presenters.decline` | `SCR-042` | — | — | `STORY-SES-002` | M2 |
| `REQ-SES-004` | — | — | — | `JOB-archive_sessions` `JOB-award_presenter_points` +5 | — | `STORY-SES-003` | M2 |
| `REQ-SES-005` | `ENT-session_state_transitions` | — | `SCR-042` | `JOB-start_session` | — | `STORY-SES-003` | M2 |
| `REQ-SES-006` | `ENT-venues` | — | `SCR-043` `SCR-046` | — | — | `STORY-SES-004` | M2 |
| `REQ-SES-007` | `ENT-venues` | — | `SCR-043` | — | — | `STORY-SES-004` | M2 |
| `REQ-SES-008` | — | — | `SCR-012` | — | — | `STORY-SES-006` | M2 |
| `REQ-SES-009` | — | — | `SCR-043` `SCR-057` | — | `MSG-session_changed` | `STORY-SES-005` | M3 |
| `REQ-SES-010` | — | — | `SCR-012` | — | — | `STORY-SES-005` | M3 |
| `REQ-SES-011` | `ENT-sessions` | — | `SCR-011` `SCR-012` `SCR-043` | — | — | `STORY-SES-006` | M2 |
| `REQ-SES-012` | — | — | `SCR-042` | `JOB-archive_sessions` `JOB-complete_session` +1 | — | `STORY-SES-002` | M2 |
| `REQ-SES-013` | — | — | `SCR-010` `SCR-012` | — | — | `STORY-SES-006` | M2 |

### TEN

| Requirement | Entities | Policies | Screens | Jobs | Messages | Stories | M |
|---|---|---|---|---|---|---|---|
| `REQ-TEN-001` | `ENT-orgs` | — | `SCR-080` | — | — | `STORY-TEN-001` | M1 |
| `REQ-TEN-002` | `ENT-orgs` | — | `SCR-080` `SCR-081` | — | — | `STORY-TEN-001` | M1 |
| `REQ-TEN-003` | — | — | `SCR-085` | `JOB-assert_storage_prefixes` | — | `STORY-TEN-002` | M1 |
| `REQ-TEN-004` | `ENT-members` | — | `SCR-081` | — | — | `STORY-TEN-002` | M1 |
| `REQ-TEN-005` | `ENT-members` | — | `SCR-049` | — | — | `STORY-TEN-003` | M1 |
| `REQ-TEN-006` | `ENT-orgs` | — | `SCR-004` `SCR-080` | — | — | `STORY-TEN-003` | M1 |
| `REQ-TEN-007` | `ENT-org_domains` | — | `SCR-082` | — | — | `STORY-TEN-004` | M1 |
| `REQ-TEN-008` | `ENT-org_settings` `ENT-scoring_config_history` | — | `SCR-063` | — | — | `STORY-TEN-004` | M1 |

### TSK

| Requirement | Entities | Policies | Screens | Jobs | Messages | Stories | M |
|---|---|---|---|---|---|---|---|
| `REQ-TSK-001` | `ENT-session_tasks` `ENT-task_completions` `ENT-task_form_responses` | — | `SCR-012` | — | — | `STORY-TSK-001` | M5 |
| `REQ-TSK-002` | `ENT-session_tasks` `ENT-task_completions` `ENT-task_form_responses` | — | `SCR-012` | — | — | `STORY-TSK-001` | M5 |
| `REQ-TSK-003` | `ENT-session_tasks` `ENT-task_completions` `ENT-task_form_responses` | — | `SCR-012` | — | — | `STORY-TSK-002` | M5 |
| `REQ-TSK-004` | `ENT-session_tasks` `ENT-task_completions` `ENT-task_form_responses` | — | `SCR-010` `SCR-012` | — | — | `STORY-TSK-002` | M5 |
| `REQ-TSK-005` | — | — | `SCR-012` | — | `MSG-rsvp_nudge` | `STORY-TSK-002` | M5 |

<!-- TRACEABILITY:END -->
