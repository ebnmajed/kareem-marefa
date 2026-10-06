// 0212 — the QA sweep's database findings (DEC-265) and the owner's rulings (DEC-266). Each case is run for the person
// the change refuses AND for the person it must still serve, so a fix that narrows too far fails here too.
//
//   POL-claims.inactive_carries_no_org · POL-auth_hook.platform_admin_may_be_member (0214) ·
//   POL-realtime.session_insert_dropped · POL-org_domains.not_another_orgs ·
//   POL-photos.download_staff_only · POL-materials_storage.read_by_path · POL-materials_storage.delete_unrecorded

import { afterAll, describe, expect, it } from "vitest";
import { errorCode, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());


async function hook(tx: Tx, userId: string) {
  const [{ out }] = await tx.q<{ out: { claims: { app_metadata: Record<string, unknown> } } }>(
    `select public.custom_access_token_hook($1::jsonb) as out`,
    [JSON.stringify({ user_id: userId, claims: { sub: userId, role: "authenticated", app_metadata: {} }, authentication_method: "oauth" })],
  );
  return out.claims.app_metadata;
}

/** A storage object at the material's recorded path, owned by `ownerId`. */
async function object(tx: Tx, ownerId: string, materialId: string) {
  await tx.asOwner();
  const [{ storage_path }] = await tx.q<{ storage_path: string }>(
    `select mv.storage_path from public.materials m join public.material_versions mv on mv.id = m.current_version_id where m.id = $1`,
    [materialId],
  );
  await tx.q(`insert into storage.objects (bucket_id, name, owner_id) values ('materials', $1, $2)`, [storage_path, ownerId]);
  return storage_path;
}

/** An audio recording on the same session as `materialId`, its version stored under a folder that is NOT its id —
 *  the shape a real upload has. `kind` is immutable, so it is a material of its own. */
async function audioMaterial(tx: Tx, orgId: string, materialId: string, allowDownload = true): Promise<string> {
  await tx.asOwner();
  const [{ session_id, added_by }] = await tx.q<{ session_id: string; added_by: string }>(`select session_id, added_by from public.materials where id = $1`, [materialId]);
  const [{ id }] = await tx.q<{ id: string }>(
    `insert into public.materials (org_id, session_id, kind, title, phase, allow_download, render_status, added_by)
     values ($1, $2, 'audio', 'التسجيل', 'before', $3, 'not_applicable', $4) returning id`,
    [orgId, session_id, allowDownload, added_by],
  );
  const [{ id: version }] = await tx.q<{ id: string }>(
    `insert into public.material_versions (org_id, material_id, version, storage_path, byte_size, sniffed_mime, sha256, uploaded_by)
     values ($1, $2, 1, $3, 1024, 'audio/mpeg', $4, $5) returning id`,
    [orgId, id, `${orgId}/sessions/${session_id}/materials/00000000-0000-4000-8000-0000000000aa/recording.mp3`, "b".repeat(64), added_by],
  );
  await tx.q(`update public.materials set current_version_id = $2 where id = $1`, [id, version]);
  return id;
}

describe("POL-claims.inactive_carries_no_org", () => {
  it("★ a deactivated member's token reaches no row of their org; an active member's does", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      expect((await tx.q(`select id from public.members`)).length).toBeGreaterThan(0);
      await tx.as({ ...f.a.admin.claims, status: "deactivated" });
      expect(await tx.q(`select id from public.members`)).toEqual([]);
      expect(await tx.q(`select id from public.org_settings`)).toEqual([]);
      expect(await tx.q(`select public.is_org_admin() as admin`)).toEqual([{ admin: false }]);
    });
  });

  it("★ every member of a suspended org reaches nothing — and cannot write the org's settings", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as({ ...f.a.admin.claims, org_status: "suspended" });
      expect(await tx.q(`select id from public.members`)).toEqual([]);
      expect(await tx.q(`select id from public.scoring_rules`)).toEqual([]);
      expect(await tx.q(`update public.org_settings set time_zone = time_zone returning id`)).toEqual([]);
    });
  });
});

// ★ 0214 (DEC-268) reverses 0212's «a platform admin is never a member»: the owner had asked for the opposite.
describe("POL-auth_hook.platform_admin_may_be_member", () => {
  it("★ a platform admin with a member row gets that row's claims, and keeps platform_admin", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const [{ id }] = await tx.q<{ id: string }>(
        `insert into public.members (org_id, auth_user_id, email, display_name, org_role) values ($1, $2, $3, 'مشرف المنصة', 'admin') returning id`,
        [f.a.id, f.platformAdmin.authUserId, f.platformAdmin.email],
      );
      const app = await hook(tx, f.platformAdmin.authUserId);
      expect(app).toMatchObject({ platform_admin: true, org_id: f.a.id, member_id: id, org_role: "admin", status: "active" });
    });
  });

  it("★ provision_member() provisions a platform admin whose address an org lists, like anyone else", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const [{ domain }] = await tx.q<{ domain: string }>(`select split_part($1, '@', 2) as domain`, [f.platformAdmin.email]);
      await tx.q(`insert into public.org_domains (org_id, domain) values ($1, $2) on conflict do nothing`, [f.a.id, domain]);
      await tx.as({ sub: f.platformAdmin.authUserId, platform_admin: true });
      const [{ out }] = await tx.q<{ out: { status: string; org_id?: string } }>(`select public.provision_member() as out`);
      expect(out).toMatchObject({ status: "provisioned", org_id: f.a.id });
    });
  });

  it("an ordinary member's claims are unchanged", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      expect(await hook(tx, f.a.admin.authUserId)).toMatchObject({ org_id: f.a.id, member_id: f.a.admin.memberId, org_role: "admin", status: "active" });
    });
  });
});

describe("POL-realtime.session_insert_dropped", () => {
  it("★ a member cannot broadcast on a session's topic; reading it is unchanged", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const [{ id }] = await tx.q<{ id: string }>(`select id from public.sessions where org_id = $1 limit 1`, [f.a.id]);
      await tx.as(f.a.members[1].claims);
      expect(
        await errorCode(() => tx.q(`insert into realtime.messages (topic, extension, event, payload) values ($1, 'broadcast', 'INSERT', '{}')`, [`session:${id}`])),
      ).toBe(PERMISSION_DENIED);
    });
  });
});

describe("POL-org_domains.not_another_orgs", () => {
  it("★ an org admin cannot add a domain another org holds; adding a new one of their own still works", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`insert into public.org_domains (org_id, domain) values ($1, $2)`, [f.a.id, f.b.domain]))).toBe("23505");
      expect(await tx.q(`insert into public.org_domains (org_id, domain) values ($1, 'second.kareem-one.example') returning domain`, [f.a.id])).toEqual([
        { domain: "second.kareem-one.example" },
      ]);
    });
  });

  it("the platform still puts one domain on two lists — the choose-org case", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as({ sub: f.platformAdmin.authUserId, platform_admin: true });
      await tx.asOwner();
      expect(await tx.q(`insert into public.org_domains (org_id, domain) values ($1, $2) returning domain`, [f.a.id, f.b.domain])).toHaveLength(1);
    });
  });
});

describe("POL-photos.download_staff_only", () => {
  it("★ a member sees a photograph and cannot download it; staff can", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const photo = f.m5.a.photoId;
      await tx.as(f.a.members[1].claims);
      expect((await tx.q(`select id from public.photos where id = $1`, [photo])).length).toBe(1);
      expect(await errorCode(() => tx.q(`select * from public.record_photo_download($1)`, [photo]))).toBe(PERMISSION_DENIED);
      await tx.as(f.a.mod.claims);
      expect(await tx.q(`select * from public.record_photo_download($1)`, [photo])).toHaveLength(1);
    });
  });
});

describe("POL-materials_storage.read_by_path", () => {

  it("★ a member never reads a PDF's original — download on or off — and staff and its presenter do", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const path = await object(tx, f.a.id, f.m5.a.materialId);
      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select name from storage.objects where name = $1`, [path])).toEqual([]);
      await tx.as(f.a.mod.claims);
      expect(await tx.q(`select name from storage.objects where name = $1`, [path])).toEqual([{ name: path }]);
      await tx.as(f.a.members[0].claims); // the session's presenter
      expect(await tx.q(`select name from storage.objects where name = $1`, [path])).toEqual([{ name: path }]);
    });
  });

  it("★ a member streams an audio recording with listening allowed — matched by its stored path, whatever its id", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const audio = await audioMaterial(tx, f.a.id, f.m5.a.materialId);
      const path = await object(tx, f.a.id, audio);
      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select name from storage.objects where name = $1`, [path])).toEqual([{ name: path }]);
      await tx.asOwner();
      await tx.q(`update public.materials set allow_download = false where id = $1`, [audio]);
      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select name from storage.objects where name = $1`, [path])).toEqual([]);
    });
  });

  it("another org's member reads nothing", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const audio = await audioMaterial(tx, f.a.id, f.m5.a.materialId);
      const path = await object(tx, f.a.id, audio);
      await tx.as(f.b.admin.claims);
      expect(await tx.q(`select name from storage.objects where name = $1`, [path])).toEqual([]);
    });
  });
});

describe("POL-materials_storage.delete_unrecorded", () => {
  it("★ an uploader deletes their own object no version records; never a recorded one, never another's", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const presenter = f.a.members[0];
      await tx.asOwner();
      const [{ session_id }] = await tx.q<{ session_id: string }>(`select session_id from public.materials where id = $1`, [f.m5.a.materialId]);
      const loose = `${f.a.id}/sessions/${session_id}/materials/00000000-0000-4000-8000-000000000001/rejected.pdf`;
      const theirs = `${f.a.id}/sessions/${session_id}/materials/00000000-0000-4000-8000-000000000002/other.pdf`;
      await tx.q(`insert into storage.objects (bucket_id, name, owner_id) values ('materials', $1, $2), ('materials', $3, $4)`, [
        loose,
        presenter.authUserId,
        theirs,
        f.a.mod.authUserId,
      ]);
      const recorded = await object(tx, presenter.authUserId, f.m5.a.materialId);
      await tx.as(presenter.claims);
      // The Storage API sets this flag on its own connection before it deletes; a raw delete is refused without it.
      await tx.q(`select set_config('storage.allow_delete_query', 'true', true)`);
      expect(await tx.q(`delete from storage.objects where name = $1 returning name`, [loose])).toEqual([{ name: loose }]);
      expect(await tx.q(`delete from storage.objects where name = $1 returning name`, [theirs])).toEqual([]);
      expect(await tx.q(`delete from storage.objects where name = $1 returning name`, [recorded])).toEqual([]);
    });
  });
});

describe("finalize_material_upload — the path is held to the builder's shape", () => {
  it("★ a path outside this material's session folder is refused; the builder's shape is accepted", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const [{ session_id }] = await tx.q<{ session_id: string }>(`select session_id from public.materials where id = $1`, [f.m5.a.materialId]);
      await tx.as(f.a.admin.claims);
      const call = (path: string) =>
        tx.q(`select id from public.finalize_material_upload($1, $2, 10, 'application/pdf', $3)`, [f.m5.a.materialId, path, "a".repeat(64)]);
      expect(await errorCode(() => call(`${f.a.id}/sessions/${session_id}/photos/x.pdf`))).toBe(PERMISSION_DENIED);
      expect(await errorCode(() => call(`${f.b.id}/sessions/${session_id}/materials/00000000-0000-4000-8000-000000000003/x.pdf`))).toBe(PERMISSION_DENIED);
      expect(await call(`${f.a.id}/sessions/${session_id}/materials/00000000-0000-4000-8000-000000000003/x.pdf`)).toHaveLength(1);
    });
  });
});
